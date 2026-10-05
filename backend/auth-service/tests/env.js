// Runs before every test file, before any app module is loaded.
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.BCRYPT_COST = '4'; // fast hashing in tests
process.env.INTERNAL_SERVICE_KEY = 'test-service-key-0123456789';

// A throwaway key pair per test file, so tests never depend on keys/ existing.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;
