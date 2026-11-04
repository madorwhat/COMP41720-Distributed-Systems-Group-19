// Pretends to be Booking: publishes BookingConfirmed messages exactly as Booking will, so we can
// test and demo this service before Booking publishes anything.
//
// Every email is a REAL email now, so a booking needs --email with a real address (it gets the
// confirmation and, later, the reminder):
//   npm run publish-test-event -- --email you@gmail.com            one booking for tomorrow
//   npm run publish-test-event -- --email you@gmail.com --count 20   20 bookings = 20 real emails!
//   npm run publish-test-event -- --email you@gmail.com --duplicate  the same message twice (expect 1 email)
//   npm run publish-test-event -- --invalid                        a broken message (goes to the DLQ)
//   npm run publish-test-event -- --email you@gmail.com --day 2026-10-30 --time "12:00 - 13:00"
//
// "New appointments are open" (what Booking publishes when an admin adds slots). The people who
// get the email are the ones who subscribed to that country and visa type (PUT
// /subscriptions/:country/:visaType with a login token), so subscribe first:
//   npm run publish-test-event -- --slots-opened --country UK --visa-type Student
//   npm run publish-test-event -- --slots-opened --times "09:00 - 10:00,12:00 - 13:00,16:00 - 17:00"
//   npm run publish-test-event -- --slots-opened --duplicate    the same message twice (expect 1 email each)
//   npm run publish-test-event -- --slots-opened --invalid      a broken message (goes to the DLQ)
const crypto = require('crypto');
const { parseArgs } = require('util');
const amqp = require('amqplib');
const config = require('../src/config');
const events = require('../src/consumer/messages');
const { dublinClock, nextDay } = require('../src/reminders/time');

const { values: args } = parseArgs({
  options: {
    count: { type: 'string', default: '1' },
    duplicate: { type: 'boolean', default: false },
    invalid: { type: 'boolean', default: false },
    email: { type: 'string' },
    name: { type: 'string', default: 'Test User' },
    country: { type: 'string', default: 'Schengen' },
    'visa-type': { type: 'string', default: 'Tourist' },
    day: { type: 'string', default: nextDay(dublinClock(new Date()).date) },
    time: { type: 'string', default: '09:00 - 10:00' },
    'slots-opened': { type: 'boolean', default: false },
    times: { type: 'string', default: '09:00 - 10:00,12:00 - 13:00' },
  },
});

// Every email is real now, and the confirmation goes to this address, so there is no default: a
// made-up address could only bounce. (Slots-opened messages carry no address, and neither does a
// deliberately broken message.)
if (!args.email && !args['slots-opened'] && !args.invalid) {
  console.error('Pass the address that should get the email: --email you@gmail.com');
  process.exit(1);
}

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

const makeSlotsEvent = () => ({
  eventId: crypto.randomUUID(),
  type: 'SlotsOpened',
  version: 1,
  occurredAt: new Date().toISOString(),
  country: args.country,
  visaType: args['visa-type'],
  day: args.day,
  slotTimes: args.times.split(',').map((time) => time.trim()),
});

async function main() {
  const connection = await amqp.connect(config.rabbitUrl);
  const channel = await connection.createConfirmChannel();
  await events.assertTopology(channel);

  const publish = (body, routingKey = events.BOOKING_CONFIRMED.routingKey) =>
    channel.publish(events.EXCHANGE, routingKey, Buffer.from(JSON.stringify(body)), {
      persistent: true,
      contentType: 'application/json',
      messageId: body.eventId,
    });

  if (args['slots-opened']) {
    const key = events.SLOTS_OPENED.routingKey;
    if (args.invalid) {
      publish({ type: 'SlotsOpened', hello: 'this is not a valid message' }, key);
      console.log('Published 1 invalid slots-opened message');
    } else {
      const event = makeSlotsEvent();
      publish(event, key);
      if (args.duplicate) publish(event, key);
      console.log(
        `Published slots-opened ${event.eventId}: ${event.country} ${event.visaType} on ` +
          `${event.day}, ${event.slotTimes.length} slot(s)`,
      );
    }
  } else if (args.invalid) {
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
