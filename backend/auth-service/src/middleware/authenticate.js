const AppError = require('../utils/AppError');
const tokens = require('../services/token.service');
const { User } = require('../db');

// Protects a route: requires "Authorization: Bearer <access token>" and puts the logged-in user
// on req.user (fresh from the database, so the role is always current).
// DECISION: we also compare the token's version number (`tv`) with the user's tokenVersion in the
// database. Logging out everywhere, a role change or disabling the account increases that number,
// so older tokens stop working here immediately instead of after they expire.
async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Missing access token');

  let claims;
  try {
    claims = tokens.verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired');
    }
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid access token');
  }

  const user = await User.findByPk(claims.sub);
  if (!user || !user.isActive || user.tokenVersion !== claims.tv) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Session is no longer valid');
  }
  req.user = user;
  next();
}

module.exports = authenticate;
