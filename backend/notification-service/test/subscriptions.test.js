// Checks that need no database: who may call the subscription routes, and what they may send.
// (Everything here is answered before the code would touch the database.)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const keys = () =>
  crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
const authKeys = keys(); // plays the part of the Auth service's key pair
const strangerKeys = keys(); // somebody else's key pair
process.env.JWT_PUBLIC_KEY = authKeys.publicKey; // must be set before the service code reads it

const subscriptions = require('../src/routes/subscriptions');

const claims = { email: 'me@example.com', name: 'Me', role: 'user' };
const options = {
  algorithm: 'RS256',
  subject: crypto.randomUUID(),
  issuer: 'visa-auth-service',
  audience: 'visa-platform',
};
const token = (key = authKeys.privateKey, extra = {}, opts = {}) =>
  jwt.sign({ ...claims, ...extra }, key, { expiresIn: '5m', ...options, ...opts });

let server;
let base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/subscriptions', subscriptions);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = async (method, path, bearer) => {
  const res = await fetch(base + path, {
    method,
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

test('no token: 401 on every route', async () => {
  for (const [method, path] of [
    ['GET', '/subscriptions'],
    ['PUT', '/subscriptions/UK/Tourist'],
    ['DELETE', '/subscriptions/UK/Tourist'],
  ]) {
    const res = await call(method, path);
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  }
});

test("tokens that are not Auth's are refused", async () => {
  const bad = {
    garbage: 'not.a.token',
    "signed with somebody else's key": token(strangerKeys.privateKey),
    expired: token(authKeys.privateKey, {}, { expiresIn: -10 }),
    'wrong issuer': token(authKeys.privateKey, {}, { issuer: 'someone-else' }),
    'wrong audience': token(authKeys.privateKey, {}, { audience: 'another-platform' }),
    // The classic trick: sign with HS256 using the public key as the secret.
    'HS256 using the public key as the secret': jwt.sign(claims, authKeys.publicKey, {
      algorithm: 'HS256',
      subject: 'x',
      issuer: 'visa-auth-service',
      audience: 'visa-platform',
    }),
  };
  for (const [what, value] of Object.entries(bad)) {
    const res = await call('GET', '/subscriptions', value);
    assert.equal(res.status, 401, what);
  }
});

test('a token without an email address is refused (we would not know who to email)', async () => {
  const noEmail = jwt.sign({ role: 'user' }, authKeys.privateKey, {
    algorithm: 'RS256',
    subject: 'x',
    issuer: 'visa-auth-service',
    audience: 'visa-platform',
  });
  assert.equal((await call('GET', '/subscriptions', noEmail)).status, 401);
});

test('only real countries and visa types can be chosen', async () => {
  for (const path of [
    '/subscriptions/France/Tourist',
    '/subscriptions/UK/Holiday',
    '/subscriptions/uk/tourist',
  ]) {
    for (const method of ['PUT', 'DELETE']) {
      const res = await call(method, path, token());
      assert.equal(res.status, 400, `${method} ${path}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  }
});
