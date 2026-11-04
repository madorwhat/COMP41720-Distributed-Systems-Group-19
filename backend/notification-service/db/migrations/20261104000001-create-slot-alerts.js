'use strict';

// One row per person per "new appointments are open" message. The primary key is (message,
// person), so the same message arriving twice can never email anyone twice. `sent_at` is the
// "already told" tick, and the index below is how we find who was told recently.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('slot_alerts', {
      event_id: { type: Sequelize.UUID, primaryKey: true },
      user_email: { type: Sequelize.STRING(254), primaryKey: true },
      country: { type: Sequelize.STRING(50), allowNull: false },
      visa_type: { type: Sequelize.STRING(50), allowNull: false },
      sent_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('slot_alerts', ['user_email', 'country', 'visa_type', 'sent_at']);
    // Finding the people to tell: everyone we know for a country and visa type.
    await queryInterface.addIndex('notifications', ['country', 'visa_type']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('notifications', ['country', 'visa_type']);
    await queryInterface.dropTable('slot_alerts');
  },
};
