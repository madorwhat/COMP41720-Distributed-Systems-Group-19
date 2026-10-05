// The `password_reset_tokens` table: one row per "forgot password" link (valid 30 minutes, one use).
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'PasswordResetToken',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      usedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'password_reset_tokens', updatedAt: false },
  );
