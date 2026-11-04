// The messages we accept from Booking, and the RabbitMQ names we use. EVENTS.md explains the
// same thing for the Booking team; keep the two in step.
const { z } = require('zod');
const { country, visaType } = require('../choices');

const EXCHANGE = 'booking.events'; // Booking publishes here
const DEAD_LETTER_QUEUE = 'notification.dlq'; // messages we gave up on, kept for a human to look at
// When an email fails we try again after these waits, then give up.
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

const timeRange = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d - (?:[01]\d|2[0-3]):[0-5]\d$/);

// A booking was confirmed: send that person the confirmation email (and, later, the reminder).
const bookingConfirmed = z.object({
  eventId: z.uuid(),
  type: z.literal('BookingConfirmed'),
  version: z.literal(1),
  occurredAt: z.iso.datetime({ offset: true }),
  appointmentId: z.uuid(),
  userId: z.uuid(),
  userEmail: z.email(),
  userName: z.string().trim().max(100).optional(),
  country,
  visaType,
  day: z.iso.date(),
  slotTime: timeRange,
});

// An admin opened new slots: tell the people who might want one. Which people is decided here,
// from the subscriptions people made for that country and visa type, not by Booking.
const slotsOpened = z.object({
  eventId: z.uuid(),
  type: z.literal('SlotsOpened'),
  version: z.literal(1),
  occurredAt: z.iso.datetime({ offset: true }),
  country,
  visaType,
  day: z.iso.date(),
  slotTimes: z.array(timeRange).min(1).max(24),
});

// Each kind of message we listen for has its own queue, its own retry queues and its own schema.
// The booking-confirmed names below are the original ones; they must not change, because RabbitMQ
// refuses to re-declare an existing queue with different settings.
const BOOKING_CONFIRMED = {
  name: 'booking-confirmed',
  routingKey: 'booking.confirmed',
  queue: 'notification.booking-confirmed', // our post box
  retryPrefix: 'notification.retry',
  schema: bookingConfirmed,
};
const SLOTS_OPENED = {
  name: 'slots-opened',
  routingKey: 'booking.slots-opened',
  queue: 'notification.slots-opened',
  retryPrefix: 'notification.slots-opened.retry',
  schema: slotsOpened,
};
const STREAMS = [BOOKING_CONFIRMED, SLOTS_OPENED];

const retryQueue = (stream, ms) => `${stream.retryPrefix}.${ms / 1000}s`;

// Creates the exchange, queues and bindings if they don't exist yet. Safe to run every time.
// A message that waits out its time in a retry queue is sent back to its main queue by RabbitMQ.
async function assertTopology(channel) {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  for (const stream of STREAMS) {
    await channel.assertQueue(stream.queue, { durable: true });
    await channel.bindQueue(stream.queue, EXCHANGE, stream.routingKey);
    for (const ms of RETRY_DELAYS_MS) {
      await channel.assertQueue(retryQueue(stream, ms), {
        durable: true,
        arguments: {
          'x-message-ttl': ms,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': stream.queue,
        },
      });
    }
  }
}

module.exports = {
  EXCHANGE,
  DEAD_LETTER_QUEUE,
  RETRY_DELAYS_MS,
  BOOKING_CONFIRMED,
  SLOTS_OPENED,
  STREAMS,
  retryQueue,
  bookingConfirmed,
  slotsOpened,
  assertTopology,
};
