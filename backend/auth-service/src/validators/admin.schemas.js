const { z } = require('zod');
const { ROLES } = require('../utils/roles');

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

const listUsersQuery = z.object({
  role: z.enum(Object.values(ROLES)).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page,
  limit,
});

const userIdParams = z.object({ id: z.string().uuid('Invalid user id') });

const statusBody = z.object({ isActive: z.boolean() });

// Only 'user' and 'admin' are allowed: nobody can be made system admin through the API.
const roleBody = z.object({ role: z.enum([ROLES.USER, ROLES.ADMIN]) });

const listLogsQuery = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().max(64).optional(),
  source: z.string().max(32).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page,
  limit,
});

module.exports = { page, limit, listUsersQuery, userIdParams, statusBody, roleBody, listLogsQuery };
