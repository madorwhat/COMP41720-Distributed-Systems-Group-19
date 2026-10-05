const pino = require('pino');
const config = require('../config');

// App-wide logger. Headers that carry passwords or tokens are replaced with "[Redacted]",
// Hence secrets kabhi logs mein nahi aayenge
module.exports = pino({
  level: config.isTest ? 'silent' : 'info',
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-service-key"]',
    'res.headers["set-cookie"]',
  ],
});
