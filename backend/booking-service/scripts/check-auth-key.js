const config = require('../src/config');

try {
  if (!config.publicKey) throw new Error('The key file is empty');
} catch (error) {
  console.error(
    `Cannot load the Auth public key (${error.message}). Start the Auth Service first; it creates backend/auth-service/keys/public.pem.`,
  );
  process.exit(1);
}
