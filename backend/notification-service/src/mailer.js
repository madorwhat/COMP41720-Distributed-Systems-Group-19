// Sends the two emails. In this project every email goes to Mailpit, a pretend inbox, so no real
// email ever leaves the laptop. Open http://localhost:8025 to read them.
const nodemailer = require('nodemailer');
const config = require('./config');
const metrics = require('./metrics');

const transport = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: false,
});

const describe = (n) =>
  `${n.country} ${n.visaType} visa appointment on ${n.day} at ${n.slotTime} (Irish time)`;

const greeting = (n) => `Hello ${n.userName || 'there'},`;

// The Message-ID is built from the appointment id, so if an email ever goes out twice the two
// copies are easy to recognise as the same email.
async function send(kind, n, subject, text) {
  try {
    await transport.sendMail({
      from: config.mailFrom,
      to: n.userEmail,
      subject,
      text,
      messageId: `<${kind}-${n.appointmentId}@bookmyvisa.local>`,
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
    n,
    'Your visa appointment is booked',
    `${greeting(n)}\n\nYour ${describe(n)} is confirmed.\n` +
      `Appointment reference: ${n.appointmentId}\n\nBook My Visa`,
  );

const sendReminder = (n) =>
  send(
    'reminder',
    n,
    'Reminder: your visa appointment is coming up',
    `${greeting(n)}\n\nThis is a reminder about your ${describe(n)}.\n` +
      `Appointment reference: ${n.appointmentId}\n\nBook My Visa`,
  );

module.exports = { transport, sendConfirmation, sendReminder };
