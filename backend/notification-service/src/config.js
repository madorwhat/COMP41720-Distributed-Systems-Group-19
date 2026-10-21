// All the settings for this service. Values come from environment variables or from the .env
// file; every setting has a default that works with this folder's docker-compose.yml.
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // No .env file? That's fine, the defaults below are used.
}

module.exports = {
  port: Number(process.env.PORT) || 4003,
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://notification:notification@localhost:5435/notification_db',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  smtpHost: process.env.SMTP_HOST || 'localhost',
  smtpPort: Number(process.env.SMTP_PORT) || 1025,
  mailFrom: process.env.MAIL_FROM || 'Book My Visa <no-reply@bookmyvisa.local>',
  // How many messages we work on at the same time.
  prefetch: Number(process.env.PREFETCH) || 10,
  // Reminders follow Irish time, not UTC, so 9 am stays 9 am when the clocks change.
  timeZone: 'Europe/Dublin',
  reminderHour: 9,
};
