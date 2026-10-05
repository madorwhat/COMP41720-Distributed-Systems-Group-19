const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const AppError = require('../utils/AppError');

// Limits how often someone can hit sensitive endpoints (to slow down password guessing).
// Counts are kept in memory, so they reset when the server restarts. That's fine for one
// local server; several servers would need a shared store such as Redis.
const limiter = ({ windowMinutes, max, perEmail }) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Login/reset attempts are counted per IP address + email together. So someone guessing
    // passwords for one account doesn't block that person on other networks, and people
    // sharing one Wi-Fi (e.g. a classroom) don't block each other.
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip);
      return perEmail
        ? `${ip}|${String(req.body?.email || '')
            .trim()
            .toLowerCase()}`
        : ip;
    },
    handler: (req, res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, please try again later')),
  });

module.exports = {
  loginLimiter: limiter({ windowMinutes: 15, max: 5, perEmail: true }),
  resetLimiter: limiter({ windowMinutes: 60, max: 3, perEmail: true }),
  // DECISION: the plan gives no limits for these two, so these are generous per-IP limits
  // that normal users never hit but that still stop automated scripts.
  signupLimiter: limiter({ windowMinutes: 60, max: 20 }),
  resetConfirmLimiter: limiter({ windowMinutes: 15, max: 20 }),
};
