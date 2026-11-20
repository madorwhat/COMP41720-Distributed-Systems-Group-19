// Checks the login token with Auth's public key (no call to Auth), like the other services.
// The planner is for admins only.
const jwt = require('jsonwebtoken');
const config = require('./config');

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });

function requireAdmin(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (!match) throw httpError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token');
  let claims;
  try {
    claims = jwt.verify(match[1], config.publicKey, {
      algorithms: ['RS256'],
      issuer: 'visa-auth-service',
      audience: 'visa-platform',
    });
  } catch {
    throw httpError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token');
  }
  if (claims.role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Admins only');
  req.user = { id: claims.sub, email: claims.email, role: claims.role };
  req.token = match[1]; // passed on to Booking and Notification, which check it themselves
  next();
}

module.exports = { requireAdmin, httpError };
