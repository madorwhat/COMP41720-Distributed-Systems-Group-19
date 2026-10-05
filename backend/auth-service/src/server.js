// Starting point: `npm run dev` / `npm start` run this file. Pehle DB check karega, then starts listening.
const config = require('./config');
const logger = require('./utils/logger');
const app = require('./app');
const { sequelize } = require('./db');
const notification = require('./services/notification.client');

async function start() {
  try {
    // Just checks that the database is reachable. Tables are created by `npm run db:migrate`,
    // never automatically by the app (we never call sequelize.sync()).
    await sequelize.authenticate();
  } catch (err) {
    logger.error(`Cannot connect to the database: ${err.message}`);
    process.exit(1);
  }
  notification.warnIfDisabled();
  app.listen(config.port, () => {
    logger.info(`Auth service listening on http://localhost:${config.port}`);
  });
}

start();
