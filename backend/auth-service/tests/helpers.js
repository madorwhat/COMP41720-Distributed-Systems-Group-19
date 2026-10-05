const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/app');
const { User } = require('../src/db');

const PASSWORD = 'Password123';

// Extracts "refresh_token=..." from a response, ready to send back as a Cookie header.
const refreshCookie = (res) =>
  (res.headers['set-cookie'] || []).find((c) => c.startsWith('refresh_token='))?.split(';')[0];

let counter = 0;
const uniqueEmail = (prefix = 'user') => `${prefix}${++counter}@example.com`;

// Creates a user directly in the DB with any role (the API can't create system admins).
async function createUser({
  email = uniqueEmail(),
  role = 'user',
  password = PASSWORD,
  isActive = true,
} = {}) {
  // Only one system admin can exist, so asking for another returns the existing one.
  if (role === 'system_admin') {
    const existing = await User.findOne({ where: { role } });
    if (existing) return existing;
  }
  return User.create({
    email,
    role,
    isActive,
    fullName: `${role} ${email}`,
    passwordHash: await bcrypt.hash(password, 4),
  });
}

// Creates a user and logs them in through the API.
async function createUserAndLogin(options = {}) {
  const password = options.password || PASSWORD;
  const user = await createUser(options);
  const res = await request(app).post('/auth/login').send({ email: user.email, password });
  return { user, accessToken: res.body.accessToken, cookie: refreshCookie(res) };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = {
  app,
  request,
  PASSWORD,
  refreshCookie,
  uniqueEmail,
  createUser,
  createUserAndLogin,
  bearer,
};
