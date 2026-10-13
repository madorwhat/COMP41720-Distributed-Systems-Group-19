const jwt = require('jsonwebtoken');
const config = require('./config');

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
const jwtOptions = { algorithms: ['RS256'], issuer: 'visa-auth-service', audience: 'visa-platform' };

function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw httpError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token');

  let claims;
  try {
    claims = jwt.verify(match[1], config.publicKey, jwtOptions);
  } catch {
    throw httpError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token');
  }
  if (typeof claims.sub !== 'string' || !['user', 'admin'].includes(claims.role)) {
    throw httpError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token');
  }
  req.user = { id: claims.sub, email: claims.email, name: claims.name, role: claims.role };
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Admins only');
  next();
}

module.exports = { authenticate, requireAdmin, httpError };
