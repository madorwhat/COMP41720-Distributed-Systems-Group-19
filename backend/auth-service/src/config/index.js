// All settings come from environment variables (.env). This file reads and checks them once,
// and the rest of the code imports `config` instead of reading process.env directly.
// (config/database.js is the only other exception, because sequelize-cli loads it on its own.)
require('dotenv').config({ quiet: true });
const fs = require('fs');
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  JWT_PRIVATE_KEY: z.string().optional(), // the key text itself, instead of a file path
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_PATH: z.string().default('./keys/private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./keys/public.pem'),
  JWT_ISSUER: z.string().default('visa-auth-service'),
  JWT_AUDIENCE: z.string().default('visa-platform'),
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'use a value like 15m')
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  NOTIFICATION_SERVICE_URL: z.union([z.literal(''), z.string().url()]).optional(), // leave empty if there is no notification service
  CORS_ORIGINS: z.string().default('http://localhost:3000'), // comma-separated allowlist
  INTERNAL_SERVICE_KEY: z.string().min(16, 'must be at least 16 characters'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment variables:\n${problems}`);
}
const env = parsed.data;

// Returns the key text: taken from the env var if set, otherwise read from the file.
// Env vars can't hold real line breaks, so "\n" in them is turned back into a new line.
function loadKey(content, filePath) {
  if (content) return content.replace(/\\n/g, '\n');
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`JWT key not found at ${filePath}. Run "npm run keys:generate" first.`);
  }
}

module.exports = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  trustProxy: env.TRUST_PROXY === 'true',
  jwt: Object.freeze({
    privateKey: loadKey(env.JWT_PRIVATE_KEY, env.JWT_PRIVATE_KEY_PATH),
    publicKey: loadKey(env.JWT_PUBLIC_KEY, env.JWT_PUBLIC_KEY_PATH),
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTokenTtl: env.ACCESS_TOKEN_TTL,
  }),
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  bcryptCost: env.BCRYPT_COST,
  frontendUrl: env.FRONTEND_URL.replace(/\/$/, ''),
  notificationServiceUrl: env.NOTIFICATION_SERVICE_URL
    ? env.NOTIFICATION_SERVICE_URL.replace(/\/$/, '')
    : null,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  internalServiceKey: env.INTERNAL_SERVICE_KEY,
});
