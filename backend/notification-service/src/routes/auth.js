// Who is calling the subscription routes? The Auth service signs a login token (a JWT) and the
// website sends it as "Authorization: Bearer <token>". We check it with Auth's public key, so
// there is no call to Auth. This is the same check as backend/auth-service/shared/verifyJwt.middleware.js.
const jwt = require('jsonwebtoken');
const config = require('../config');

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
const unauthenticated = () =>
  httpError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token');

// Lets the request through only with a valid token, and puts the caller on req.user as
// { id, email, name }.
function authenticate(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (!match) throw unauthenticated();

  let key;
  try {
    key = config.jwtPublicKey;
  } catch {
    throw httpError(
      503,
      'AUTH_KEY_UNAVAILABLE',
      'Cannot check logins: the Auth public key is missing',
    );
  }

  let claims;
  try {
    claims = jwt.verify(match[1], key, {
      algorithms: ['RS256'], // only tokens signed the way Auth signs them, so fake ones are rejected
      issuer: 'visa-auth-service',
      audience: 'visa-platform',
    });
  } catch {
    throw unauthenticated();
  }
  if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') throw unauthenticated();

  req.user = { id: claims.sub, email: claims.email, name: claims.name };
  next();
}

module.exports = { authenticate, httpError };
