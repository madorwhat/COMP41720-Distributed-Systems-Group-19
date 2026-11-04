const test = require('node:test');
const assert = require('node:assert');
const { slotsOpened, bookingConfirmed, STREAMS, retryQueue } = require('../src/consumer/messages');
const { composeSlotsOpened } = require('../src/mailer');

const valid = {
  eventId: '6f1c1d2e-8a4b-4c3d-9e5f-1a2b3c4d5e6f',
  type: 'SlotsOpened',
  version: 1,
  occurredAt: '2026-11-04T10:15:00.000Z',
  country: 'Schengen',
  visaType: 'Tourist',
  day: '2026-11-10',
  slotTimes: ['09:00 - 10:00', '12:00 - 13:00'],
};

test('accepts a valid SlotsOpened message', () => {
  assert.deepStrictEqual(slotsOpened.parse(valid), valid);
});

test('rejects SlotsOpened messages that would break an email', () => {
  const broken = [
    { ...valid, slotTimes: [] },
    { ...valid, slotTimes: ['9am'] },
    { ...valid, slotTimes: undefined },
    { ...valid, country: 'France' },
    { ...valid, visaType: 'Holiday' },
    { ...valid, day: '10/11/2026' },
    { ...valid, type: 'BookingConfirmed' },
    { ...valid, version: 2 },
  ];
  for (const message of broken) assert.strictEqual(slotsOpened.safeParse(message).success, false);
});

test('the two kinds of message cannot be mixed up', () => {
  assert.strictEqual(bookingConfirmed.safeParse(valid).success, false);
});

test('every kind of message has its own queue and its own retry queues', () => {
  const names = STREAMS.flatMap((s) => [s.queue, retryQueue(s, 5000), retryQueue(s, 120000)]);
  assert.strictEqual(new Set(names).size, names.length);
  // These are the original names. RabbitMQ refuses to re-declare a queue with different settings,
  // so changing them would break a Notification service that already has these queues.
  assert.strictEqual(STREAMS[0].queue, 'notification.booking-confirmed');
  assert.strictEqual(retryQueue(STREAMS[0], 5000), 'notification.retry.5s');
});

test('the email says what is open and when', () => {
  const { subject, text } = composeSlotsOpened({ userName: 'Madhura' }, valid, '');
  assert.strictEqual(subject, 'New Schengen Tourist visa appointments are open');
  assert.match(text, /^Hello Madhura,/);
  assert.match(
    text,
    /Schengen Tourist visa appointments are now open on 2026-11-10 \(Irish time\)/,
  );
  assert.match(text, /\n {2}- 09:00 - 10:00\n {2}- 12:00 - 13:00\n/);
  assert.match(text, /You are getting this because you asked to be told when Schengen Tourist/);
  assert.ok(!text.includes('http'), 'no link when no website address is set');
});

test('the email greets "there" without a name, and adds the website address when set', () => {
  const { text } = composeSlotsOpened({ userName: null }, valid, 'https://visas.example.com');
  assert.match(text, /^Hello there,/);
  assert.match(text, /book yours soon\.\nhttps:\/\/visas\.example\.com\n\nYou are getting this/);
  assert.match(text, /appointments open\.\n\nBook My Visa$/);
});
