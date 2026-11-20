
// Where the service starts. It sets up the web server, plugs in the routes and error handling,
// checks that the database is reachable, then starts listening.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { ZodError } = require('zod');
const { UniqueConstraintError } = require('sequelize');
const config = require('./config');
const { sequelize } = require('./db');
const { httpError } = require('./auth');
const routes = require('./routes');

const app = express();

// Metrics storage
let totalRequests = 0;
let successfulRequests = 0;
let clientErrors = 0;
let serverErrors = 0;
let totalRequestDuration = 0;

const requestDurations = [];

app.use(helmet()); // standard security headers
app.use(cors({ origin: config.corsOrigins })); // only our frontend's address(es) may call us from a browser
app.use(express.json({ limit: '10kb' })); // read JSON bodies, and refuse very large ones

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
      '# HELP auth_http_requests_total Total HTTP requests',
      '# TYPE auth_http_requests_total counter',
      `auth_http_requests_total ${totalRequests}`,

      '# HELP auth_http_requests_success_total Successful HTTP requests',
      '# TYPE auth_http_requests_success_total counter',
      `auth_http_requests_success_total ${successfulRequests}`,

      '# HELP auth_http_requests_client_errors_total Client error responses',
      '# TYPE auth_http_requests_client_errors_total counter',
      `auth_http_requests_client_errors_total ${clientErrors}`,

      '# HELP auth_http_requests_server_errors_total Server error responses',
      '# TYPE auth_http_requests_server_errors_total counter',
      `auth_http_requests_server_errors_total ${serverErrors}`,

      '# HELP auth_http_request_duration_seconds_total Total HTTP request duration',
      '# TYPE auth_http_request_duration_seconds_total counter',
      `auth_http_request_duration_seconds_total ${totalRequestDuration}`,

      '# HELP auth_http_request_duration_seconds_average Average HTTP request duration',
      '# TYPE auth_http_request_duration_seconds_average gauge',
      `auth_http_request_duration_seconds_average ${averageDuration}`,

      '# HELP auth_process_uptime_seconds Process uptime in seconds',
      '# TYPE auth_process_uptime_seconds gauge',
      `auth_process_uptime_seconds ${process.uptime()}`,
    ].join('\n') + '\n'
  );
});

app.use(routes);

// Any URL we don't know.
app.use((req, res) => {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
});

// Turns every error into the same reply shape: { error: { code, message } }.
// Errors we expect get a clear message. Anything unexpected is printed to the console and the
// client only sees a plain 500, so internal details never leak out.
app.use((err, req, res, _next) => {
  if (err instanceof ZodError) {
    // the request data didn't pass the checks in routes.js
    const issue = err.issues[0];
    err = httpError(400, 'VALIDATION_ERROR', `${issue.path.join('.') || 'body'}: ${issue.message}`);
  } else if (err instanceof UniqueConstraintError) {
    // email is the only unique column, so a duplicate always means the email is taken
    err = httpError(409, 'EMAIL_TAKEN', 'Email already registered');
  } else if (err.type?.startsWith('entity.')) {
    // the JSON body couldn't be read, or was too big
    err = httpError(err.status, 'VALIDATION_ERROR', 'Malformed or too large JSON body');
  }
  if (!err.status) {
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  }
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
});

// The tables are created by the database scripts (npm run db:migrate), never by the app.
// Here we only make sure we can connect before we start taking requests.
sequelize
  .authenticate()
  .then(() =>
    app.listen(config.port, () => console.log(`Auth service on http://localhost:${config.port}`)),
  )
  .catch((err) => {
    console.error(`Cannot connect to the database: ${err.message}`);
    process.exit(1);
  });
