// Tells the Notification service about things that happened here, by posting messages to
// RabbitMQ. The messages are described in backend/notification-service/EVENTS.md.
//
// Booking never waits for the email and never fails because of it. The routes call these
// functions without `await`: if RabbitMQ is unreachable, the booking or the slot is still saved
// and the user still gets their answer; we only log that the message was not sent.
const crypto = require('crypto');
const amqp = require('amqplib');
const config = require('./config');

const EXCHANGE = 'booking.events';

let connection;
let channel = null; // null while RabbitMQ is unreachable

// Opens the connection. If RabbitMQ is not up yet, Booking still starts and keeps trying.
async function connect() {
  connection = await amqp.connect(config.rabbitUrl, {
    recovery: {
      initialDelay: 1000,
      maxDelay: 30_000,
      maxRetries: Infinity,
      initialMaxRetries: Infinity,
      waitForConnect: false,
      async setup(model) {
        const confirmChannel = await model.createConfirmChannel();
        // Notification creates the same exchange, so it does not matter which starts first.
        await confirmChannel.assertExchange(EXCHANGE, 'topic', { durable: true });
        channel = confirmChannel;
      },
    },
  });
  connection.on('connect', () => console.log('Connected to RabbitMQ'));
  connection.on('disconnect', (err) => {
    channel = null;
    console.warn(`Lost RabbitMQ: ${err?.message ?? 'closed'}. Reconnecting...`);
  });
  connection.on('error', (err) => console.error(`RabbitMQ error: ${err.message}`));
}

const close = () => connection?.close().catch(() => {});

// Posts one message and waits for RabbitMQ to confirm it has stored it. Never throws.
async function publish(routingKey, event) {
  try {
    if (!channel) throw new Error('RabbitMQ is not connected');
    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      contentType: 'application/json',
      messageId: event.eventId,
    });
    await channel.waitForConfirms();
  } catch (err) {
    console.error(`Could not send ${event.type} ${event.eventId}: ${err.message}`);
  }
}

// A booking was made: Notification sends that user the confirmation email.
// `user` is req.user (from the login token), `slot` is the booked slot row.
function bookingConfirmed(appointment, slot, user) {
  return publish('booking.confirmed', {
    eventId: crypto.randomUUID(),
    type: 'BookingConfirmed',
    version: 1,
    occurredAt: appointment.createdAt.toISOString(),
    appointmentId: appointment.appointmentId,
    userId: user.id,
    userEmail: user.email,
    ...(user.name ? { userName: user.name } : {}),
    country: slot.country,
    visaType: slot.visaType,
    day: slot.day,
    slotTime: slot.slotTime,
  });
}

// An admin added a slot: Notification tells the people who booked that country and visa type.
function slotsOpened(slot) {
  return publish('booking.slots-opened', {
    eventId: crypto.randomUUID(),
    type: 'SlotsOpened',
    version: 1,
    occurredAt: slot.createdAt.toISOString(),
    country: slot.country,
    visaType: slot.visaType,
    day: slot.day,
    slotTimes: [slot.slotTime],
  });
}

module.exports = { connect, close, bookingConfirmed, slotsOpened };
