// URL list for /internal/*: only callable with the X-Service-Key header (backend services).
const express = require('express');
const requireServiceKey = require('../middleware/requireServiceKey');
const validate = require('../middleware/validate');
const { auditLogBody } = require('../validators/internal.schemas');
const internal = require('../controllers/internal.controller');

const router = express.Router();

router.use(requireServiceKey);
router.post('/audit-logs', validate(auditLogBody), internal.createAuditLog);

module.exports = router;
