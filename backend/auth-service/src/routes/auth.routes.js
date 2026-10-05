// URL list for /auth/*. Each line: path -> checks to run first -> controller function.
const express = require('express');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const limits = require('../middleware/rateLimiters');
const {
  signupSchema,
  loginSchema,
  resetRequestSchema,
  resetConfirmSchema,
  changePasswordSchema,
} = require('../validators/auth.schemas');
const auth = require('../controllers/auth.controller');

const router = express.Router();

router.post('/signup', limits.signupLimiter, validate(signupSchema), auth.signup);
router.post('/login', limits.loginLimiter, validate(loginSchema), auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.post('/logout-all', authenticate, auth.logoutAll);
router.get('/me', authenticate, auth.me);
router.patch('/me/password', authenticate, validate(changePasswordSchema), auth.changePassword);
router.post('/reset', limits.resetLimiter, validate(resetRequestSchema), auth.requestReset);
router.post(
  '/reset/confirm',
  limits.resetConfirmLimiter,
  validate(resetConfirmSchema),
  auth.confirmReset,
);

module.exports = router;
