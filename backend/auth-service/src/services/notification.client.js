// Sends emails through the (optional, Python) notification service.
// It never throws: if sending fails we only log it, because a different API response would
// reveal whether an email is registered.
const config = require('../config');
const logger = require('../utils/logger');

async function sendPasswordReset(email, resetUrl) {
  if (config.notificationServiceUrl) {
    try {
      const res = await fetch(`${config.notificationServiceUrl}/notify/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetUrl }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) logger.warn({ status: res.status }, 'Notification service rejected reset email');
    } catch (err) {
      logger.warn({ err: err.message }, 'Notification service unreachable; reset email not sent');
    }
    return;
  }
  // No notification service while developing: print the reset link in the server log instead,
  // so the flow can still be tested. (Never happens in production.)
  if (!config.isProduction) {
    logger.info(`[DEV] password reset link for ${email}: ${resetUrl}`);
  }
}

function warnIfDisabled() {
  if (config.isProduction && !config.notificationServiceUrl) {
    logger.error('NOTIFICATION_SERVICE_URL is not set: password reset emails are disabled');
  }
}

module.exports = { sendPasswordReset, warnIfDisabled };
