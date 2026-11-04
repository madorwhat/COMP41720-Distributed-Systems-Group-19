// Small date helpers that work in Irish time. They take "now" as an argument so the tests can
// pretend it is any moment, for example the night the clocks go back.
const config = require('../config');

// The date and time on a clock in Dublin at that moment, e.g. { date: '2026-10-25', time: '00:30' }.
function dublinClock(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

// '2026-10-24' -> '2026-10-25'. Pure calendar maths, so clock changes don't matter.
function nextDay(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Is the reminder for this appointment due right now?
// - The normal case: it is the day before, and 9 am Dublin time has passed.
// - The late case: we missed the day before (the service was off), but the appointment is
//   today and hasn't started yet. A late reminder is better than none.
// Appointments that have already started never get a reminder.
function isReminderDue({ day, slotTime }, now) {
  const clock = dublinClock(now);
  const reminderTime = `${String(config.reminderHour).padStart(2, '0')}:00`;
  if (day === nextDay(clock.date)) return clock.time >= reminderTime;
  if (day === clock.date) return slotTime.slice(0, 5) > clock.time;
  return false;
}

module.exports = { dublinClock, nextDay, isReminderDue };
