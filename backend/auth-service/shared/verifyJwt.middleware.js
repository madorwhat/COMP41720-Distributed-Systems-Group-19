// COPY THIS FILE INTO THE BOOKING SERVICE.
// Verifies access tokens issued by the auth service. No network call per request.
// Needs: npm install jsonwebtoken, and JWT_PUBLIC_KEY (PEM content) or JWT_PUBLIC_KEY_PATH set.
// Usage: router.post('/status_update', authenticate, authorize('admin'), handler)
const jwt = require('jsonwebtoken');
const fs = require('fs');

const PUBLIC_KEY =
  process.env.JWT_PUBLIC_KEY || fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH, 'utf8');
const RANK = { user: 1, admin: 2, system_admin: 3 };

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing token' } });
  }
  try {
    const claims = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'], // only accept our signing method, so forged tokens are rejected
      issuer: 'visa-auth-service',
      audience: 'visa-platform',
    });
    req.user = { id: claims.sub, role: claims.role };
    next();
  } catch (err) {
    // TOKEN_EXPIRED tells the frontend to get a new token (POST /auth/refresh) and try again.
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED';
    res.status(401).json({ error: { code, message: 'Invalid or expired token' } });
  }
}

// authorize('admin') lets in admins and the system admin ("admin or higher").
const authorize = (minimumRole) => (req, res, next) =>
  RANK[req.user?.role] >= RANK[minimumRole]
    ? next()
    : res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient role' } });

module.exports = { authenticate, authorize };
