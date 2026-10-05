// "Forgot password" (reset by email link) and "change password" (while logged in).
// DECISION: kept separate from auth.service.js so neither file gets too long.
const bcrypt = require('bcryptjs');
const config = require('../config');
const { sequelize, User, PasswordResetToken } = require('../db');
const AppError = require('../utils/AppError');
const { randomToken, sha256 } = require('../utils/crypto');
const tokens = require('./token.service');
const audit = require('./audit.service');
const notification = require('./notification.client');
const { startSession } = require('./auth.service');

const RESET_TTL_MS = 30 * 60 * 1000;
const invalidResetToken = () =>
  new AppError(400, 'VALIDATION_ERROR', 'Reset link is invalid or has expired');

// Step 1 of "forgot password". The response is the same whether or not the email is registered,
// so nobody can use this to find out who has an account.
async function requestReset(email) {
  const user = await User.findOne({ where: { email } });
  // DECISION: disabled accounts get no reset link, since they can't log in anyway.
  if (!user || !user.isActive) return;

  const raw = randomToken();
  await sequelize.transaction(async (t) => {
    // If the user asked more than once, only the newest link works: cancel the older ones.
    await PasswordResetToken.update(
      { usedAt: new Date() },
      { where: { userId: user.id, usedAt: null }, transaction: t },
    );
    await PasswordResetToken.create(
      { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      { transaction: t },
    );
  });

  const resetUrl = `${config.frontendUrl}/reset-password?token=${raw}`;
  // Send the email in the background (no await). Waiting for it would make the response slower
  // only for registered emails, which would reveal which emails exist.
  notification.sendPasswordReset(user.email, resetUrl).catch(() => {});
}

// Saves the new password, logs the user out everywhere and writes an audit entry.
// Used by both "reset password" and "change password".
async function setPassword(user, newPassword, action, ip, transaction) {
  const passwordHash = await bcrypt.hash(newPassword, config.bcryptCost);
  await user.update({ passwordHash }, { transaction });
  await tokens.revokeAllSessions(user, transaction);
  await audit.record(
    { actor: user, action, targetType: 'user', targetId: user.id, ip },
    transaction,
  );
}

async function confirmReset({ token, newPassword }, ip) {
  const row = await PasswordResetToken.findOne({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt <= new Date()) throw invalidResetToken();

  await sequelize.transaction(async (t) => {
    // Mark the link as used. If two requests use the same link at once, only one succeeds.
    const [affected] = await PasswordResetToken.update(
      { usedAt: new Date() },
      { where: { id: row.id, usedAt: null }, transaction: t },
    );
    if (affected === 0) throw invalidResetToken();
    const user = await User.findByPk(row.userId, { transaction: t });
    await setPassword(user, newPassword, audit.ACTIONS.PASSWORD_RESET, ip, t);
  });
}

// "Change password" while logged in. All other devices are logged out; this one gets new tokens
// so the user stays logged in here.
async function changePassword(currentUser, { currentPassword, newPassword }, meta) {
  const user = await User.scope('withPassword').findByPk(currentUser.id);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }
  return sequelize.transaction(async (t) => {
    await setPassword(user, newPassword, audit.ACTIONS.PASSWORD_CHANGED, meta.ip, t);
    return startSession(user, meta, t);
  });
}

module.exports = { requestReset, confirmReset, changePassword };
