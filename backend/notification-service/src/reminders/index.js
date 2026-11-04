// The reminder emails: at 9 am Irish time on the day before an appointment.
//
// The job runs every 15 minutes on the Dublin clock, so the first run of the day that finds
// reminders due is exactly 9:00. It also runs once at startup, which sends any reminder that fell
// due while the service was off.
const cron = require('node-cron');
const { Op } = require('sequelize');
const config = require('../config');
const { sequelize, Notification } = require('../db');
const { sendReminder } = require('../mailer');
const metrics = require('../metrics');
const { dublinClock, nextDay, isReminderDue } = require('./time');

// Sends every reminder that is due and not yet sent. SKIP LOCKED means that if two copies of this
// service run at once, each row is handled by only one of them. Returns how many were sent.
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

let task;

async function run() {
  try {
    const sent = await sendDueReminders();
    if (sent) console.log(`Sent ${sent} reminder(s)`);
  } catch (err) {
    console.error(`Reminder job failed: ${err.message}`);
  }
}

function start() {
  task = cron.schedule('*/15 * * * *', run, {
    name: 'reminders',
    timezone: config.timeZone,
    noOverlap: true, // if a run is slow, skip the next tick instead of running two at once
  });
  return run();
}

const stop = () => task?.stop();

module.exports = { start, stop, sendDueReminders };
