'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // actor_id is deliberately not a foreign key: audit rows must stay even if that user is deleted.
    await queryInterface.createTable('audit_logs', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      actor_id: { type: Sequelize.UUID, allowNull: true },
      actor_email: { type: Sequelize.STRING(254), allowNull: true },
      actor_role: { type: Sequelize.STRING(20), allowNull: true },
      action: { type: Sequelize.STRING(64), allowNull: false },
      source_service: { type: Sequelize.STRING(32), allowNull: false },
      target_type: { type: Sequelize.STRING(32), allowNull: true },
      target_id: { type: Sequelize.STRING(64), allowNull: true },
      metadata: { type: Sequelize.TEXT, allowNull: true },
      ip: { type: Sequelize.STRING(45), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('audit_logs', ['created_at']);
    await queryInterface.addIndex('audit_logs', ['actor_id']);
    await queryInterface.addIndex('audit_logs', ['action']);
    await queryInterface.addIndex('audit_logs', ['source_service']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};
