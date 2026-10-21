// The messages we accept from Booking, and the RabbitMQ names we use. EVENTS.md explains the
// same thing for the Booking team; keep the two in step.
const { z } = require('zod');

const EXCHANGE = 'booking.events'; // Booking publishes here
const ROUTING_KEY = 'booking.confirmed';
const QUEUE = 'notification.booking-confirmed'; // our post box
const DEAD_LETTER_QUEUE = 'notification.dlq'; // messages we gave up on, kept for a human to look at
// When an email fails we try again after these waits, then give up.
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
const retryQueue = (ms) => `notification.retry.${ms / 1000}s`;

const bookingConfirmed = z.object({
  eventId: z.uuid(),
  type: z.literal('BookingConfirmed'),
  version: z.literal(1),
  occurredAt: z.iso.datetime({ offset: true }),
  appointmentId: z.uuid(),
  userId: z.uuid(),
  userEmail: z.email(),
  userName: z.string().trim().max(100).optional(),
  country: z.enum(['Schengen', 'UK', 'Irish']),
  visaType: z.enum(['Student', 'Business', 'Tourist']),
  day: z.iso.date(),
  slotTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d - (?:[01]\d|2[0-3]):[0-5]\d$/),
});

// Creates the exchange, queues and bindings if they don't exist yet. Safe to run every time.
// A message that waits out its time in a retry queue is sent back to the main queue by RabbitMQ.
async function assertTopology(channel) {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  for (const ms of RETRY_DELAYS_MS) {
    await channel.assertQueue(retryQueue(ms), {
      durable: true,
      arguments: {
        'x-message-ttl': ms,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': QUEUE,
      },
    });
  }
}

module.exports = {
  EXCHANGE,
  ROUTING_KEY,
  QUEUE,
  DEAD_LETTER_QUEUE,
  RETRY_DELAYS_MS,
  retryQueue,
  bookingConfirmed,
  assertTopology,
};
