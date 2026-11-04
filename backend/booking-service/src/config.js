const fs = require('fs');
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // The service can also be configured entirely through its environment.
}

const publicKeyPath =
  process.env.JWT_PUBLIC_KEY_PATH ||
  path.resolve(__dirname, '../../auth-service/keys/public.pem');
let publicKey;

module.exports = {
  port: Number(process.env.PORT) || 4001,
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://booking:booking@localhost:5434/booking_db',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim()),
  get publicKey() {
    publicKey ||= process.env.JWT_PUBLIC_KEY || fs.readFileSync(publicKeyPath, 'utf8');
    return publicKey;
  },
};
