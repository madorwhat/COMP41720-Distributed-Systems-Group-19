// A booking was confirmed: send that person the confirmation email.
//
// The pattern: lock the appointment's row, check the "sent" tick, send, set the tick.
// The order matters. We send first and set the tick after. If the service crashes in between,
// the email goes out a second time when the message comes back. We chose that over the other
// order (tick first, then send), where a crash means the email is never sent at all.
const { sequelize, Notification } = require('../db');
const { sendConfirmation } = require('../mailer');

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

module.exports = { handleBookingConfirmed };
