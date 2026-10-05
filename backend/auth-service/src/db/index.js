// Connects to the database and loads all models. Import models from here:
//   const { User, AuditLog } = require('../db');
const { Sequelize } = require('sequelize');
const config = require('../config');
const dbConfig = require('../config/database')[config.env];

const sequelize = dbConfig.url ? new Sequelize(dbConfig.url, dbConfig) : new Sequelize(dbConfig);

const User = require('./models/user')(sequelize);
const RefreshToken = require('./models/refreshToken')(sequelize);
const PasswordResetToken = require('./models/passwordResetToken')(sequelize);
const AuditLog = require('./models/auditLog')(sequelize);

// How the tables relate: a user has many refresh tokens and many password-reset tokens.
// Deleting a user deletes their tokens too (CASCADE).
User.hasMany(RefreshToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(PasswordResetToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });

// AuditLog is deliberately NOT linked to User, so audit history is kept even if a user is deleted.

module.exports = { sequelize, Sequelize, User, RefreshToken, PasswordResetToken, AuditLog };
