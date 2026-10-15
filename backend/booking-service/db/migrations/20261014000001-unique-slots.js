'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex(
      'booking_slots',
      ['country', 'visa_type', 'day', 'slot_time'],
      { unique: true, name: 'booking_slots_unique_slot' },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('booking_slots', 'booking_slots_unique_slot');
  },
};
