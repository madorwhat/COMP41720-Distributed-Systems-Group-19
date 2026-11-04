// Checks the Gmail login on its own, without RabbitMQ or the database: connects to Gmail, logs in,
// and sends one short test email. Use it to find out quickly whether Gmail accepts us.
//
//   npm run send-test-mail -- you@gmail.com
const config = require('../src/config');
const { transport, requireMailLogin } = require('../src/mailer');

const to = process.argv[2];
if (!to) {
  console.error('Usage: npm run send-test-mail -- you@gmail.com');
  process.exit(1);
}

async function main() {
  requireMailLogin();
  console.log(
    `Mail server: ${config.smtpHost}:${config.smtpPort}, logging in as ${config.smtpUser}`,
  );

  await transport.verify();
  console.log('Connected and logged in.');

  const info = await transport.sendMail({
    from: config.mailFrom,
    to,
    subject: 'Book My Visa: mail test',
    text: 'If you can read this, the Notification service can send email.',
  });
  console.log(`Sent to ${to}. Server said: ${info.response}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`Failed: ${err.message}`);
    if (/535|Invalid login|Username and Password not accepted/i.test(err.message)) {
      console.error('Gmail needs an App Password, not your normal password (see the README).');
    }
    process.exit(1);
  },
);
