'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      replaced_by_id: { type: Sequelize.UUID, allowNull: true },
      user_agent: { type: Sequelize.STRING(255), allowNull: true },
      ip: { type: Sequelize.STRING(45), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('refresh_tokens', ['user_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
  },
};
