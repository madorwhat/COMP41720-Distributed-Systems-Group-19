// The two jobs of this service: the confirmation email and the reminder email.
// Both use the same pattern: lock the appointment's row, check the "sent" tick, send, set the tick.
//
// The order matters. We send first and set the tick after. If the service crashes in between,
// the email goes out a second time when the message comes back. We chose that over the other
// order (tick first, then send), where a crash means the email is never sent at all.
const { Op } = require('sequelize');
const { sequelize, Notification } = require('./db');
const { sendConfirmation, sendReminder } = require('./mailer');
const { dublinClock, nextDay, isReminderDue } = require('./time');
const metrics = require('./metrics');

// Returns 'sent', or 'duplicate' when this appointment was already emailed.
async function handleBookingConfirmed(event) {
  // Save the booking first, in its own step. Even if the email then fails, the reminder job
  // already knows about this appointment. ignoreDuplicates = INSERT ... ON CONFLICT DO NOTHING.
  await Notification.bulkCreate(
    [
      {
        appointmentId: event.appointmentId,
        userEmail: event.userEmail,
        userName: event.userName,
        country: event.country,
        visaType: event.visaType,
        day: event.day,
        slotTime: event.slotTime,
      },
    ],
    { ignoreDuplicates: true },
  );

  // The row lock makes a second copy of the same message wait here until the first is done.
  // It then sees the tick and stops, so two copies arriving together still send one email.
  return sequelize.transaction(async (transaction) => {
    const n = await Notification.findByPk(event.appointmentId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (n.confirmationSentAt) return 'duplicate';
    await sendConfirmation(n);
    await n.update({ confirmationSentAt: new Date() }, { transaction });
    return 'sent';
  });
}

// Sends every reminder that is due and not yet sent. Runs every 15 minutes and at startup.
// SKIP LOCKED means that if two copies of this service run at once, each row is handled by
// only one of them. Returns how many reminders were sent.
async function sendDueReminders(now = new Date()) {
  const today = dublinClock(now).date;
  const candidates = await Notification.findAll({
    where: { reminderSentAt: null, day: { [Op.in]: [today, nextDay(today)] } },
    order: [['day', 'ASC']],
  });

  let sent = 0;
  for (const candidate of candidates.filter((n) => isReminderDue(n, now))) {
    try {
      const done = await sequelize.transaction(async (transaction) => {
        const n = await Notification.findByPk(candidate.appointmentId, {
          lock: transaction.LOCK.UPDATE,
          skipLocked: true,
          transaction,
        });
        if (!n || n.reminderSentAt) return false; // someone else has it, or it went out already
        await sendReminder(n);
        await n.update({ reminderSentAt: new Date() }, { transaction });
        return true;
      });
      if (done) sent += 1;
    } catch (err) {
      // One failed email shouldn't stop the rest. This one is tried again on the next run.
      console.error(`Reminder for ${candidate.appointmentId} failed: ${err.message}`);
    }
  }
  metrics.reminderJobLastRun.setToCurrentTime();
  return sent;
}

module.exports = { handleBookingConfirmed, sendDueReminders };
