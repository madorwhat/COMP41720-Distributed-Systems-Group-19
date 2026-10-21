'use strict';

// One row per appointment we have heard about. The primary key is the appointment id, so the
// same booking can never be stored (or emailed) twice, even if its message arrives twice.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      appointment_id: { type: Sequelize.UUID, primaryKey: true },
      user_email: { type: Sequelize.STRING(254), allowNull: false },
      user_name: { type: Sequelize.STRING(100) },
      country: { type: Sequelize.STRING(50), allowNull: false },
      visa_type: { type: Sequelize.STRING(50), allowNull: false },
      day: { type: Sequelize.DATEONLY, allowNull: false },
      slot_time: { type: Sequelize.STRING(50), allowNull: false },
      confirmation_sent_at: { type: Sequelize.DATE },
      reminder_sent_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    // The reminder job looks for unsent reminders by day.
    await queryInterface.addIndex('notifications', ['day', 'reminder_sent_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
