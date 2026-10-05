// Routes anyone can call without logging in.
const express = require('express');
const { sequelize } = require('../db');
const tokens = require('../services/token.service');

const router = express.Router();

// "Is the service up?" Returns 503 if the database can't be reached.
router.get('/health', async (req, res) => {
  try {
    await sequelize.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// Publishes the PUBLIC key. Other services (e.g. booking) use it to check that a token
// really came from us, without having to call this service on every request.
router.get('/.well-known/jwks.json', (req, res) => {
  res.json({ keys: [tokens.publicJwk()] });
});

module.exports = router;
