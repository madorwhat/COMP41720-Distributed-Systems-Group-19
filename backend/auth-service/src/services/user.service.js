// What admins can do to users: list, view, enable/disable, change role, create admins.
// Every change is saved together with its audit log entry (same transaction).
const bcrypt = require('bcryptjs');
const { Op, UniqueConstraintError, literal } = require('sequelize');
const config = require('../config');
const { sequelize, User } = require('../db');
const AppError = require('../utils/AppError');
const { ROLES } = require('../utils/roles');
const tokens = require('./token.service');
const audit = require('./audit.service');

const forbidden = (message) => new AppError(403, 'FORBIDDEN', message);

async function findUserOr404(id, transaction) {
  const user = await User.findByPk(id, { transaction });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  return user;
}

async function listUsers({ role, q, page, limit }) {
  const where = {};
  const replacements = {};
  if (role) where.role = role;
  if (q) {
    // Search by email or name. % and _ are wildcards in SQL LIKE, so we escape them with '!'
    // (otherwise searching "100%" would match everything).
    // DECISION: '!' instead of the usual backslash, because backslash behaves differently per database.
    replacements.pattern = `%${q.toLowerCase().replace(/[!%_]/g, '!$&')}%`;
    where[Op.and] = literal(
      "(email LIKE :pattern ESCAPE '!' OR LOWER(full_name) LIKE :pattern ESCAPE '!')",
    );
  }
  const { rows, count } = await User.findAndCountAll({
    where,
    replacements,
    limit,
    offset: (page - 1) * limit,
    order: [['createdAt', 'DESC']],
  });
  return { data: rows, page, limit, total: count };
}

const getUser = (id) => findUserOr404(id);

// Who may disable whom: admins can disable users; the system admin can disable users and admins.
// Nobody can disable the system admin or their own account.
function assertCanChangeStatus(actor, target) {
  if (actor.id === target.id) throw forbidden('You cannot change your own status');
  if (target.role === ROLES.SYSTEM_ADMIN)
    throw forbidden('System admins cannot be disabled via the API');
  if (target.role === ROLES.ADMIN && actor.role !== ROLES.SYSTEM_ADMIN) {
    throw forbidden('Only a system admin can disable an admin');
  }
}

async function setStatus({ actor, targetId, isActive, ip }) {
  return sequelize.transaction(async (t) => {
    const target = await findUserOr404(targetId, t);
    assertCanChangeStatus(actor, target);
    if (target.isActive === isActive) return target; // nothing changes, so nothing to log

    await target.update({ isActive }, { transaction: t });
    if (!isActive) await tokens.revokeAllSessions(target, t);
    await audit.record(
      {
        actor,
        action: isActive ? audit.ACTIONS.USER_ENABLED : audit.ACTIONS.USER_DISABLED,
        targetType: 'user',
        targetId: target.id,
        ip,
      },
      t,
    );
    return target;
  });
}

async function changeRole({ actor, targetId, newRole, ip }) {
  return sequelize.transaction(async (t) => {
    const target = await findUserOr404(targetId, t);
    // The system admin's role can never be changed (this also stops them demoting themselves),
    // so the app can never end up without a system admin.
    if (target.role === ROLES.SYSTEM_ADMIN)
      throw forbidden('System admin roles cannot be changed via the API');

    const previousRole = target.role;
    if (previousRole === newRole) return target; // nothing changes, so nothing to log

    await target.update({ role: newRole }, { transaction: t });
    // Log the user out everywhere, so their next login gives them a token with the new role.
    await tokens.revokeAllSessions(target, t);
    await audit.record(
      {
        actor,
        action: audit.ACTIONS.USER_ROLE_CHANGED,
        targetType: 'user',
        targetId: target.id,
        metadata: { from: previousRole, to: newRole },
        ip,
      },
      t,
    );
    return target;
  });
}

async function createAdmin({ actor, email, password, fullName, ip }) {
  const passwordHash = await bcrypt.hash(password, config.bcryptCost);
  return sequelize.transaction(async (t) => {
    let admin;
    try {
      admin = await User.create(
        { email, passwordHash, fullName, role: ROLES.ADMIN },
        { transaction: t },
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
      }
      throw err;
    }
    await audit.record(
      { actor, action: audit.ACTIONS.ADMIN_CREATED, targetType: 'user', targetId: admin.id, ip },
      t,
    );
    return admin;
  });
}

module.exports = { listUsers, getUser, setStatus, changeRole, createAdmin };
