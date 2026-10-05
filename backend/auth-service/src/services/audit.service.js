const { Op } = require('sequelize');
const { AuditLog } = require('../db');

const ACTIONS = Object.freeze({
  USER_SIGNUP: 'USER_SIGNUP',
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ADMIN_CREATED: 'ADMIN_CREATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  REFRESH_TOKEN_REUSE_DETECTED: 'REFRESH_TOKEN_REUSE_DETECTED',
});

// Writes one audit log entry. Always pass the same transaction as the change being logged:
// then either both are saved or neither is, so no change can happen without a log entry.
function record({ actor, action, targetType, targetId, metadata, ip }, transaction) {
  return AuditLog.create(
    {
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null, // copied now, so the log stays right if they change later
      actorRole: actor?.role ?? null,
      action,
      sourceService: 'auth',
      targetType,
      targetId,
      metadata,
      ip,
    },
    { transaction },
  );
}

// Saves an entry sent by another service (POST /internal/audit-logs).
// `sourceService` comes from the service key that was used, never from the request body.
function recordExternal(entry, sourceService) {
  const { occurredAt, ...fields } = entry;
  // DECISION: use the time the action actually happened (occurredAt). If the booking service
  // had to retry sending it, the log still shows the right time.
  return AuditLog.create({ ...fields, sourceService, createdAt: occurredAt || new Date() });
}

async function listLogs({ actorId, action, source, from, to, page, limit }) {
  const where = {};
  if (actorId) where.actorId = actorId;
  if (action) where.action = action;
  if (source) where.sourceService = source;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }
  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    limit,
    offset: (page - 1) * limit,
    order: [['createdAt', 'DESC']],
  });
  return { data: rows, page, limit, total: count };
}

module.exports = { ACTIONS, record, recordExternal, listLogs };
