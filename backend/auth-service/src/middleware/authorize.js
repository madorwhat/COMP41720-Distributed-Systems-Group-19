const AppError = require('../utils/AppError');
const { hasAtLeast } = require('../utils/roles');

// Route guard for roles. authorize('admin') lets in admins AND system admins ("admin or higher").
// It only checks who is calling. Rules about who they may act on (e.g. an admin can't disable
// another admin) are in services/user.service.js.
const authorize = (minimumRole) => (req, res, next) => {
  if (!hasAtLeast(req.user?.role, minimumRole)) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient role');
  }
  next();
};

module.exports = authorize;
