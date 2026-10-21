// Pretends to be Booking: publishes BookingConfirmed messages exactly as Booking will, so we can
// test and demo this service before Booking publishes anything.
//
//   npm run publish-test-event                            one booking for tomorrow
//   npm run publish-test-event -- --count 20              20 different bookings
//   npm run publish-test-event -- --duplicate             the same message twice (expect 1 email)
//   npm run publish-test-event -- --invalid               a broken message (goes to the DLQ)
//   npm run publish-test-event -- --day 2026-10-30 --time "12:00 - 13:00" --email a@b.com
const crypto = require('crypto');
const { parseArgs } = require('util');
const amqp = require('amqplib');
const config = require('../src/config');
const events = require('../src/events');
const { dublinClock, nextDay } = require('../src/time');

const { values: args } = parseArgs({
  options: {
    count: { type: 'string', default: '1' },
    duplicate: { type: 'boolean', default: false },
    invalid: { type: 'boolean', default: false },
    email: { type: 'string', default: 'test.user@example.com' },
    name: { type: 'string', default: 'Test User' },
    country: { type: 'string', default: 'Schengen' },
    'visa-type': { type: 'string', default: 'Tourist' },
    day: { type: 'string', default: nextDay(dublinClock(new Date()).date) },
    time: { type: 'string', default: '09:00 - 10:00' },
  },
});

const makeEvent = () => ({
  eventId: crypto.randomUUID(),
  type: 'BookingConfirmed',
  version: 1,
  occurredAt: new Date().toISOString(),
  appointmentId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  userEmail: args.email,
  userName: args.name,
  country: args.country,
  visaType: args['visa-type'],
  day: args.day,
  slotTime: args.time,
});

async function main() {
  const connection = await amqp.connect(config.rabbitUrl);
  const channel = await connection.createConfirmChannel();
  await events.assertTopology(channel);

  const publish = (body) =>
    channel.publish(events.EXCHANGE, events.ROUTING_KEY, Buffer.from(JSON.stringify(body)), {
      persistent: true,
      contentType: 'application/json',
      messageId: body.eventId,
    });

  if (args.invalid) {
    publish({ type: 'BookingConfirmed', hello: 'this is not a valid message' });
    console.log('Published 1 invalid message');
  } else {
    for (let i = 0; i < Number(args.count); i += 1) {
      const event = makeEvent();
      publish(event);
      if (args.duplicate) publish(event);
      console.log(
        `Published appointment ${event.appointmentId} for ${event.day} ${event.slotTime}`,
      );
    }
  }
  await channel.waitForConfirms();
  await connection.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
