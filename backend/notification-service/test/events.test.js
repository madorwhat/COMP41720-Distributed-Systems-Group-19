const test = require('node:test');
const assert = require('node:assert');
const { bookingConfirmed } = require('../src/consumer/messages');

const valid = {
  eventId: '6f1c1d2e-8a4b-4c3d-9e5f-1a2b3c4d5e6f',
  type: 'BookingConfirmed',
  version: 1,
  occurredAt: '2026-10-21T10:15:00.000Z',
  appointmentId: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d',
  userId: '00000000-0000-4000-8000-000000000001',
  userEmail: 'student@example.com',
  userName: 'Student',
  country: 'Schengen',
  visaType: 'Student',
  day: '2026-10-28',
  slotTime: '09:00 - 10:00',
};

test('accepts a valid BookingConfirmed message', () => {
  assert.deepStrictEqual(bookingConfirmed.parse(valid), valid);
});

test('userName is optional', () => {
  assert.ok(bookingConfirmed.safeParse({ ...valid, userName: undefined }).success);
});

test('rejects messages that would break an email', () => {
  const broken = [
    { ...valid, userEmail: 'not-an-email' },
    { ...valid, appointmentId: undefined },
    { ...valid, country: 'France' },
    { ...valid, day: '28/10/2026' },
    { ...valid, slotTime: '9am' },
    { ...valid, version: 2 },
  ];
  for (const message of broken)
    assert.strictEqual(bookingConfirmed.safeParse(message).success, false);
});
