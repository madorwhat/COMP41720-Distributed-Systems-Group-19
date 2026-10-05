// URL list for /admin/*. Every route needs a logged-in admin; some need the system admin.
const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../utils/roles');
const { signupSchema } = require('../validators/auth.schemas');
const {
  listUsersQuery,
  userIdParams,
  statusBody,
  roleBody,
  listLogsQuery,
} = require('../validators/admin.schemas');
const admin = require('../controllers/admin.controller');

const router = express.Router();
const adminOnly = authorize(ROLES.ADMIN); // admin or system_admin
const systemAdminOnly = authorize(ROLES.SYSTEM_ADMIN);

router.use(authenticate);

router.get('/users', adminOnly, validate(listUsersQuery, 'query'), admin.listUsers);
router.get('/users/:id', adminOnly, validate(userIdParams, 'params'), admin.getUser);
router.patch(
  '/users/:id/status',
  adminOnly,
  validate(userIdParams, 'params'),
  validate(statusBody),
  admin.setStatus,
);
router.patch(
  '/users/:id/role',
  systemAdminOnly,
  validate(userIdParams, 'params'),
  validate(roleBody),
  admin.changeRole,
);
router.post('/admins', systemAdminOnly, validate(signupSchema), admin.createAdmin);
router.get('/logs', systemAdminOnly, validate(listLogsQuery, 'query'), admin.listLogs);

module.exports = router;
