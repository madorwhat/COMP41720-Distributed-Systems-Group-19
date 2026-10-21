// Connects to the notification database and describes its one table. The table itself is created
// by the script in db/migrations, so keep the two in step.
const { Sequelize, DataTypes } = require('sequelize');
const config = require('./config');

const sequelize = new Sequelize(config.databaseUrl, {
  logging: false,
  define: { underscored: true },
});

const Notification = sequelize.define(
  'Notification',
  {
    appointmentId: { type: DataTypes.UUID, primaryKey: true },
    userEmail: { type: DataTypes.STRING(254), allowNull: false },
    userName: DataTypes.STRING(100),
    country: { type: DataTypes.STRING(50), allowNull: false },
    visaType: { type: DataTypes.STRING(50), allowNull: false },
    day: { type: DataTypes.DATEONLY, allowNull: false },
    slotTime: { type: DataTypes.STRING(50), allowNull: false },
    // Empty until the email has gone out. These are our "already sent" ticks.
    confirmationSentAt: DataTypes.DATE,
    reminderSentAt: DataTypes.DATE,
  },
  { tableName: 'notifications', updatedAt: false },
);

module.exports = { sequelize, Notification };
