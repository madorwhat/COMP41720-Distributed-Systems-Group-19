const crypto = require('crypto');
const config = require('../config');
const AppError = require('../utils/AppError');

// We compare hashes of the keys instead of the keys themselves. That way the comparison always
// takes the same time, so an attacker can't guess the key by measuring response times.
const digest = (value) => crypto.createHash('sha256').update(value).digest();
const expected = digest(config.internalServiceKey);

// Protects /internal/* routes, which only other backend services (not users) may call.
// The caller must send the shared secret in the X-Service-Key header; user tokens don't work here.
// DECISION: there is one key, and whoever holds it is treated as the booking service.
function requireServiceKey(req, res, next) {
  const given = digest(req.get('x-service-key') || '');
  if (!crypto.timingSafeEqual(given, expected)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid service key');
  }
  req.sourceService = 'booking';
  next();
}

module.exports = requireServiceKey;
