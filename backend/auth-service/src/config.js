// All the settings for this service live here. Values come from environment variables or from
// backend/.env (if both set the same thing, the environment variable wins).
// The app and the database scripts (sequelize-cli, via .sequelizerc) both read this file,
// so they always use the same database.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env')); // backend/.env, shared by all services
} catch {
  // No .env file? That's fine, the defaults below are used.
}

// The first time the service starts, it creates the key pair used to sign tokens.
// private.pem stays secret on this machine; public.pem can be shared with other services
// so they can check our tokens.
const keysDir = path.join(__dirname, '..', 'keys');
const privatePath = path.join(keysDir, 'private.pem');
const publicPath = path.join(keysDir, 'public.pem');

if (!fs.existsSync(privatePath)) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.mkdirSync(keysDir, { recursive: true });
  fs.writeFileSync(privatePath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicPath, publicKey);
}

module.exports = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://auth:auth@localhost:5432/auth_db',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim()),
  // How long a login lasts. There's no refresh token, so when it runs out the user just logs in again.
  tokenTtl: process.env.ACCESS_TOKEN_TTL || '1d',
  bcryptCost: Number(process.env.BCRYPT_COST) || 12,
  privateKey: fs.readFileSync(privatePath, 'utf8'),
  publicKey: fs.readFileSync(publicPath, 'utf8'),
};
