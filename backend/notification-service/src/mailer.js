// Sends the emails (confirmation, reminder, "new appointments are open") through Gmail over SMTP.
// Every email is a real email to a real inbox. Set SMTP_USER and SMTP_PASS (see the README).
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const config = require('./config');
const metrics = require('./metrics');

// How to connect to the mail server. Port 587 starts as plain text and is then switched to an
// encrypted connection (STARTTLS). We insist on that switch, so the password is never sent in
// the clear.
function transportOptions(settings = config) {
  return {
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: false,
    requireTLS: true,
    auth: { user: settings.smtpUser, pass: settings.smtpPass },
  };
}

// Stops early, with a clear message, when the Gmail login has not been set up.
function requireMailLogin(settings = config) {
  if (!settings.smtpUser || !settings.smtpPass) {
    throw new Error(
      'SMTP_USER and SMTP_PASS are not set. Notification sends all email through Gmail: put the ' +
        'Gmail address and a Gmail App Password in backend/.env (see the README).',
    );
  }
}

const transport = nodemailer.createTransport(transportOptions());

const describe = (n) =>
  `${n.country} ${n.visaType} visa appointment on ${n.day} at ${n.slotTime} (Irish time)`;

const greeting = (n) => `Hello ${n.userName || 'there'},`;

// The Message-ID is built from `id` (the appointment id, for the first two emails), so if an
// email ever goes out twice the two copies are easy to recognise as the same email.
async function send(kind, to, id, subject, text) {
  // The demo users from the seed data have made-up addresses ending in ".test" (a domain that
  // can never exist). We don't send to them, so the demo never mails 100 fake people.
  if (to.endsWith('.test')) {
    console.log(`Not emailing demo address ${to} (${kind})`);
    return;
  }
  try {
    await transport.sendMail({
      from: config.mailFrom,
      to,
      subject,
      text,
      messageId: `<${kind}-${id}@bookmyvisa.local>`,
    });
    metrics.emailsSent.inc({ kind });
  } catch (err) {
    metrics.emailsFailed.inc({ kind });
    throw err;
  }
}

const sendConfirmation = (n) =>
  send(
    'confirmation',
    n.userEmail,
    n.appointmentId,
    'Your visa appointment is booked',
    `${greeting(n)}\n\nYour ${describe(n)} is confirmed.\n` +
      `Appointment reference: ${n.appointmentId}\n\nBook My Visa`,
  );

const sendReminder = (n) =>
  send(
    'reminder',
    n.userEmail,
    n.appointmentId,
    'Reminder: your visa appointment is coming up',
    `${greeting(n)}\n\nThis is a reminder about your ${describe(n)}.\n` +
      `Appointment reference: ${n.appointmentId}\n\nBook My Visa`,
  );

// The "new appointments are open" email: what is open, and an invitation to go and book.
// `recipient` is { userName }; `event` is the SlotsOpened message.
function composeSlotsOpened(recipient, event, siteUrl = config.siteUrl) {
  const times = event.slotTimes.map((time) => `  - ${time}`).join('\n');
  return {
    subject: `New ${event.country} ${event.visaType} visa appointments are open`,
    text:
      `${greeting(recipient)}\n\n` +
      `New ${event.country} ${event.visaType} visa appointments are now open on ${event.day} ` +
      `(Irish time):\n${times}\n\n` +
      `Slots go quickly, so book yours soon.` +
      (siteUrl ? `\n${siteUrl}` : '') +
      `\n\nYou are getting this because you asked to be told when ${event.country} ` +
      `${event.visaType} appointments open.` +
      `\n\nBook My Visa`,
  };
}

// One email per person per message. The Message-ID is the message id plus a short fingerprint of
// the address, which is different for every person and the same if the email is ever repeated.
function sendSlotsOpened(recipient, event) {
  const { subject, text } = composeSlotsOpened(recipient, event);
  const person = crypto.createHash('sha1').update(recipient.userEmail).digest('hex').slice(0, 12);
  return send('slots-opened', recipient.userEmail, `${event.eventId}-${person}`, subject, text);
}

module.exports = {
  transport,
  transportOptions,
  requireMailLogin,
  composeSlotsOpened,
  sendConfirmation,
  sendReminder,
  sendSlotsOpened,
};
