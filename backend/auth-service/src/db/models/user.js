// The `users` table: one row per account (user, admin or the system admin).
const { DataTypes } = require('sequelize');
const { ROLES } = require('../../utils/roles');

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4, // random id created by the app, works on every database
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING(254),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      passwordHash: { type: DataTypes.STRING(100), allowNull: false },
      fullName: { type: DataTypes.STRING(100), allowNull: false },
      role: {
        type: DataTypes.STRING(20), // plain text + the isIn check below (ENUM types differ per database)
        allowNull: false,
        defaultValue: ROLES.USER,
        validate: { isIn: [Object.values(ROLES)] },
      },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'users',
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
      hooks: {
        // Always store emails trimmed and lowercase, so "Bob@X.com" and "bob@x.com" are the same account.
        beforeValidate(user) {
          if (user.email) user.email = user.email.trim().toLowerCase();
        },
      },
    },
  );

  // Whenever a user is sent as JSON, remove the password hash and token version.
  // (A safety net: the password hash is already left out of normal queries.)
  User.prototype.toJSON = function toJSON() {
    const { passwordHash, tokenVersion, ...safe } = this.get();
    return safe;
  };

  return User;
};
