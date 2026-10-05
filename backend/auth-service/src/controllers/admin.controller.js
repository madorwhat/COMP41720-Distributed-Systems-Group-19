// Handles /admin/* requests. The actual logic lives in services/user.service.js and audit.service.js.
const userService = require('../services/user.service');
const auditService = require('../services/audit.service');

async function listUsers(req, res) {
  res.json(await userService.listUsers(req.query));
}

async function getUser(req, res) {
  res.json({ user: await userService.getUser(req.params.id) });
}

async function setStatus(req, res) {
  const user = await userService.setStatus({
    actor: req.user,
    targetId: req.params.id,
    isActive: req.body.isActive,
    ip: req.ip,
  });
  res.json({ user });
}

async function changeRole(req, res) {
  const user = await userService.changeRole({
    actor: req.user,
    targetId: req.params.id,
    newRole: req.body.role,
    ip: req.ip,
  });
  res.json({ user });
}

async function createAdmin(req, res) {
  const user = await userService.createAdmin({ actor: req.user, ...req.body, ip: req.ip });
  res.status(201).json({ user });
}

async function listLogs(req, res) {
  res.json(await auditService.listLogs(req.query));
}

module.exports = { listUsers, getUser, setStatus, changeRole, createAdmin, listLogs };
