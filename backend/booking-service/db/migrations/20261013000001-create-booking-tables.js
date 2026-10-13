'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('booking_slots', {
      booking_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      country: { type: Sequelize.STRING(50), allowNull: false },
      visa_type: { type: Sequelize.STRING(50), allowNull: false },
      slot_time: { type: Sequelize.STRING(50), allowNull: false },
      day: { type: Sequelize.DATEONLY, allowNull: false },
      is_booked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('booking_slots', ['is_booked', 'country', 'visa_type', 'day']);

    await queryInterface.createTable('appointments', {
      appointment_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      user_id: { type: Sequelize.UUID, allowNull: false },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'booking_slots', key: 'booking_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('appointments', ['user_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('appointments');
    await queryInterface.dropTable('booking_slots');
  },
};
