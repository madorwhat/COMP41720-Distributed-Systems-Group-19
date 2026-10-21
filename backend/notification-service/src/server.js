// Notification has no business routes: it listens to RabbitMQ and runs the reminder job.
// The web server is only for /health and /metrics.
const express = require('express');
const config = require('./config');
const { sequelize } = require('./db');
const consumer = require('./consumer');
const reminders = require('./reminders');
const metrics = require('./metrics');

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

async function main() {
  await sequelize.authenticate();
  const server = app.listen(config.port, () =>
    console.log(`Notification service on http://localhost:${config.port}`),
  );
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
