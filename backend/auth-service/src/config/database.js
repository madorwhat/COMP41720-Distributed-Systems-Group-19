// Database settings for each environment (development / test / production).
// Both the app (src/db/index.js) and the `npx sequelize-cli` commands read this file,
// so migrations and the running app always use the same database.
require('dotenv').config({ quiet: true });

const common = {
  define: {
    underscored: true,
    freezeTableName: false,
  },
  timezone: '+00:00', // save all dates in UTC so every machine agrees on the time
  logging: false,
};

const dialect = process.env.DB_DIALECT || 'postgres';
// DECISION: setting DB_DIALECT=sqlite stores everything in a local file (dev.sqlite), so a teammate
// without Postgres installed can still run the service.
const connection =
  dialect === 'sqlite'
    ? { dialect, storage: process.env.DB_STORAGE || 'dev.sqlite' }
    : { dialect, url: process.env.DATABASE_URL };

module.exports = {
  development: { ...common, ...connection },
  test: { ...common, dialect: 'sqlite', storage: ':memory:' },
  production: {
    ...common,
    ...connection,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    dialectOptions:
      process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  },
};
