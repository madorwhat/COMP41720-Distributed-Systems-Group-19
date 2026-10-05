// Business logic for signup, login, refresh and logout. No req/res here: controllers call these
// functions and turn the result into an HTTP response.
const bcrypt = require('bcryptjs');
const { UniqueConstraintError } = require('sequelize');
const config = require('../config');
const { sequelize, User } = require('../db');
const AppError = require('../utils/AppError');
const { ROLES, hasAtLeast } = require('../utils/roles');
const tokens = require('./token.service');
const audit = require('./audit.service');

// A fake password hash used when the email doesn't exist. Checking against it takes as long as a
// real check, so the response time doesn't reveal whether an email is registered.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', config.bcryptCost);

const invalidSession = () => new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired session');

// Creates a new access token + refresh token for the user (used after signup, login, etc.).
async function startSession(user, meta, transaction) {
  const { raw } = await tokens.issueRefreshToken(user, meta, transaction);
  return { user, accessToken: tokens.signAccessToken(user), refreshToken: raw };
}

async function signup({ email, password, fullName }, meta) {
  const passwordHash = await bcrypt.hash(password, config.bcryptCost);
  return sequelize.transaction(async (t) => {
    let user;
    try {
      // Just try to insert and let the database reject a duplicate email. (Checking first, then
      // inserting, could let two signups with the same email slip through at the same moment.)
      user = await User.create({ email, passwordHash, fullName }, { transaction: t });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
      }
      throw err;
    }
    await audit.record(
      {
        actor: user,
        action: audit.ACTIONS.USER_SIGNUP,
        targetType: 'user',
        targetId: user.id,
        ip: meta.ip,
      },
      t,
    );
    return startSession(user, meta, t);
  });
}

async function login({ email, password }, meta) {
  const user = await User.scope('withPassword').findOne({ where: { email } });
  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');

  return sequelize.transaction(async (t) => {
    await user.update({ lastLoginAt: new Date() }, { transaction: t });
    // Only admin logins go into the audit log; logging every user login would just be noise.
    if (hasAtLeast(user.role, ROLES.ADMIN)) {
      await audit.record(
        {
          actor: user,
          action: audit.ACTIONS.ADMIN_LOGIN,
          targetType: 'user',
          targetId: user.id,
          ip: meta.ip,
        },
        t,
      );
    }
    return startSession(user, meta, t);
  });
}

// Called when someone uses a refresh token that was already used. A real user never does that,
// so someone probably has a stolen copy: log the user out everywhere and record it.
async function handleTokenReuse(userId, ip) {
  await sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { transaction: t });
    if (!user) return;
    await tokens.revokeAllSessions(user, t);
    await audit.record(
      {
        actor: null,
        action: audit.ACTIONS.REFRESH_TOKEN_REUSE_DETECTED,
        targetType: 'user',
        targetId: user.id,
        ip,
      },
      t,
    );
  });
}

async function refresh(rawToken, meta) {
  if (!rawToken) throw invalidSession();
  const existing = await tokens.findRefreshToken(rawToken);
  if (!existing) throw invalidSession();
  if (existing.revokedAt) {
    await handleTokenReuse(existing.userId, meta.ip);
    throw invalidSession();
  }
  if (existing.expiresAt <= new Date()) throw invalidSession();

  // DECISION: no separate tokenVersion check needed here. Whenever tokenVersion goes up, all refresh
  // tokens are cancelled at the same time, so a refresh token that is still valid is always current.
  const user = await User.findByPk(existing.userId);
  if (!user || !user.isActive) throw invalidSession();

  let lostRace = false;
  try {
    return await sequelize.transaction(async (t) => {
      const { raw, row } = await tokens.issueRefreshToken(user, meta, t);
      if (!(await tokens.markRotated(existing, row.id, t))) {
        lostRace = true;
        throw invalidSession(); // also undoes creating the new token
      }
      return { user, accessToken: tokens.signAccessToken(user), refreshToken: raw };
    });
  } catch (err) {
    // Another request used this same token a moment earlier. To be safe, treat it as stolen.
    if (lostRace) await handleTokenReuse(existing.userId, meta.ip);
    throw err;
  }
}

async function logout(rawToken) {
  if (rawToken) await tokens.revokeRefreshToken(rawToken);
}

async function logoutAll(user) {
  await sequelize.transaction((t) => tokens.revokeAllSessions(user, t));
}

module.exports = { signup, login, refresh, logout, logoutAll, startSession };
