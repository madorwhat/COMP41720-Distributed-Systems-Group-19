// Starts the three ways work reaches this service:
//   consumer/    messages from Booking, arriving on RabbitMQ
//   routes/      the web routes where a user chooses which new appointments to be told about
//   reminders/   a timer that sends the reminder emails
// plus /health and /metrics.
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { sequelize } = require('./db');
const consumer = require('./consumer');
const reminders = require('./reminders');
const metrics = require('./metrics');
const mailer = require('./mailer');
const subscriptions = require('./routes/subscriptions');

const app = express();

// Up only if we can reach both the database and RabbitMQ.
app.get('/health', async (req, res) => {
  const database = await sequelize.authenticate().then(
    () => 'ok',
    () => 'down',
  );
  const rabbitmq = consumer.isConnected() ? 'ok' : 'down';
  const ok = database === 'ok' && rabbitmq === 'ok';
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'down', database, rabbitmq });
});

app.get('/metrics', async (req, res) => {
  res.type(metrics.register.contentType).send(await metrics.register.metrics());
});

// The website calls these from the browser, so they allow its address (CORS_ORIGINS).
app.use(
  '/subscriptions',
  cors({ origin: config.corsOrigins }),
  express.json({ limit: '10kb' }),
  subscriptions,
);

// Checks that Gmail accepts our login, so a wrong App Password shows up in the log at startup and
// not on the first booking. It is not fatal: a failed email is retried later, so a mail server
// that is away for a while delays emails but loses none.
function checkMailServer() {
  const where = `${config.smtpHost}:${config.smtpPort}`;
  mailer.transport.verify().then(
    () => console.log(`Email goes out through ${where}, logged in as ${config.smtpUser}`),
    (err) => console.warn(`Cannot log in to the mail server ${where}: ${err.message}`),
  );
}

async function main() {
  mailer.requireMailLogin(); // no Gmail login, no point starting
  await sequelize.authenticate();
  const server = app.listen(config.port, () =>
    console.log(`Notification service on http://localhost:${config.port}`),
  );
  checkMailServer();
  await consumer.start();
  await reminders.start();

  // On Ctrl+C or `docker compose stop`, stop taking new work and close connections cleanly.
  const shutdown = async () => {
    reminders.stop();
    server.close();
    await consumer.stop().catch(() => {});
    await sequelize.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`Cannot start: ${err.message}`);
  process.exit(1);
});
