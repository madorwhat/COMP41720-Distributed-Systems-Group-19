'use strict';

// Slots created from an approved AI plan remember the plan's id. Approving the same plan twice
// (a double click, a retry) then creates nothing the second time.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('booking_slots', 'plan_id', { type: Sequelize.UUID });
    await queryInterface.addIndex('booking_slots', ['plan_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('booking_slots', 'plan_id');
  },
};
