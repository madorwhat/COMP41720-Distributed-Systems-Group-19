// Handles /internal/* requests (called by other backend services, not by users).
const auditService = require('../services/audit.service');

async function createAuditLog(req, res) {
  const log = await auditService.recordExternal({ ...req.body, ip: req.ip }, req.sourceService);
  res.status(201).json({ id: log.id });
}

module.exports = { createAuditLog };
