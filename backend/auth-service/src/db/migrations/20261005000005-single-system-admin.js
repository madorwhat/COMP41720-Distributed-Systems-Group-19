'use strict';

// Makes sure there can only ever be ONE system admin. The database rejects a second row with
// role = 'system_admin', whether it comes from the API, a seed or a manual SQL insert.
// Any number of regular admins and users is still allowed.
const INDEX = 'users_single_system_admin';

module.exports = {
  async up(queryInterface) {
    // MySQL can't limit an index to some rows only; it would allow just ONE user per role.
    // So on MySQL we skip this (the API still never creates a second system admin).
    if (queryInterface.sequelize.getDialect() === 'mysql') return;
    await queryInterface.addIndex('users', ['role'], {
      name: INDEX,
      unique: true,
      where: { role: 'system_admin' },
    });
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() === 'mysql') return;
    await queryInterface.removeIndex('users', INDEX);
  },
};
