// End-to-end: every endpoint, over real HTTP, against the real server process.
// Run with `npm run test:e2e` (SQLite) or `E2E_DATABASE_URL=postgres://... npm run test:e2e`.
// Tests run in order and share state, like one story: sign up -> admin work -> booking -> reset -> logout.
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { SERVICE_KEY, startFakeNotifier, startAuthService, createClient } = require('./harness');

jest.setTimeout(30000);

const RUN = Date.now().toString(36); // unique emails, so reruns against the same DB still work
const email = (name) => `${name}-${RUN}@example.com`;
const PASSWORD = 'Password123';
const ROOT = { email: 'sysadmin@example.com', password: PASSWORD }; // the single seeded system admin

let notifier;
let service;
let newClient;
let startedAt;

beforeAll(async () => {
  startedAt = new Date(); // same clock as the server, so earlier runs' rows are strictly older
  notifier = await startFakeNotifier();
  service = await startAuthService({ notifierUrl: notifier.url });
  newClient = () => createClient(service.baseUrl);
});

afterAll(async () => {
  await service?.stop();
  await notifier?.close();
});

// Signs up a fresh account and returns a logged-in client.
async function signedUp(name) {
  const client = newClient();
  const res = await client.call('POST', '/auth/signup', {
    body: { email: email(name), password: PASSWORD, fullName: `${name} ${RUN}` },
  });
  expect(res.status).toBe(201);
  client.user = res.body.user;
  return client;
}

async function loggedIn(emailAddress, password) {
  const client = newClient();
  const res = await client.call('POST', '/auth/login', { body: { email: emailAddress, password } });
  expect(res.status).toBe(200);
  client.user = res.body.user;
  return client;
}

const actors = {};

describe('infrastructure', () => {
  test('GET /health', async () => {
    const res = await newClient().call('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  test('GET /.well-known/jwks.json', async () => {
    const res = await newClient().call('GET', '/.well-known/jwks.json');
    expect(res.status).toBe(200);
    expect(res.body.keys[0]).toMatchObject({
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      kid: expect.any(String),
    });
  });

  test('unknown route -> 404 NOT_FOUND', async () => {
    const res = await newClient().call('GET', '/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('CORS preflight allows the frontend origin with credentials', async () => {
    const res = await newClient().call('OPTIONS', '/auth/login', {
      headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });
});

describe('signup, login, me, refresh', () => {
  test('POST /auth/signup creates a user (role in body ignored) and sets an httpOnly cookie', async () => {
    const client = newClient();
    const res = await client.call('POST', '/auth/signup', {
      body: {
        email: email('Alice').toUpperCase(),
        password: PASSWORD,
        fullName: 'Alice',
        role: 'system_admin',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: email('alice'), role: 'user' });
    expect(res.setCookie).toMatch(/HttpOnly/);
    expect(res.setCookie).toMatch(/Path=\/auth/);
    expect(res.setCookie).toMatch(/SameSite=Strict/);
    client.user = res.body.user;
    actors.alice = client;
  });

  test('POST /auth/signup rejects duplicates (409) and bad input (400)', async () => {
    const dup = await newClient().call('POST', '/auth/signup', {
      body: { email: email('alice'), password: PASSWORD, fullName: 'Again' },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
    const bad = await newClient().call('POST', '/auth/signup', {
      body: { email: 'nope', password: 'short', fullName: '' },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('GET /auth/me with and without a token', async () => {
    const res = await actors.alice.call('GET', '/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email('alice'));
    expect((await newClient().call('GET', '/auth/me')).status).toBe(401);
  });

  test('POST /auth/refresh rotates the cookie and returns a working access token', async () => {
    const before = actors.alice.cookie;
    const res = await actors.alice.call('POST', '/auth/refresh', { bearer: false });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['accessToken']);
    expect(actors.alice.cookie).not.toBe(before);
    expect((await actors.alice.call('GET', '/auth/me')).status).toBe(200);
  });

  test('POST /auth/refresh without a cookie -> 401', async () => {
    expect((await newClient().call('POST', '/auth/refresh')).status).toBe(401);
  });

  test('POST /auth/login: wrong password and unknown email look identical', async () => {
    const wrong = await newClient().call('POST', '/auth/login', {
      body: { email: email('alice'), password: 'Wrong12345' },
    });
    const unknown = await newClient().call('POST', '/auth/login', {
      body: { email: email('ghost'), password: 'Wrong12345' },
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('POST /auth/login succeeds and the token works', async () => {
    const client = await loggedIn(email('alice'), PASSWORD);
    expect((await client.call('GET', '/auth/me')).status).toBe(200);
  });

  test('forged tokens are rejected', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const claims = {
      sub: actors.alice.user?.id,
      role: 'system_admin',
      tv: 0,
      iss: 'visa-auth-service',
      aud: 'visa-platform',
    };
    const client = newClient();
    client.accessToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;
    expect((await client.call('GET', '/admin/users')).status).toBe(401);
  });
});

describe('system admin and admin management', () => {
  test('the seeded system admin can log in', async () => {
    actors.root = await loggedIn(ROOT.email, ROOT.password);
    expect(actors.root.user.role).toBe('system_admin');
  });

  test('POST /admin/admins: system admin creates an admin; a user cannot', async () => {
    const body = { email: email('adam'), password: PASSWORD, fullName: 'Adam Admin' };
    expect((await actors.alice.call('POST', '/admin/admins', { body })).status).toBe(403);
    const res = await actors.root.call('POST', '/admin/admins', { body });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
    actors.adam = await loggedIn(email('adam'), PASSWORD);
  });

  test('GET /admin/users: list, role filter, search, pagination', async () => {
    actors.bob = await signedUp('bob');
    actors.carol = await signedUp('carol');

    const all = await actors.adam.call('GET', `/admin/users?q=${RUN}&limit=2&page=1`);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, limit: 2 });
    expect(all.body.data).toHaveLength(2);
    expect(all.body.total).toBeGreaterThanOrEqual(4);

    const admins = await actors.adam.call('GET', `/admin/users?role=admin&q=${RUN}`);
    expect(admins.body.data.map((u) => u.email)).toEqual([email('adam')]);

    const search = await actors.adam.call('GET', `/admin/users?q=BOB-${RUN}`);
    expect(search.body.data.map((u) => u.email)).toEqual([email('bob')]);

    expect((await actors.alice.call('GET', '/admin/users')).status).toBe(403);
  });

  test('GET /admin/users/:id: found, not found, malformed', async () => {
    const res = await actors.adam.call('GET', `/admin/users/${actors.bob.user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email('bob'));
    expect((await actors.adam.call('GET', `/admin/users/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await actors.adam.call('GET', '/admin/users/not-a-uuid')).status).toBe(400);
  });

  test('PATCH /admin/users/:id/status: admin disables a user, who is locked out everywhere', async () => {
    const res = await actors.adam.call('PATCH', `/admin/users/${actors.bob.user.id}/status`, {
      body: { isActive: false },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);

    expect((await actors.bob.call('GET', '/auth/me')).status).toBe(401);
    expect((await actors.bob.call('POST', '/auth/refresh')).status).toBe(401);
    const login = await newClient().call('POST', '/auth/login', {
      body: { email: email('bob'), password: PASSWORD },
    });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  test('PATCH /admin/users/:id/status: admins cannot touch admins or themselves; system admin re-enables', async () => {
    const otherAdmin = await actors.root.call('POST', '/admin/admins', {
      body: { email: email('olga'), password: PASSWORD, fullName: 'Olga Admin' },
    });
    expect(
      (
        await actors.adam.call('PATCH', `/admin/users/${otherAdmin.body.user.id}/status`, {
          body: { isActive: false },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await actors.adam.call('PATCH', `/admin/users/${actors.adam.user.id}/status`, {
          body: { isActive: false },
        })
      ).status,
    ).toBe(403);

    const res = await actors.root.call('PATCH', `/admin/users/${actors.bob.user.id}/status`, {
      body: { isActive: true },
    });
    expect(res.status).toBe(200);
    actors.bob = await loggedIn(email('bob'), PASSWORD);
  });

  test('PATCH /admin/users/:id/role: promote, then demote, takes effect at once inside auth', async () => {
    const promote = await actors.root.call('PATCH', `/admin/users/${actors.carol.user.id}/role`, {
      body: { role: 'admin' },
    });
    expect(promote.status).toBe(200);
    expect(promote.body.user.role).toBe('admin');
    expect((await actors.carol.call('GET', '/auth/me')).status).toBe(401); // old session killed

    actors.carol = await loggedIn(email('carol'), PASSWORD);
    expect((await actors.carol.call('GET', '/admin/users')).status).toBe(200);

    const demote = await actors.root.call('PATCH', `/admin/users/${actors.carol.user.id}/role`, {
      body: { role: 'user' },
    });
    expect(demote.status).toBe(200);
    actors.carol = await loggedIn(email('carol'), PASSWORD);
    expect((await actors.carol.call('GET', '/admin/users')).status).toBe(403);
  });

  test('PATCH /admin/users/:id/role: forbidden cases', async () => {
    const self = await actors.root.call('PATCH', `/admin/users/${actors.root.user.id}/role`, {
      body: { role: 'user' },
    });
    expect(self.status).toBe(403);
    const toRoot = await actors.root.call('PATCH', `/admin/users/${actors.bob.user.id}/role`, {
      body: { role: 'system_admin' },
    });
    expect(toRoot.status).toBe(400);
    const byAdmin = await actors.adam.call('PATCH', `/admin/users/${actors.bob.user.id}/role`, {
      body: { role: 'admin' },
    });
    expect(byAdmin.status).toBe(403);
  });
});

describe('booking service integration', () => {
  let booking;

  beforeAll(async () => {
    // A mini booking service that only knows the public key, fetched from the JWKS endpoint.
    const { body } = await newClient().call('GET', '/.well-known/jwks.json');
    const pem = crypto
      .createPublicKey({ key: body.keys[0], format: 'jwk' })
      .export({ type: 'spki', format: 'pem' });
    let shared;
    const savedKey = process.env.JWT_PUBLIC_KEY;
    process.env.JWT_PUBLIC_KEY = pem;
    jest.isolateModules(() => {
      shared = require('../../shared/verifyJwt.middleware');
    });
    process.env.JWT_PUBLIC_KEY = savedKey;

    booking = express();
    booking.post('/status_update', shared.authenticate, shared.authorize('admin'), (req, res) =>
      res.json({ by: req.user }),
    );
  });

  test('booking verifies auth-issued tokens locally and enforces roles', async () => {
    const ok = await request(booking)
      .post('/status_update')
      .set('Authorization', `Bearer ${actors.adam.accessToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.by).toEqual({ id: actors.adam.user.id, role: 'admin' });
    const user = await request(booking)
      .post('/status_update')
      .set('Authorization', `Bearer ${actors.alice.accessToken}`);
    expect(user.status).toBe(403);
    expect((await request(booking).post('/status_update')).status).toBe(401);
  });

  test('POST /internal/audit-logs accepts the service key only', async () => {
    const entry = {
      actorId: actors.adam.user.id,
      actorEmail: email('adam'),
      actorRole: 'admin',
      action: 'APPOINTMENT_STATUS_UPDATED',
      targetType: 'appointment',
      targetId: `appt-${RUN}`,
      metadata: { from: 'pending', to: 'approved' },
      occurredAt: new Date().toISOString(),
    };
    const ok = await newClient().call('POST', '/internal/audit-logs', {
      body: entry,
      headers: { 'X-Service-Key': SERVICE_KEY },
    });
    expect(ok.status).toBe(201);
    expect(ok.body.id).toEqual(expect.any(String));

    const wrongKey = await newClient().call('POST', '/internal/audit-logs', {
      body: entry,
      headers: { 'X-Service-Key': 'x'.repeat(26) },
    });
    expect(wrongKey.status).toBe(401);
    expect((await actors.root.call('POST', '/internal/audit-logs', { body: entry })).status).toBe(
      401,
    );
  });
});

describe('audit logs page', () => {
  test('GET /admin/logs: the trail has every admin action from this run, newest first', async () => {
    const res = await actors.root.call(
      'GET',
      `/admin/logs?from=${startedAt.toISOString()}&limit=100`,
    );
    expect(res.status).toBe(200);
    const actions = new Set(res.body.data.map((l) => l.action));
    for (const action of [
      'USER_SIGNUP',
      'ADMIN_LOGIN',
      'ADMIN_CREATED',
      'USER_DISABLED',
      'USER_ENABLED',
      'USER_ROLE_CHANGED',
      'APPOINTMENT_STATUS_UPDATED',
    ]) {
      expect(actions).toContain(action);
    }
    const times = res.body.data.map((l) => new Date(l.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test('GET /admin/logs: filters by source, action and actor', async () => {
    // Filter by this run's admin, not just time, so back-to-back reruns on one DB don't overlap.
    const booking = await actors.root.call(
      'GET',
      `/admin/logs?source=booking&actorId=${actors.adam.user.id}`,
    );
    expect(booking.body.data.map((l) => l.targetId)).toEqual([`appt-${RUN}`]);
    expect(booking.body.data[0].metadata).toEqual({ from: 'pending', to: 'approved' });

    const roles = await actors.root.call(
      'GET',
      `/admin/logs?action=USER_ROLE_CHANGED&actorId=${actors.root.user.id}&from=${startedAt.toISOString()}`,
    );
    expect(roles.body.data.map((l) => l.metadata)).toEqual([
      { from: 'admin', to: 'user' },
      { from: 'user', to: 'admin' },
    ]);
  });

  test('GET /admin/logs: admins and users get 403', async () => {
    expect((await actors.adam.call('GET', '/admin/logs')).status).toBe(403);
    expect((await actors.alice.call('GET', '/admin/logs')).status).toBe(403);
  });
});

describe('password reset and change', () => {
  test('POST /auth/reset: same answer for known and unknown emails; only known ones get an email', async () => {
    const before = notifier.sent.length;
    const unknown = await newClient().call('POST', '/auth/reset', {
      body: { email: email('ghost') },
    });
    const known = await newClient().call('POST', '/auth/reset', {
      body: { email: email('alice') },
    });
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    // Delivery is fire-and-forget, so give the notifier a moment.
    for (let i = 0; i < 20 && notifier.sent.length === before; i++)
      await new Promise((r) => setTimeout(r, 50));
    expect(notifier.sent).toHaveLength(before + 1);
    const mail = notifier.sent.at(-1);
    expect(mail).toMatchObject({ path: '/notify/password-reset', email: email('alice') });
    expect(mail.resetUrl).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=/);
  });

  test('POST /auth/reset/confirm: sets the new password once and ends every session', async () => {
    const token = new URL(notifier.sent.at(-1).resetUrl).searchParams.get('token');
    const res = await newClient().call('POST', '/auth/reset/confirm', {
      body: { token, newPassword: 'ResetPass456' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Password updated' });

    const reused = await newClient().call('POST', '/auth/reset/confirm', {
      body: { token, newPassword: 'Another789' },
    });
    expect(reused.status).toBe(400);
    expect((await actors.alice.call('GET', '/auth/me')).status).toBe(401);

    const oldPw = await newClient().call('POST', '/auth/login', {
      body: { email: email('alice'), password: PASSWORD },
    });
    expect(oldPw.status).toBe(401);
    actors.alice = await loggedIn(email('alice'), 'ResetPass456');
  });

  test('PATCH /auth/me/password: wrong current password, then a successful change', async () => {
    const wrong = await actors.alice.call('PATCH', '/auth/me/password', {
      body: { currentPassword: 'Nope12345', newPassword: PASSWORD },
    });
    expect(wrong.status).toBe(401);

    const otherTab = await loggedIn(email('alice'), 'ResetPass456');
    const res = await actors.alice.call('PATCH', '/auth/me/password', {
      body: { currentPassword: 'ResetPass456', newPassword: PASSWORD },
    });
    expect(res.status).toBe(200);
    expect((await actors.alice.call('GET', '/auth/me')).status).toBe(200); // this tab survives
    expect((await otherTab.call('GET', '/auth/me')).status).toBe(401); // other tabs don't
  });
});

describe('logout and session security', () => {
  test('POST /auth/logout clears the cookie and kills the refresh token; idempotent', async () => {
    const client = await loggedIn(email('carol'), PASSWORD);
    const stolenCopy = client.cookie;
    const res = await client.call('POST', '/auth/logout');
    expect(res.status).toBe(204);
    expect(client.cookie).toBeNull();

    const replay = newClient();
    replay.cookie = stolenCopy;
    expect((await replay.call('POST', '/auth/refresh')).status).toBe(401);
    expect((await newClient().call('POST', '/auth/logout')).status).toBe(204);
  });

  test('POST /auth/logout-all ends sessions on every device', async () => {
    const phone = await signedUp('erin');
    const laptop = await loggedIn(email('erin'), PASSWORD);
    expect((await laptop.call('POST', '/auth/logout-all')).status).toBe(204);
    expect((await phone.call('GET', '/auth/me')).status).toBe(401);
    expect((await phone.call('POST', '/auth/refresh')).status).toBe(401);
    expect((await newClient().call('POST', '/auth/logout-all')).status).toBe(401);
  });

  test('replaying a rotated refresh token logs the victim out everywhere and is audited', async () => {
    const victim = await signedUp('frank');
    const stolenCopy = victim.cookie;
    expect((await victim.call('POST', '/auth/refresh')).status).toBe(200);

    const attacker = newClient();
    attacker.cookie = stolenCopy;
    expect((await attacker.call('POST', '/auth/refresh')).status).toBe(401);
    expect((await victim.call('POST', '/auth/refresh')).status).toBe(401);

    const logs = await actors.root.call(
      'GET',
      `/admin/logs?action=REFRESH_TOKEN_REUSE_DETECTED&from=${startedAt.toISOString()}`,
    );
    expect(logs.body.data.map((l) => l.targetId)).toContain(victim.user.id);
  });

  test('login is rate limited after 5 attempts', async () => {
    await signedUp('gina');
    const attempt = () =>
      newClient().call('POST', '/auth/login', {
        body: { email: email('gina'), password: 'Wrong12345' },
      });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  test('the server log never contains passwords or tokens', () => {
    const log = service.output();
    expect(log).not.toContain(PASSWORD);
    expect(log).not.toContain(ROOT.password);
    expect(log).not.toContain(actors.alice.accessToken);
    expect(log).not.toMatch(/refresh_token=[A-Za-z0-9_-]{20}/);
  });
});
