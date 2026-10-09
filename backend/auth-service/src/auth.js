// Everything about login tokens (JWTs): creating them, and checking them on protected routes.
const jwt = require('jsonwebtoken');
const config = require('./config');
const { User } = require('./db');

// These two labels are written into every token and checked when the token comes back.
// The booking service checks the same two values (see shared/verifyJwt.middleware.js).
const JWT_OPTIONS = { issuer: 'visa-auth-service', audience: 'visa-platform' };

// Small helper to create an error that the error handler in server.js turns into a JSON reply.
const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });

// Creates the token a user gets after signup or login. It carries the user's id, email, name
// and role, so other services can tell who is calling without asking us.
// `tv` is the user's token version (see tokenVersion in db.js).
const signToken = (user) =>
  jwt.sign(
    { email: user.email, name: user.fullName, role: user.role, tv: user.tokenVersion },
    config.privateKey,
    { algorithm: 'RS256', expiresIn: config.tokenTtl, subject: user.id, ...JWT_OPTIONS },
  );

// Guard for routes that need a logged-in user. The request must send
// "Authorization: Bearer <token>". We also load the user from the database every time, so if they
// were disabled, got a new role or logged out, their old token stops working here straight away.
async function authenticate(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  let claims;
  try {
    // We only accept tokens signed with our own RS256 key, so nobody can sneak in a fake token
    // by claiming a different (weaker) signing method.
    claims = jwt.verify(token, config.publicKey, { algorithms: ['RS256'], ...JWT_OPTIONS });
  } catch {
    throw httpError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token');
  }
  const user = await User.findByPk(claims.sub);
  if (!user || !user.isActive || user.tokenVersion !== claims.tv) {
    throw httpError(401, 'UNAUTHENTICATED', 'Session is no longer valid');
  }
  req.user = user;
  next();
}

// Guard for admin-only routes. Always use it after authenticate.
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Admins only');
  next();
}

module.exports = { httpError, signToken, authenticate, requireAdmin };
