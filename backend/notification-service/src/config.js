// All the settings for this service. Values come from environment variables or from the .env
// file; every setting has a default that works with this folder's docker-compose.yml.
const fs = require('fs');
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // No .env file? That's fine, the defaults below are used.
}

// Auth's public key, for checking login tokens on the subscription routes. Either the key text
// (JWT_PUBLIC_KEY) or the file it is in (JWT_PUBLIC_KEY_PATH). Read on first use, so the service
// still runs its emails and reminders when the key is not there.
const publicKeyPath =
  process.env.JWT_PUBLIC_KEY_PATH || path.resolve(__dirname, '../../auth-service/keys/public.pem');
let publicKey;

module.exports = {
  port: Number(process.env.PORT) || 4003,
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://notification:notification@localhost:5435/notification_db',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  get jwtPublicKey() {
    publicKey ||= process.env.JWT_PUBLIC_KEY || fs.readFileSync(publicKeyPath, 'utf8');
    return publicKey;
  },
  // Websites allowed to call the subscription routes from a browser.
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim()),
  // All email goes out through Gmail. SMTP_USER is the Gmail address that sends it, and SMTP_PASS is
  // a Gmail App Password (not the normal password). Both are required: the service refuses to
  // start without them. Host and port only need changing for tests.
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || undefined,
  smtpPass: process.env.SMTP_PASS || undefined,
  // Gmail shows the mail as sent from the logged-in account whatever this says; it sets the name.
  mailFrom:
    process.env.MAIL_FROM ||
    (process.env.SMTP_USER ? `Book My Visa <${process.env.SMTP_USER}>` : 'Book My Visa'),
  // "New appointments are open" emails: nobody gets more than one for the same country and visa
  // type within this many hours, so an admin adding slots all day doesn't flood anyone.
  // 0 turns the limit off (handy when testing).
  slotAlertCooldownHours:
    process.env.SLOT_ALERT_COOLDOWN_HOURS === undefined
      ? 24
      : Number(process.env.SLOT_ALERT_COOLDOWN_HOURS) || 0,
  // The website address put at the end of those emails. Left out when empty (no website yet).
  siteUrl: process.env.SITE_URL || '',
  // How many messages we work on at the same time.
  prefetch: Number(process.env.PREFETCH) || 10,
  // Reminders follow Irish time, not UTC, so 9 am stays 9 am when the clocks change.
  timeZone: 'Europe/Dublin',
  reminderHour: 9,
};
