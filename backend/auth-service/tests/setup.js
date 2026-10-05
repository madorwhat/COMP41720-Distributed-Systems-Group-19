// Runs the REAL migrations against in-memory SQLite before each test file,
// so a broken migration fails the tests instead of a teammate's laptop.
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const { sequelize } = require('../src/db');

const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, '../src/db/migrations/*.js'),
    resolve: ({ name, path: file, context }) => {
      const migration = require(file);
      return {
        name,
        up: () => migration.up(context, sequelize.constructor),
        down: () => migration.down(context, sequelize.constructor),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: undefined,
});

beforeAll(async () => {
  await umzug.up();
});
afterAll(async () => {
  await sequelize.close();
});

module.exports = { umzug };
