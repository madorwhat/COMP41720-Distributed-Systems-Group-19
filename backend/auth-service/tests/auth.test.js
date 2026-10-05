const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { app, request, PASSWORD, refreshCookie, createUserAndLogin, bearer } = require('./helpers');
const { User, RefreshToken, AuditLog } = require('../src/db');

const signup = (body) =>
  request(app)
    .post('/auth/signup')
    .send({ email: 'new@example.com', password: PASSWORD, fullName: 'New User', ...body });

describe('POST /auth/signup', () => {
  test('creates a user, returns an access token and sets the refresh cookie', async () => {
    const res = await signup({ email: 'Signup@Example.com' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'signup@example.com', role: 'user' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toEqual(expect.any(String));
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(await AuditLog.count({ where: { action: 'USER_SIGNUP' } })).toBe(1);
  });

  test('ignores role, isActive and id in the body', async () => {
    const res = await signup({
      email: 'sneaky@example.com',
      role: 'system_admin',
      isActive: false,
      id: crypto.randomUUID(),
    });
    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { email: 'sneaky@example.com' } });
    expect(user.role).toBe('user');
    expect(user.isActive).toBe(true);
    expect(user.id).toBe(res.body.user.id);
  });

  test('duplicate email (any case) returns 409 EMAIL_TAKEN', async () => {
    await signup({ email: 'dupe@example.com' });
    const res = await signup({ email: 'DUPE@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test.each([
    [{ email: 'not-an-email' }],
    [{ email: 'weak@example.com', password: 'short1' }],
    [{ email: 'weak2@example.com', password: 'nodigitshere' }],
    [{ email: 'weak3@example.com', password: `a1${'x'.repeat(71)}` }],
    [{ email: 'noname@example.com', fullName: '' }],
  ])('invalid input %j returns 400 VALIDATION_ERROR', async (body) => {
    const res = await signup(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  test('logs in and records last_login_at', async () => {
    await createUserAndLogin({ email: 'login@example.com' });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'LOGIN@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toBeDefined();
    const user = await User.findOne({ where: { email: 'login@example.com' } });
    expect(user.lastLoginAt).not.toBeNull();
  });

  test('wrong password and unknown email give the same 401', async () => {
    await createUserAndLogin({ email: 'known@example.com' });
    const wrong = await request(app)
      .post('/auth/login')
      .send({ email: 'known@example.com', password: 'Wrong12345' });
    const unknown = await request(app)
      .post('/auth/login')
      .send({ email: 'ghost@example.com', password: 'Wrong12345' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('disabled account gets 403 ACCOUNT_DISABLED', async () => {
    await createUserAndLogin({ email: 'off@example.com', isActive: false });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'off@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  test('only admin logins are audited', async () => {
    await createUserAndLogin({ email: 'plain@example.com' });
    await createUserAndLogin({ email: 'boss@example.com', role: 'admin' });
    const logs = await AuditLog.findAll({ where: { action: 'ADMIN_LOGIN' } });
    expect(logs.map((l) => l.actorEmail)).toEqual(['boss@example.com']);
  });
});

describe('POST /auth/refresh', () => {
  test('rotates the refresh token', async () => {
    const { cookie } = await createUserAndLogin({ email: 'rotate@example.com' });
    const res = await request(app).post('/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: expect.any(String) });
    const newCookie = refreshCookie(res);
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(cookie);
    const old = await RefreshToken.findOne({
      where: { revokedAt: { [require('sequelize').Op.ne]: null } },
    });
    expect(old.replacedById).not.toBeNull();
  });

  test('missing or unknown cookie returns 401', async () => {
    expect((await request(app).post('/auth/refresh')).status).toBe(401);
    const res = await request(app).post('/auth/refresh').set('Cookie', 'refresh_token=garbage');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('reusing an old refresh token kills every session', async () => {
    const { user, cookie, accessToken } = await createUserAndLogin({ email: 'reuse@example.com' });
    const rotated = await request(app).post('/auth/refresh').set('Cookie', cookie);
    const newCookie = refreshCookie(rotated);

    const replay = await request(app).post('/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);
    await user.reload();
    expect(user.tokenVersion).toBe(1);
    expect(await AuditLog.count({ where: { action: 'REFRESH_TOKEN_REUSE_DETECTED' } })).toBe(1);

    // The legitimately rotated token is now dead too, and so is the old access token.
    expect((await request(app).post('/auth/refresh').set('Cookie', newCookie)).status).toBe(401);
    expect((await request(app).get('/auth/me').set(bearer(accessToken))).status).toBe(401);
  });

  test('expired refresh token returns 401', async () => {
    const { cookie } = await createUserAndLogin({ email: 'stale@example.com' });
    await RefreshToken.update({ expiresAt: new Date(Date.now() - 1000) }, { where: {} });
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  test('disabled user cannot refresh', async () => {
    const { user, cookie } = await createUserAndLogin({ email: 'gone@example.com' });
    await user.update({ isActive: false });
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  test('revokes the refresh token and clears the cookie', async () => {
    const { cookie } = await createUserAndLogin({ email: 'bye@example.com' });
    const res = await request(app).post('/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'].join(';')).toMatch(/refresh_token=;/);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  test('is idempotent: 204 with no cookie', async () => {
    expect((await request(app).post('/auth/logout')).status).toBe(204);
  });

  test('logout-all revokes every session and the current access token', async () => {
    const { accessToken, cookie } = await createUserAndLogin({ email: 'all@example.com' });
    const res = await request(app).post('/auth/logout-all').set(bearer(accessToken));
    expect(res.status).toBe(204);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).get('/auth/me').set(bearer(accessToken))).status).toBe(401);
  });

  test('logout-all requires authentication', async () => {
    expect((await request(app).post('/auth/logout-all')).status).toBe(401);
  });
});

describe('GET /auth/me and token verification', () => {
  const sign = (payload, key, options) =>
    jwt.sign(payload, key, { issuer: 'visa-auth-service', audience: 'visa-platform', ...options });

  test('returns the current user', async () => {
    const { accessToken } = await createUserAndLogin({ email: 'me@example.com' });
    const res = await request(app).get('/auth/me').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'me@example.com', role: 'user' });
    expect(res.body.user.createdAt).toBeDefined();
    expect(res.body.user.tokenVersion).toBeUndefined();
  });

  test('missing token returns 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('expired token returns 401 TOKEN_EXPIRED', async () => {
    const { user } = await createUserAndLogin({ email: 'exp@example.com' });
    const token = sign(
      { role: 'user', tv: 0, exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_PRIVATE_KEY,
      {
        algorithm: 'RS256',
        subject: user.id,
      },
    );
    const res = await request(app).get('/auth/me').set(bearer(token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('token signed with a different key returns 401', async () => {
    const { user } = await createUserAndLogin({ email: 'forge@example.com' });
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = sign({ role: 'system_admin', tv: 0 }, privateKey, {
      algorithm: 'RS256',
      subject: user.id,
    });
    expect((await request(app).get('/auth/me').set(bearer(token))).status).toBe(401);
  });

  test('alg "none" and HS256-with-public-key tokens are rejected', async () => {
    const { user } = await createUserAndLogin({ email: 'none@example.com' });
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const claims = {
      sub: user.id,
      role: 'system_admin',
      tv: 0,
      iss: 'visa-auth-service',
      aud: 'visa-platform',
      exp: Math.floor(Date.now() / 1000) + 600,
    };
    const noneToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;
    const hmacSig = crypto
      .createHmac('sha256', process.env.JWT_PUBLIC_KEY)
      .update(`${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`)
      .digest('base64url');
    const hsToken = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.${hmacSig}`;
    expect((await request(app).get('/auth/me').set(bearer(noneToken))).status).toBe(401);
    expect((await request(app).get('/auth/me').set(bearer(hsToken))).status).toBe(401);
  });

  test('access token carries the documented claims and no PII', async () => {
    const { user, accessToken } = await createUserAndLogin({ email: 'claims@example.com' });
    const { header, payload } = jwt.decode(accessToken, { complete: true });
    expect(header).toMatchObject({ alg: 'RS256', kid: expect.any(String) });
    expect(payload).toMatchObject({
      sub: user.id,
      role: 'user',
      tv: 0,
      iss: 'visa-auth-service',
      aud: 'visa-platform',
    });
    expect(payload.jti).toEqual(expect.any(String));
    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(payload.email).toBeUndefined();
  });
});

describe('GET /.well-known/jwks.json', () => {
  test('publishes a JWK that verifies issued tokens', async () => {
    const { accessToken } = await createUserAndLogin({ email: 'jwks@example.com' });
    const res = await request(app).get('/.well-known/jwks.json');
    expect(res.status).toBe(200);
    const [jwk] = res.body.keys;
    expect(jwk).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
    expect(jwt.decode(accessToken, { complete: true }).header.kid).toBe(jwk.kid);
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    expect(() => jwt.verify(accessToken, key, { algorithms: ['RS256'] })).not.toThrow();
    expect(jwk.d).toBeUndefined(); // never the private part
  });
});
