// Connects to the notification database and describes its tables. The tables themselves are
// created by the scripts in db/migrations, so keep the two in step.
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

// One row per person per "new appointments are open" message: has that person been told yet?
// The primary key (message, person) makes a repeated message harmless, and `sentAt` is the tick.
// It is also how we know who was told recently, to keep from emailing anyone too often.
const SlotAlert = sequelize.define(
  'SlotAlert',
  {
    eventId: { type: DataTypes.UUID, primaryKey: true },
    userEmail: { type: DataTypes.STRING(254), primaryKey: true },
    country: { type: DataTypes.STRING(50), allowNull: false },
    visaType: { type: DataTypes.STRING(50), allowNull: false },
    sentAt: DataTypes.DATE,
  },
  { tableName: 'slot_alerts', updatedAt: false },
);

// "Tell me when new appointments open for this country and visa type". The email address and name
// come from the person's login token, so nobody can subscribe someone else.
const SlotSubscription = sequelize.define(
  'SlotSubscription',
  {
    userEmail: { type: DataTypes.STRING(254), primaryKey: true },
    country: { type: DataTypes.STRING(50), primaryKey: true },
    visaType: { type: DataTypes.STRING(50), primaryKey: true },
    userName: DataTypes.STRING(100),
  },
  { tableName: 'slot_subscriptions', updatedAt: false },
);

module.exports = { sequelize, Notification, SlotAlert, SlotSubscription };
