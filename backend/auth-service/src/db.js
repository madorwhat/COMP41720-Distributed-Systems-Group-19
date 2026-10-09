// Connects to the database and describes the two tables this service owns: users and audit_logs.
// The tables themselves are created by the scripts in db/migrations, so keep the two in step.
const { Sequelize, DataTypes } = require('sequelize');
const config = require('./config');

const sequelize = new Sequelize(config.databaseUrl, {
  logging: false,
  define: { underscored: true }, // we write fullName in code, the column is called full_name
});

const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    fullName: { type: DataTypes.STRING(100), allowNull: false },
    // Only 'user' or 'admin' are allowed. The database enforces this too, so even a row added
    // by hand in pgAdmin can't have any other role.
    role: { type: DataTypes.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
    mobile: DataTypes.STRING(20),
    nationality: DataTypes.STRING(60),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Goes up by 1 whenever the user logs out, is disabled or gets a new role. Every token
    // remembers the number it was created with, so tokens with an old number are refused.
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  // Normal queries never load the password hash. Login is the only place that needs it,
  // and it asks for it on purpose with User.unscoped().
  { tableName: 'users', defaultScope: { attributes: { exclude: ['passwordHash'] } } },
);

// Whenever a user is sent back in a response, leave out the password hash and token version.
User.prototype.toJSON = function toJSON() {
  const { passwordHash, tokenVersion, ...safe } = this.get();
  return safe;
};

// One row per important action: who did what, to whom, and when. Rows are only ever added.
// actorId isn't linked to the users table, so the history stays even if a user is deleted.
const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    actorId: DataTypes.UUID,
    actorEmail: DataTypes.STRING(254),
    action: { type: DataTypes.STRING(64), allowNull: false },
    targetId: DataTypes.UUID,
    metadata: DataTypes.JSON,
  },
  { tableName: 'audit_logs', updatedAt: false },
);

module.exports = { sequelize, User, AuditLog };
