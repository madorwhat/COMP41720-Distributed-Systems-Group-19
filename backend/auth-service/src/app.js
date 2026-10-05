// Creates the Express app and plugs in all middleware and routes.
// It does NOT start the server (server.js does that), so tests can import the app directly.
const crypto = require('crypto');
const express = require('express');
const pinoHttp = require('pino-http');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const logger = require('./utils/logger');
const publicRoutes = require('./routes/public.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const internalRoutes = require('./routes/internal.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);

app.use(helmet());
// Only the frontend URLs listed in CORS_ORIGINS may call this API with cookies.
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = req.headers['x-request-id'] || crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
  }),
);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use(publicRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/internal', internalRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
