'use strict';

// Creates the users table.
// The id and the two timestamps get default values from the database itself, so a row added
// by hand (for example in pgAdmin) works without filling them in.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      email: { type: Sequelize.STRING(254), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(100), allowNull: false }, // bcrypt hash, never the real password
      full_name: { type: Sequelize.STRING(100), allowNull: false },
      role: { type: Sequelize.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
      mobile: { type: Sequelize.STRING(20) },
      nationality: { type: Sequelize.STRING(60) },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      token_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
  },

  // Undo: remove the table, and the list of allowed roles that was created with it.
  async down(queryInterface) {
    await queryInterface.dropTable('users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role"');
  },
};
