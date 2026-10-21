// Runs the reminder job every 15 minutes on the Dublin clock, so the first run of the day that
// finds reminders due is exactly 9:00. It also runs once at startup, which sends any reminder
// that fell due while the service was off.
const cron = require('node-cron');
const config = require('./config');
const { sendDueReminders } = require('./notifications');

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

module.exports = { start, stop };
