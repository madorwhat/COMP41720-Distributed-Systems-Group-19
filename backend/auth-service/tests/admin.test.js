const { app, request, PASSWORD, createUser, createUserAndLogin, bearer } = require('./helpers');
const { AuditLog, User } = require('../src/db');

let admin;
let sysadmin;
beforeAll(async () => {
  admin = await createUserAndLogin({ email: 'the-admin@example.com', role: 'admin' });
  sysadmin = await createUserAndLogin({ email: 'root@example.com', role: 'system_admin' });
});

const auditCount = (action, targetId) => AuditLog.count({ where: { action, targetId } });

describe('GET /admin/users', () => {
  beforeAll(async () => {
    await createUser({ email: 'alice@example.com' });
    await createUser({ email: 'percent@example.com' });
    await User.update({ fullName: 'Has 100% Name' }, { where: { email: 'percent@example.com' } });
  });

  test('returns a paginated list in the documented shape', async () => {
    const res = await request(app)
      .get('/admin/users?page=1&limit=2')
      .set(bearer(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: expect.any(Number) });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].passwordHash).toBeUndefined();
  });

  test('filters by role', async () => {
    const res = await request(app)
      .get('/admin/users?role=system_admin')
      .set(bearer(admin.accessToken));
    expect(res.body.data.map((u) => u.email)).toEqual(['root@example.com']);
  });

  test('q searches email and name case-insensitively, with % treated literally', async () => {
    const byEmail = await request(app).get('/admin/users?q=ALICE').set(bearer(admin.accessToken));
    expect(byEmail.body.data.map((u) => u.email)).toEqual(['alice@example.com']);
    const byName = await request(app).get('/admin/users?q=100%25').set(bearer(admin.accessToken));
    expect(byName.body.data.map((u) => u.email)).toEqual(['percent@example.com']);
  });

  test('rejects limit above 100', async () => {
    const res = await request(app).get('/admin/users?limit=500').set(bearer(admin.accessToken));
    expect(res.status).toBe(400);
  });

  test('requires a token', async () => {
    expect((await request(app).get('/admin/users')).status).toBe(401);
  });
});

describe('GET /admin/users/:id', () => {
  test('returns one user', async () => {
    const target = await createUser();
    const res = await request(app).get(`/admin/users/${target.id}`).set(bearer(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(target.id);
  });

  test('404 for unknown id, 400 for malformed id', async () => {
    const missing = await request(app)
      .get('/admin/users/00000000-0000-4000-8000-000000000000')
      .set(bearer(admin.accessToken));
    expect(missing.status).toBe(404);
    const bad = await request(app).get('/admin/users/not-a-uuid').set(bearer(admin.accessToken));
    expect(bad.status).toBe(400);
  });
});

describe('PATCH /admin/users/:id/status', () => {
  test('disabling revokes the target sessions and writes exactly one audit row', async () => {
    const target = await createUserAndLogin();
    const res = await request(app)
      .patch(`/admin/users/${target.user.id}/status`)
      .set(bearer(admin.accessToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);
    expect((await request(app).post('/auth/refresh').set('Cookie', target.cookie)).status).toBe(
      401,
    );
    expect((await request(app).get('/auth/me').set(bearer(target.accessToken))).status).toBe(401);
    expect(await auditCount('USER_DISABLED', target.user.id)).toBe(1);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: target.user.email, password: PASSWORD });
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  test('no-op change returns 200 without an audit row', async () => {
    const target = await createUser();
    const res = await request(app)
      .patch(`/admin/users/${target.id}/status`)
      .set(bearer(admin.accessToken))
      .send({ isActive: true });
    expect(res.status).toBe(200);
    expect(await AuditLog.count({ where: { targetId: target.id } })).toBe(0);
  });

  test('admin cannot disable another admin', async () => {
    const other = await createUser({ role: 'admin' });
    const res = await request(app)
      .patch(`/admin/users/${other.id}/status`)
      .set(bearer(admin.accessToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('admins cannot change their own status', async () => {
    const res = await request(app)
      .patch(`/admin/users/${admin.user.id}/status`)
      .set(bearer(admin.accessToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  test('isActive must be a boolean', async () => {
    const target = await createUser();
    const res = await request(app)
      .patch(`/admin/users/${target.id}/status`)
      .set(bearer(admin.accessToken))
      .send({ isActive: 'no' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /admin/users/:id/role', () => {
  test('demotion bumps tv, kills the old refresh token and audits from/to', async () => {
    const target = await createUserAndLogin({ role: 'admin' });
    const res = await request(app)
      .patch(`/admin/users/${target.user.id}/role`)
      .set(bearer(sysadmin.accessToken))
      .send({ role: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('user');

    await target.user.reload();
    expect(target.user.tokenVersion).toBe(1);
    expect((await request(app).post('/auth/refresh').set('Cookie', target.cookie)).status).toBe(
      401,
    );
    // Inside the auth service the old admin token stops working immediately.
    expect((await request(app).get('/admin/users').set(bearer(target.accessToken))).status).toBe(
      401,
    );

    const logs = await AuditLog.findAll({
      where: { action: 'USER_ROLE_CHANGED', targetId: target.user.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorEmail: 'root@example.com',
      actorRole: 'system_admin',
      metadata: { from: 'admin', to: 'user' },
    });
  });

  test('no-op role change writes no audit row', async () => {
    const target = await createUser({ role: 'admin' });
    const res = await request(app)
      .patch(`/admin/users/${target.id}/role`)
      .set(bearer(sysadmin.accessToken))
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(await auditCount('USER_ROLE_CHANGED', target.id)).toBe(0);
  });

  test('a system admin cannot be demoted via the API, not even themselves', async () => {
    const res = await request(app)
      .patch(`/admin/users/${sysadmin.user.id}/role`)
      .set(bearer(sysadmin.accessToken))
      .send({ role: 'user' });
    expect(res.status).toBe(403);
    await sysadmin.user.reload();
    expect(sysadmin.user.role).toBe('system_admin');
  });
});

describe('POST /admin/admins', () => {
  test('creates an admin account with exactly one audit row', async () => {
    const res = await request(app).post('/admin/admins').set(bearer(sysadmin.accessToken)).send({
      email: 'fresh-admin@example.com',
      password: PASSWORD,
      fullName: 'Fresh',
      role: 'system_admin',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'fresh-admin@example.com', role: 'admin' });
    expect(await auditCount('ADMIN_CREATED', res.body.user.id)).toBe(1);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'fresh-admin@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
  });

  test('duplicate email returns 409', async () => {
    const res = await request(app)
      .post('/admin/admins')
      .set(bearer(sysadmin.accessToken))
      .send({ email: 'the-admin@example.com', password: PASSWORD, fullName: 'Dup' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});
