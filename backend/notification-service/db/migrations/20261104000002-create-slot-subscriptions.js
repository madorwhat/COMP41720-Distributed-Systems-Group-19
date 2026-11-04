'use strict';

// "Tell me when new appointments open for this country and visa type." One row per person per
// choice, so the primary key (person, country, visa type) also makes subscribing twice harmless.
// A person can have several rows, for example Schengen Student and UK Tourist.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('slot_subscriptions', {
      user_email: { type: Sequelize.STRING(254), primaryKey: true },
      country: { type: Sequelize.STRING(50), primaryKey: true },
      visa_type: { type: Sequelize.STRING(50), primaryKey: true },
      // Kept up to date on every subscribe, for the "Hello <name>" line of the email.
      user_name: { type: Sequelize.STRING(100) },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    // Finding the people to tell: everyone subscribed to one country and visa type.
    await queryInterface.addIndex('slot_subscriptions', ['country', 'visa_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('slot_subscriptions');
  },
};
