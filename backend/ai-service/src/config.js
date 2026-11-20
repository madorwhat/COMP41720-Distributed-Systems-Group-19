// All the settings for the AI service. Values come from environment variables or from
// backend/.env; every setting has a default that works when running locally.
const fs = require('fs');
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env')); // backend/.env, shared by all services
} catch {
  // No .env file? That's fine, the defaults below are used.
}

const publicKeyPath =
  process.env.JWT_PUBLIC_KEY_PATH || path.resolve(__dirname, '../../auth-service/keys/public.pem');
let publicKey;

module.exports = {
  port: Number(process.env.PORT) || 4004,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((o) => o.trim()),
  bookingUrl: process.env.BOOKING_URL || 'http://localhost:4001',
  notificationUrl: process.env.NOTIFICATION_URL || 'http://localhost:4003',

  // The local model. Small enough to run on a laptop; change OLLAMA_MODEL to try another one.
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  // Bump this whenever the prompt in src/model.js changes, so every plan says which prompt made it.
  promptVersion: 'planner-v2',
  // How long an admin waits for the model before we fall back to the rule-based plan.
  modelTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS) || 30_000,

  get publicKey() {
    publicKey ||= fs.readFileSync(publicKeyPath, 'utf8');
    return publicKey;
  },
};
