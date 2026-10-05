const { app, request, PASSWORD, refreshCookie, createUserAndLogin, bearer } = require('./helpers');
const { AuditLog, PasswordResetToken } = require('../src/db');
const notification = require('../src/services/notification.client');

const NEW_PASSWORD = 'BrandNew456';
const GENERIC = { message: 'If that email exists, a reset link has been sent.' };

let sendSpy;
beforeEach(() => {
  sendSpy = jest.spyOn(notification, 'sendPasswordReset').mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

const requestReset = (email) => request(app).post('/auth/reset').send({ email });
const confirm = (token, newPassword = NEW_PASSWORD) =>
  request(app).post('/auth/reset/confirm').send({ token, newPassword });
const login = (email, password) => request(app).post('/auth/login').send({ email, password });

// Pulls the raw token out of the reset URL handed to the notification client.
const lastResetToken = () => new URL(sendSpy.mock.calls.at(-1)[1]).searchParams.get('token');

describe('POST /auth/reset', () => {
  test('unknown email still returns the generic 200 and sends nothing', async () => {
    const res = await requestReset('nobody@example.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GENERIC);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test('known email returns the same 200 and sends a frontend reset link', async () => {
    const { user } = await createUserAndLogin();
    const res = await requestReset(user.email.toUpperCase());
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GENERIC);
    expect(sendSpy).toHaveBeenCalledWith(
      user.email,
      expect.stringMatching(/^http:\/\/localhost:3000\/reset-password\?token=/),
    );
    expect(JSON.stringify(res.body)).not.toContain(lastResetToken()); // raw token never in a response
  });

  test('a notification failure does not change the response', async () => {
    sendSpy.mockRejectedValue(new Error('notification service down'));
    const { user } = await createUserAndLogin();
    const res = await requestReset(user.email);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GENERIC);
  });

  test('invalid email returns 400', async () => {
    expect((await requestReset('nope')).status).toBe(400);
  });
});

describe('POST /auth/reset/confirm', () => {
  test('sets the new password, revokes all sessions and audits', async () => {
    const { user, cookie, accessToken } = await createUserAndLogin();
    await requestReset(user.email);
    const res = await confirm(lastResetToken());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Password updated' });

    expect((await login(user.email, PASSWORD)).status).toBe(401);
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).get('/auth/me').set(bearer(accessToken))).status).toBe(401);
    expect(await AuditLog.count({ where: { action: 'PASSWORD_RESET', targetId: user.id } })).toBe(
      1,
    );
  });

  test('a token works only once', async () => {
    const { user } = await createUserAndLogin();
    await requestReset(user.email);
    const token = lastResetToken();
    expect((await confirm(token)).status).toBe(200);
    const again = await confirm(token, 'Another789');
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('an expired token is rejected', async () => {
    const { user } = await createUserAndLogin();
    await requestReset(user.email);
    await PasswordResetToken.update(
      { expiresAt: new Date(Date.now() - 1000) },
      { where: { userId: user.id } },
    );
    expect((await confirm(lastResetToken())).status).toBe(400);
  });

  test('a new request invalidates the previous token', async () => {
    const { user } = await createUserAndLogin();
    await requestReset(user.email);
    const first = lastResetToken();
    await requestReset(user.email);
    const second = lastResetToken();
    expect((await confirm(first)).status).toBe(400);
    expect((await confirm(second)).status).toBe(200);
  });

  test('garbage token and weak password are rejected', async () => {
    expect((await confirm('garbage')).status).toBe(400);
    const { user } = await createUserAndLogin();
    await requestReset(user.email);
    expect((await confirm(lastResetToken(), 'weak')).status).toBe(400);
  });
});

describe('PATCH /auth/me/password', () => {
  const change = (token, body) =>
    request(app).patch('/auth/me/password').set(bearer(token)).send(body);

  test('changes the password, keeps this session alive and kills the others', async () => {
    const { user, accessToken, cookie } = await createUserAndLogin();
    const res = await change(accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);

    // Fresh pair works...
    expect((await request(app).get('/auth/me').set(bearer(res.body.accessToken))).status).toBe(200);
    expect(
      (await request(app).post('/auth/refresh').set('Cookie', refreshCookie(res))).status,
    ).toBe(200);
    // ...old pair doesn't.
    expect((await request(app).get('/auth/me').set(bearer(accessToken))).status).toBe(401);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);

    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    expect(await AuditLog.count({ where: { action: 'PASSWORD_CHANGED', targetId: user.id } })).toBe(
      1,
    );
  });

  test('wrong current password returns 401 INVALID_CREDENTIALS', async () => {
    const { accessToken } = await createUserAndLogin();
    const res = await change(accessToken, {
      currentPassword: 'Wrong12345',
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .patch('/auth/me/password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });
});

describe('notification client', () => {
  const loadClient = (url) => {
    process.env.NOTIFICATION_SERVICE_URL = url;
    let client;
    jest.isolateModules(() => {
      client = require('../src/services/notification.client');
    });
    delete process.env.NOTIFICATION_SERVICE_URL;
    return client;
  };

  test('posts to the notification service when configured', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
    await loadClient('http://notify.local/').sendPasswordReset('a@example.com', 'http://x/reset');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://notify.local/notify/password-reset',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@example.com', resetUrl: 'http://x/reset' }),
      }),
    );
  });

  test('swallows network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      loadClient('http://notify.local').sendPasswordReset('a@example.com', 'u'),
    ).resolves.toBeUndefined();
  });

  test('does not call out when no URL is configured (dev console mode)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await loadClient('').sendPasswordReset('a@example.com', 'u');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
