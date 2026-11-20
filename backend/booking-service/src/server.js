
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { ZodError } = require('zod');
const { UniqueConstraintError } = require('sequelize');
const config = require('./config');
const { sequelize } = require('./db');
const { httpError } = require('./auth');
const routes = require('./routes');
const events = require('./events');

const app = express();

// Metrics storage
let totalRequests = 0;
let successfulRequests = 0;
let clientErrors = 0;
let serverErrors = 0;
let totalRequestDuration = 0;

const requestDurations = [];

app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '10kb' }));

// Metrics middleware
app.use((req, res, next) => {
  if (req.path === '/metrics') {
    return next();
  }

  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const duration =
      Number(process.hrtime.bigint() - startTime) / 1e9;

    totalRequests++;
    totalRequestDuration += duration;

    if (res.statusCode >= 200 && res.statusCode < 400) {
      successfulRequests++;
    } else if (res.statusCode >= 400 && res.statusCode < 500) {
      clientErrors++;
    } else if (res.statusCode >= 500) {
      serverErrors++;
    }

    requestDurations.push(duration);

    if (requestDurations.length > 1000) {
      requestDurations.shift();
    }
  });

  next();
});

// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
  const averageDuration =
    totalRequests > 0
      ? totalRequestDuration / totalRequests
      : 0;

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');

  res.send(
    [
      '# HELP booking_http_requests_total Total HTTP requests',
      '# TYPE booking_http_requests_total counter',
      `booking_http_requests_total ${totalRequests}`,

      '# HELP booking_http_requests_success_total Successful HTTP requests',
      '# TYPE booking_http_requests_success_total counter',
      `booking_http_requests_success_total ${successfulRequests}`,

      '# HELP booking_http_requests_client_errors_total Client error responses',
      '# TYPE booking_http_requests_client_errors_total counter',
      `booking_http_requests_client_errors_total ${clientErrors}`,

      '# HELP booking_http_requests_server_errors_total Server error responses',
      '# TYPE booking_http_requests_server_errors_total counter',
      `booking_http_requests_server_errors_total ${serverErrors}`,

      '# HELP booking_http_request_duration_seconds_total Total HTTP request duration',
      '# TYPE booking_http_request_duration_seconds_total counter',
      `booking_http_request_duration_seconds_total ${totalRequestDuration}`,

      '# HELP booking_http_request_duration_seconds_average Average HTTP request duration',
      '# TYPE booking_http_request_duration_seconds_average gauge',
      `booking_http_request_duration_seconds_average ${averageDuration}`,

      '# HELP booking_process_uptime_seconds Process uptime in seconds',
      '# TYPE booking_process_uptime_seconds gauge',
      `booking_process_uptime_seconds ${process.uptime()}`,
    ].join('\n') + '\n'
  );
});

app.use(routes);

app.use((req, res) => {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
});

app.use((err, req, res, _next) => {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    err = httpError(400, 'VALIDATION_ERROR', `${issue.path.join('.') || 'body'}: ${issue.message}`);
  } else if (err instanceof UniqueConstraintError) {
    const constraint = err.original?.constraint || err.parent?.constraint;
    if (constraint === 'booking_slots_unique_slot') {
      err = httpError(409, 'DUPLICATE_SLOT', 'This slot has already been added');
    } else {
      err = httpError(409, 'SLOT_UNAVAILABLE', 'Slot has already been booked');
    }
  } else if (err.type?.startsWith('entity.')) {
    err = httpError(err.status, 'VALIDATION_ERROR', 'Malformed or too large JSON body');
  }
  if (!err.status) {
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  }
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
});

sequelize
  .authenticate()
  .then(() => {
    // Booking works even if RabbitMQ is down; it only means no emails until it is back.
    events.connect().catch((err) => console.error(`Cannot connect to RabbitMQ: ${err.message}`));
    return app.listen(config.port, () =>
      console.log(`Booking service on http://localhost:${config.port}`),
    );
  })
  .catch((err) => {
    console.error(`Cannot connect to the database: ${err.message}`);
    process.exit(1);
  });
