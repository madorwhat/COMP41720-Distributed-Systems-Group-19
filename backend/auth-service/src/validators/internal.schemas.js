const { z } = require('zod');
const { ROLES } = require('../utils/roles');

// What the booking service may send to POST /internal/audit-logs. It can't say which service
// it is: that's decided by the service key it used (see requireServiceKey.js).
const auditLogBody = z.object({
  actorId: z.string().uuid().nullish(),
  actorEmail: z.string().trim().toLowerCase().email().max(254).nullish(),
  actorRole: z.enum(Object.values(ROLES)).nullish(),
  action: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'action must be UPPER_SNAKE_CASE'),
  targetType: z.string().max(32).nullish(),
  targetId: z.string().max(64).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  occurredAt: z.coerce.date().optional(),
});

module.exports = { auditLogBody };
