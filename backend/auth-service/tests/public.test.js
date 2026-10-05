const { app, request, PASSWORD, createUser } = require('./helpers');

describe('public routes', () => {
  test('GET /health reports the app and DB as ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  test('unknown route returns 404 in the standard error shape', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('malformed JSON returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('bodies over 10kb are rejected', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ fullName: 'x'.repeat(11 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe('hardening', () => {
  test('helmet security headers are set', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('CORS allows the configured frontend with credentials, and no one else', async () => {
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(app).get('/health').set('Origin', 'http://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('login is rate limited to 5 attempts per IP+email', async () => {
    const user = await createUser();
    const attempt = (email) =>
      request(app).post('/auth/login').send({ email, password: 'Wrong12345' });
    for (let i = 0; i < 5; i++) expect((await attempt(user.email)).status).toBe(401);
    const blocked = await attempt(user.email);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    // Same email in different case shares the bucket; a different email doesn't.
    expect((await attempt(user.email.toUpperCase())).status).toBe(429);
    const other = await createUser();
    expect(
      (await request(app).post('/auth/login').send({ email: other.email, password: PASSWORD }))
        .status,
    ).toBe(200);
  });

  test('reset requests are rate limited to 3 per IP+email', async () => {
    const send = () => request(app).post('/auth/reset').send({ email: 'limit@example.com' });
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });
});
