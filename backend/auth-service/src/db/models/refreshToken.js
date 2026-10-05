// The `refresh_tokens` table: one row per login session. Logging out marks the row as revoked.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'RefreshToken',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true }, // hash of the token; the token itself is only in the user's cookie
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      replacedById: { type: DataTypes.UUID, allowNull: true },
      userAgent: { type: DataTypes.STRING(255), allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
    },
    { tableName: 'refresh_tokens', updatedAt: false },
  );
