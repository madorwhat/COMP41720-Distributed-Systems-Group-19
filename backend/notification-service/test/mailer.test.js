const { test } = require('node:test');
const assert = require('node:assert/strict');
const { transportOptions, requireMailLogin } = require('../src/mailer');

const gmail = {
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  smtpUser: 'me@gmail.com',
  smtpPass: 'app-password',
};

test('Gmail on port 587: logs in, and insists on STARTTLS before sending the password', () => {
  assert.deepEqual(transportOptions(gmail), {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: 'me@gmail.com', pass: 'app-password' },
  });
});

test('the Gmail login is required: no address or no password stops the service early', () => {
  assert.doesNotThrow(() => requireMailLogin(gmail));
  assert.throws(
    () => requireMailLogin({ ...gmail, smtpUser: undefined }),
    /SMTP_USER and SMTP_PASS/,
  );
  assert.throws(
    () => requireMailLogin({ ...gmail, smtpPass: undefined }),
    /SMTP_USER and SMTP_PASS/,
  );
  assert.throws(() => requireMailLogin({ ...gmail, smtpPass: '' }), /SMTP_USER and SMTP_PASS/);
});
