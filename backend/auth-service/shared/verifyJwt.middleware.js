// Copy this file into the booking service (or any other service that needs to know who is calling).
//
// It checks tokens made by the auth service using the auth service's public key, so there's no
// need to call the auth service on every request.
//
// Setup: run `npm install jsonwebtoken`, then set JWT_PUBLIC_KEY_PATH to auth-service/keys/public.pem
// (or put the key's text in JWT_PUBLIC_KEY).
//
// Usage: router.post('/admin/slots', authenticate, requireAdmin, handler)
const jwt = require('jsonwebtoken');
const fs = require('fs');

const PUBLIC_KEY =
  process.env.JWT_PUBLIC_KEY || fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH, 'utf8');

// Lets the request through only if it has a valid token, and puts the caller on req.user
// as { id, email, name, role }.
function authenticate(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const claims = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'], // only accept tokens signed the way we sign them, so fake ones are rejected
      issuer: 'visa-auth-service',
      audience: 'visa-platform',
    });
    req.user = { id: claims.sub, email: claims.email, name: claims.name, role: claims.role };
    next();
  } catch {
    res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Missing, invalid or expired token' } });
  }
}

// Lets the request through only if the caller is an admin. Use it after authenticate.
function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admins only' } });
}

module.exports = { authenticate, requireAdmin };
