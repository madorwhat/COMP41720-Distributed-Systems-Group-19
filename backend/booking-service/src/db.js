const { Sequelize, DataTypes } = require('sequelize');
const config = require('./config');

const sequelize = new Sequelize(config.databaseUrl, {
  logging: false,
  define: { underscored: true },
});

const BookingSlot = sequelize.define(
  'BookingSlot',
  {
    bookingId: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    country: { type: DataTypes.STRING(50), allowNull: false },
    visaType: { type: DataTypes.STRING(50), allowNull: false },
    slotTime: { type: DataTypes.STRING(50), allowNull: false },
    day: { type: DataTypes.DATEONLY, allowNull: false },
    isBooked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: 'booking_slots',
    updatedAt: false,
    indexes: [
      {
        name: 'booking_slots_unique_slot',
        unique: true,
        fields: ['country', 'visa_type', 'day', 'slot_time'],
      },
    ],
  },
);

const Appointment = sequelize.define(
  'Appointment',
  {
    appointmentId: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    bookingId: { type: DataTypes.UUID, allowNull: false, unique: true },
  },
  { tableName: 'appointments', updatedAt: false },
);

Appointment.belongsTo(BookingSlot, { as: 'slot', foreignKey: 'bookingId' });
BookingSlot.hasOne(Appointment, { as: 'appointment', foreignKey: 'bookingId' });

module.exports = { sequelize, BookingSlot, Appointment };
