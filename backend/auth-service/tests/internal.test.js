const crypto = require('crypto');
const express = require('express');
const { app, request, createUserAndLogin, bearer } = require('./helpers');
const { AuditLog } = require('../src/db');
const shared = require('../shared/verifyJwt.middleware');

const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY;

const entry = (overrides = {}) => ({
  actorId: crypto.randomUUID(),
  actorEmail: 'Admin@X.com',
  actorRole: 'admin',
  action: 'APPOINTMENT_STATUS_UPDATED',
  targetType: 'appointment',
  targetId: '123',
  metadata: { from: 'pending', to: 'approved' },
  occurredAt: '2026-10-05T12:00:00Z',
  ...overrides,
});
const postLog = (body, key = SERVICE_KEY) => {
  const req = request(app).post('/internal/audit-logs');
  if (key) req.set('X-Service-Key', key);
  return req.send(body);
};

describe('POST /internal/audit-logs', () => {
  test('stores the entry with source_service taken from the key, not the body', async () => {
    const res = await postLog(entry({ sourceService: 'auth' }));
    expect(res.status).toBe(201);
    const log = await AuditLog.findByPk(res.body.id);
    expect(log).toMatchObject({
      sourceService: 'booking',
      action: 'APPOINTMENT_STATUS_UPDATED',
      actorEmail: 'admin@x.com',
      targetId: '123',
      metadata: { from: 'pending', to: 'approved' },
    });
    expect(log.createdAt.toISOString()).toBe('2026-10-05T12:00:00.000Z');
  });

  test('missing or wrong service key returns 401', async () => {
    expect((await postLog(entry(), null)).status).toBe(401);
    const wrong = await postLog(entry(), 'wrong-key-wrong-key-wrong');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('a user JWT (even a system admin one) cannot call internal routes', async () => {
    const { accessToken } = await createUserAndLogin({ role: 'system_admin' });
    const res = await request(app)
      .post('/internal/audit-logs')
      .set(bearer(accessToken))
      .send(entry());
    expect(res.status).toBe(401);
  });

  test('invalid body returns 400', async () => {
    expect((await postLog(entry({ action: 'not snake case' }))).status).toBe(400);
    expect((await postLog(entry({ actorRole: 'god' }))).status).toBe(400);
  });
});

describe('GET /admin/logs', () => {
  let root;
  beforeAll(async () => {
    root = await createUserAndLogin({ role: 'system_admin' });
    await postLog(entry({ action: 'OLD_EVENT', occurredAt: '2026-01-01T00:00:00Z' }));
    await postLog(entry({ action: 'NEW_EVENT', occurredAt: '2026-09-01T00:00:00Z' }));
  });
  const getLogs = (query, token = root.accessToken) =>
    request(app).get(`/admin/logs${query}`).set(bearer(token));

  test('returns a paginated list, newest first', async () => {
    const res = await getLogs('?limit=2');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: expect.any(Number) });
    const [a, b] = res.body.data.map((l) => new Date(l.createdAt));
    expect(a >= b).toBe(true);
  });

  test('filters by action and source', async () => {
    const res = await getLogs('?action=OLD_EVENT&source=booking');
    expect(res.body.data.map((l) => l.action)).toEqual(['OLD_EVENT']);
    expect(res.body.data[0].metadata).toEqual({ from: 'pending', to: 'approved' });
  });

  test('filters by date range', async () => {
    const res = await getLogs('?from=2026-08-01&to=2026-09-30');
    expect(res.body.data.map((l) => l.action)).toEqual(['NEW_EVENT']);
  });

  test('filters by actorId', async () => {
    const res = await getLogs(`?actorId=${root.user.id}`);
    // The single system admin logs in more than once in this file; only its own logins match.
    const actions = res.body.data.map((l) => l.action);
    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions)).toEqual(new Set(['ADMIN_LOGIN']));
  });

  test('non-system-admins get 403', async () => {
    const admin = await createUserAndLogin({ role: 'admin' });
    const user = await createUserAndLogin();
    expect((await getLogs('', admin.accessToken)).status).toBe(403);
    expect((await getLogs('', user.accessToken)).status).toBe(403);
  });

  test('bad date returns 400', async () => {
    expect((await getLogs('?from=yesterday')).status).toBe(400);
  });
});

describe('shared/verifyJwt.middleware.js (booking service copy)', () => {
  const booking = express();
  booking.post('/status_update', shared.authenticate, shared.authorize('admin'), (req, res) =>
    res.json({ by: req.user }),
  );

  test('accepts an admin token and rejects a user token, without calling auth', async () => {
    const admin = await createUserAndLogin({ role: 'admin' });
    const user = await createUserAndLogin();
    const ok = await request(booking).post('/status_update').set(bearer(admin.accessToken));
    expect(ok.status).toBe(200);
    expect(ok.body.by).toEqual({ id: admin.user.id, role: 'admin' });
    expect(
      (await request(booking).post('/status_update').set(bearer(user.accessToken))).status,
    ).toBe(403);
    expect((await request(booking).post('/status_update')).status).toBe(401);
    expect((await request(booking).post('/status_update').set(bearer('junk'))).status).toBe(401);
  });
});
