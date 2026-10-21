const test = require('node:test');
const assert = require('node:assert');
const { dublinClock, nextDay, isReminderDue } = require('../src/time');

const at = (iso) => new Date(iso);
const appointment = (day, slotTime = '12:00 - 13:00') => ({ day, slotTime });

test('Dublin clock is UTC+1 in summer time and UTC+0 after the clocks go back', () => {
  // Clocks go back at 02:00 Irish time on Sunday 25 October 2026.
  assert.deepStrictEqual(dublinClock(at('2026-10-24T23:30:00Z')), {
    date: '2026-10-25',
    time: '00:30',
  });
  assert.deepStrictEqual(dublinClock(at('2026-10-25T23:30:00Z')), {
    date: '2026-10-25',
    time: '23:30',
  });
});

test('nextDay crosses months, years and the clock change', () => {
  assert.strictEqual(nextDay('2026-10-24'), '2026-10-25');
  assert.strictEqual(nextDay('2026-10-25'), '2026-10-26');
  assert.strictEqual(nextDay('2026-10-31'), '2026-11-01');
  assert.strictEqual(nextDay('2026-12-31'), '2027-01-01');
});

test('reminder for tomorrow is due from 9 am Dublin time, in summer time', () => {
  // 07:59 UTC is 08:59 in Dublin on 24 October.
  assert.strictEqual(isReminderDue(appointment('2026-10-25'), at('2026-10-24T07:59:00Z')), false);
  assert.strictEqual(isReminderDue(appointment('2026-10-25'), at('2026-10-24T08:00:00Z')), true);
});

test('reminder for tomorrow is due from 9 am Dublin time, after the clocks go back', () => {
  // On 25 October Dublin is back on UTC+0, so 9 am Dublin is 09:00 UTC.
  assert.strictEqual(isReminderDue(appointment('2026-10-26'), at('2026-10-25T08:30:00Z')), false);
  assert.strictEqual(isReminderDue(appointment('2026-10-26'), at('2026-10-25T09:00:00Z')), true);
});

test('a missed reminder is still sent on the day, until the appointment starts', () => {
  // 10:00 Dublin time on the appointment day.
  const now = at('2026-11-02T10:00:00Z');
  assert.strictEqual(isReminderDue(appointment('2026-11-02', '12:00 - 13:00'), now), true);
  assert.strictEqual(isReminderDue(appointment('2026-11-02', '09:00 - 10:00'), now), false);
});

test('no reminder for appointments further away or in the past', () => {
  const now = at('2026-11-02T10:00:00Z');
  assert.strictEqual(isReminderDue(appointment('2026-11-04'), now), false);
  assert.strictEqual(isReminderDue(appointment('2026-11-01'), now), false);
});
