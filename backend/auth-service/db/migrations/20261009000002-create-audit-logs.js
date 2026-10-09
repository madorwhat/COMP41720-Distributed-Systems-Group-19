'use strict';

// Creates the audit_logs table behind the admins' Logs page. Rows are only ever added.
// actor_id is not linked to the users table on purpose: the history stays even if that user
// is deleted.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      actor_id: { type: Sequelize.UUID },
      actor_email: { type: Sequelize.STRING(254) },
      action: { type: Sequelize.STRING(64), allowNull: false },
      target_id: { type: Sequelize.UUID },
      metadata: { type: Sequelize.JSON },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('audit_logs', ['created_at']); // the Logs page sorts by this
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};
