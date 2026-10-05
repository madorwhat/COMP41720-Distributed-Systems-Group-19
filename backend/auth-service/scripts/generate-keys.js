// Creates the key pair used to sign tokens: keys/private.pem
// and keys/public.pem (safe to share with the booking service).
// Run once on each machine: npm run keys:generate
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'keys');
const privatePath = path.join(dir, 'private.pem');
const publicPath = path.join(dir, 'public.pem');

if (fs.existsSync(privatePath) && !process.argv.includes('--force')) {
  console.log(
    'keys/private.pem already exists. Use --force to overwrite (this logs everyone out).',
  );
  process.exit(0);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(privatePath, privateKey, { mode: 0o600 });
fs.writeFileSync(publicPath, publicKey);
console.log(`Wrote ${privatePath} and ${publicPath}`);
