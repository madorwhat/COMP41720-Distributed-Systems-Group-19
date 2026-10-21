// Listens to RabbitMQ for BookingConfirmed messages.
//
// - A message is only removed from the queue (acked) after we have finished with it. If we crash
//   halfway, RabbitMQ gives it to us again.
// - A message that isn't a valid BookingConfirmed goes straight to the dead letter queue. Trying
//   it again would never help.
// - If sending fails, the message waits in a retry queue (5 s, then 30 s, then 2 min) and comes
//   back. After the last try it goes to the dead letter queue.
// - If RabbitMQ goes away, amqplib keeps reconnecting and runs setup() again each time.
const amqp = require('amqplib');
const config = require('./config');
const events = require('./events');
const { handleBookingConfirmed } = require('./notifications');
const metrics = require('./metrics');

let connection;
let connected = false;

// Puts a copy of the message on another queue and waits until RabbitMQ has stored it.
// Only then do we ack the original, so the message is never lost between the two.
async function moveTo(channel, queue, msg, headers) {
  channel.sendToQueue(queue, msg.content, {
    persistent: true,
    contentType: msg.properties.contentType,
    messageId: msg.properties.messageId,
    headers: { ...msg.properties.headers, ...headers },
  });
  await channel.waitForConfirms();
  channel.ack(msg);
}

async function onMessage(channel, msg) {
  let event;
  try {
    event = events.bookingConfirmed.parse(JSON.parse(msg.content.toString()));
  } catch (err) {
    const reason =
      err.issues?.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') ??
      err.message;
    console.error(`Invalid message, moved to ${events.DEAD_LETTER_QUEUE}: ${reason}`);
    metrics.messagesConsumed.inc({ result: 'dead_letter' });
    return moveTo(channel, events.DEAD_LETTER_QUEUE, msg, { 'x-error': 'invalid message' });
  }

  try {
    const result = await handleBookingConfirmed(event);
    if (result === 'sent') {
      metrics.confirmationDelay.observe((Date.now() - Date.parse(event.occurredAt)) / 1000);
    }
    metrics.messagesConsumed.inc({ result });
    channel.ack(msg);
  } catch (err) {
    const attempt = Number(msg.properties.headers?.['x-retry-count']) || 0;
    const headers = { 'x-retry-count': attempt + 1, 'x-error': err.message };
    if (attempt < events.RETRY_DELAYS_MS.length) {
      const queue = events.retryQueue(events.RETRY_DELAYS_MS[attempt]);
      console.warn(`Appointment ${event.appointmentId}: ${err.message}. Trying again via ${queue}`);
      metrics.messagesConsumed.inc({ result: 'retry' });
      return moveTo(channel, queue, msg, headers);
    }
    console.error(`Appointment ${event.appointmentId}: giving up, moved to the dead letter queue`);
    metrics.messagesConsumed.inc({ result: 'dead_letter' });
    return moveTo(channel, events.DEAD_LETTER_QUEUE, msg, headers);
  }
}

async function start() {
  connection = await amqp.connect(config.rabbitUrl, {
    recovery: {
      initialDelay: 1000,
      maxDelay: 30_000,
      maxRetries: Infinity,
      initialMaxRetries: Infinity,
      // Start the service even if RabbitMQ isn't up yet; messages wait there until we connect.
      waitForConnect: false,
      async setup(model) {
        const channel = await model.createConfirmChannel();
        await events.assertTopology(channel);
        await channel.prefetch(config.prefetch);
        await channel.consume(events.QUEUE, (msg) => {
          if (!msg) return; // the queue was deleted; setup runs again after reconnecting
          onMessage(channel, msg).catch((err) =>
            // Usually the channel closed under us. The message wasn't acked, so it comes back.
            console.error(`Could not finish message: ${err.message}`),
          );
        });
      },
    },
  });
  connection.on('connect', () => {
    connected = true;
    console.log('Connected to RabbitMQ');
  });
  connection.on('disconnect', (err) => {
    connected = false;
    console.warn(`Lost RabbitMQ: ${err?.message ?? 'closed'}. Reconnecting...`);
  });
  connection.on('reconnect-scheduled', ({ attempt, delay }) =>
    console.warn(`RabbitMQ not reachable, attempt ${attempt}, next try in ${Math.round(delay)} ms`),
  );
  connection.on('error', (err) => console.error(`RabbitMQ error: ${err.message}`));
}

const stop = () => connection?.close();

module.exports = { start, stop, isConnected: () => connected };
