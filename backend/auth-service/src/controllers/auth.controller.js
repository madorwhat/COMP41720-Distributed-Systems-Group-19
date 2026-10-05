// Handles /auth/* requests: reads the request, calls the service, sends the response.
// The actual logic lives in services/auth.service.js and services/password.service.js.
const config = require('../config');
const authService = require('../services/auth.service');
const passwordService = require('../services/password.service');

const REFRESH_COOKIE = 'refresh_token';
const cookieOptions = {
  httpOnly: true,
  secure: config.env !== 'development', // HTTPS-only, except in local development (plain http)
  sameSite: 'strict',
  path: '/auth', // the browser only sends it to /auth/* requests
};

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

// Sends a successful login response: the refresh token goes into the cookie (hidden from
// JavaScript), everything else (user, accessToken) is sent as JSON.
function sendSession(res, status, { refreshToken, ...body }) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
  res.status(status).json(body);
}

async function signup(req, res) {
  sendSession(res, 201, await authService.signup(req.body, requestMeta(req)));
}

async function login(req, res) {
  sendSession(res, 200, await authService.login(req.body, requestMeta(req)));
}

async function refresh(req, res) {
  const { user, ...session } = await authService.refresh(
    req.cookies[REFRESH_COOKIE],
    requestMeta(req),
  );
  sendSession(res, 200, session); // the response is just { accessToken }
}

async function logout(req, res) {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
}

async function logoutAll(req, res) {
  await authService.logoutAll(req.user);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
}

function me(req, res) {
  res.json({ user: req.user });
}

async function requestReset(req, res) {
  await passwordService.requestReset(req.body.email);
  res.json({ message: 'If that email exists, a reset link has been sent.' });
}

async function confirmReset(req, res) {
  await passwordService.confirmReset(req.body, req.ip);
  res.json({ message: 'Password updated' });
}

async function changePassword(req, res) {
  sendSession(res, 200, await passwordService.changePassword(req.user, req.body, requestMeta(req)));
}

module.exports = {
  signup,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  requestReset,
  confirmReset,
  changePassword,
};
