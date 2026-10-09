// All the endpoints of the auth service, in one place.
// Incoming data is checked with the zod schemas below. If something is wrong, zod throws and the
// error handler in server.js replies with a 400. Fields we don't expect (like "role" on signup)
// are simply dropped, so nobody can make themselves an admin.
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { z } = require('zod');
const config = require('./config');
const { sequelize, User, AuditLog } = require('./db');
const { httpError, signToken, authenticate, requireAdmin } = require('./auth');

// What we accept from clients.
const email = z.string().trim().toLowerCase().email('Email is invalid').max(254);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p) <= 72, 'Password must be at most 72 bytes') // bcrypt ignores anything longer
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password needs a letter and a digit');
const signupBody = z.object({ email, password, fullName: z.string().trim().min(1).max(100) });
const loginBody = z.object({ email, password: z.string().min(1).max(200) });
const profileBody = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,19}$/, 'Mobile number is invalid'),
  nationality: z.string().trim().min(2).max(60),
});
const role = z.enum(['user', 'admin']);
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Limits how often someone can try to sign up or log in, to slow down password guessing.
// - signup: counted per IP address.
// - login: counted per IP address + email, and only failed attempts count, so a real user
//   who logs in often is never blocked.
// The counts are kept in memory, so they reset when the server restarts.
const limiter = (minutes, limit, perEmail) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    skipSuccessfulRequests: perEmail,
    keyGenerator: (req) =>
      ipKeyGenerator(req.ip) + (perEmail ? `|${String(req.body?.email).trim().toLowerCase()}` : ''),
    handler: (req, res) =>
      res
        .status(429)
        .json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try later' } }),
  });

// When someone logs in with an email that doesn't exist, we still check the password against this
// fake hash. That way the reply takes the same time either way, and nobody can work out which
// emails are registered by timing it.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', config.bcryptCost);

// Saves one row in the audit log (shown on the admins' Logs page).
const audit = (actor, action, targetId, metadata, transaction) =>
  AuditLog.create(
    { actorId: actor.id, actorEmail: actor.email, action, targetId, metadata },
    { transaction },
  );

// The shape of every paged list we send back.
const page = (rows, count, { page, limit }) => ({ data: rows, page, limit, total: count });

const router = express.Router();

// Is the service up, and can it reach the database?
router.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'down' });
  }
});

// Creates an account (always as a normal user) and logs the person in straight away.
// The user and their audit row are saved together: either both are saved or neither is.
router.post('/signup', limiter(60, 20), async (req, res) => {
  const { email, password, fullName } = signupBody.parse(req.body);
  const passwordHash = await bcrypt.hash(password, config.bcryptCost);
  const user = await sequelize.transaction(async (transaction) => {
    const created = await User.create({ email, passwordHash, fullName }, { transaction });
    await audit(created, 'USER_SIGNUP', created.id, null, transaction);
    return created;
  });
  res.status(201).json({ user, accessToken: signToken(user) });
});

// Admin logins go into the audit log. Normal user logins don't, to keep the log readable.
router.post('/login', limiter(15, 5, true), async (req, res) => {
  const { email, password } = loginBody.parse(req.body);
  const user = await User.unscoped().findOne({ where: { email } });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk)
    throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  if (!user.isActive) throw httpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  if (user.role === 'admin') await audit(user, 'ADMIN_LOGIN', user.id);
  res.json({ user, accessToken: signToken(user) });
});

// Logging out raises the user's token version, so every token they hold (on any device) stops
// working here. Other services check tokens on their own and keep accepting it until it expires,
// so the frontend should throw the token away too.
router.post('/logout', authenticate, async (req, res) => {
  await req.user.increment('tokenVersion');
  res.status(204).end();
});

// The logged-in user's own account.
router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

// Saves the mobile number and nationality from the Account tab. Both are required.
router.put('/me', authenticate, async (req, res) => {
  res.json({ user: await req.user.update(profileBody.parse(req.body)) });
});

// Everything under /admin needs a logged-in admin.
const admin = express.Router();
admin.use(authenticate, requireAdmin);

// Lists users, newest first. Optional ?role=user or ?role=admin filter, plus paging.
admin.get('/users', async (req, res) => {
  const query = pageQuery.extend({ role: role.optional() }).parse(req.query);
  const { rows, count } = await User.findAndCountAll({
    where: query.role ? { role: query.role } : {},
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
    order: [['createdAt', 'DESC']],
  });
  res.json(page(rows, count, query));
});

// Shared by the two "change a user" routes below. It:
// - stops admins from changing their own account, so nobody can lock themselves out,
// - applies the change and logs that user out everywhere (their old tokens still carry the
//   old role or status),
// - writes the audit row.
// It all runs in one transaction, so either everything is saved or nothing is.
async function changeUser(req, changes, action) {
  const id = z.uuid('Invalid user id').parse(req.params.id);
  if (id === req.user.id) throw httpError(403, 'FORBIDDEN', 'You cannot change your own account');
  return sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(id, { transaction });
    if (!user) throw httpError(404, 'NOT_FOUND', 'User not found');
    await user.update({ ...changes, tokenVersion: user.tokenVersion + 1 }, { transaction });
    await audit(req.user, action, user.id, changes, transaction);
    return user;
  });
}

// Disables or re-enables an account. A disabled user can't log in.
admin.patch('/users/:id/status', async (req, res) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const action = isActive ? 'USER_ENABLED' : 'USER_DISABLED';
  res.json({ user: await changeUser(req, { isActive }, action) });
});

// Makes a user an admin, or turns an admin back into a normal user.
admin.patch('/users/:id/role', async (req, res) => {
  const changes = z.object({ role }).parse(req.body);
  res.json({ user: await changeUser(req, changes, 'USER_ROLE_CHANGED') });
});

// The admins' Logs page: audit log entries, newest first.
admin.get('/logs', async (req, res) => {
  const query = pageQuery.parse(req.query);
  const { rows, count } = await AuditLog.findAndCountAll({
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
    order: [['createdAt', 'DESC']],
  });
  res.json(page(rows, count, query));
});

router.use('/admin', admin);

module.exports = router;
