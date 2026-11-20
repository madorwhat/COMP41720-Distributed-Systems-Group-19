// Numbers for Prometheus and Grafana, served on GET /metrics.
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const counter = (name, help, labelNames = []) =>
  new client.Counter({ name, help, labelNames, registers: [register] });

const httpRequests = counter(
  'notification_http_requests_total',
  'Total HTTP requests',
  ['method', 'status_code'],
);

const httpRequestDuration = new client.Histogram({
  name: 'notification_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method'],
  registers: [register],
});

module.exports = {
  register,

  httpRequests,
  httpRequestDuration,

  messagesConsumed: counter(
    'notification_messages_consumed_total',
    'Messages taken from RabbitMQ, by kind of message and result',
    // stream: booking-confirmed or slots-opened.
    // result: sent, duplicate, retry, dead_letter, and skipped (slots-opened only: nobody to tell,
    // or everybody was told recently).
    ['result', 'stream'],
  ),

  emailsSent: counter('notification_emails_sent_total', 'Emails sent', ['kind']),
  emailsFailed: counter('notification_emails_failed_total', 'Emails that failed to send', ['kind']),

  // From the moment Booking confirmed the booking to the moment the email left.
  confirmationDelay: new client.Histogram({
    name: 'notification_confirmation_delay_seconds',
    help: 'Seconds from booking confirmed to confirmation email sent',
    buckets: [0.1, 0.5, 1, 5, 30, 60, 300, 1800],
    registers: [register],
  }),

  reminderJobLastRun: new client.Gauge({
    name: 'notification_reminder_job_last_run_timestamp_seconds',
    help: 'When the reminder job last finished',
    registers: [register],
  }),
};
