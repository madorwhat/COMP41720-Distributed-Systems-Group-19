'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      email: { type: Sequelize.STRING(254), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(100), allowNull: false },
      full_name: { type: Sequelize.STRING(100), allowNull: false },
      role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'user' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      token_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('users', ['role']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
