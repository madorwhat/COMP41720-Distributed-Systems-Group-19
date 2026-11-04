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
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '10kb' }));
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
