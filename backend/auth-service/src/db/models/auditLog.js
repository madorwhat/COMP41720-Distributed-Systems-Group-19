const { DataTypes } = require('sequelize');

// One row per important action (who did what, to whom, when). Rows are only ever added,
// never edited or deleted, so the history can't be rewritten.
module.exports = (sequelize) =>
  sequelize.define(
    'AuditLog',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      // Who did it. Email and role are copied as they were at that moment, so the log stays
      // correct even if that person is later demoted or deleted.
      actorId: { type: DataTypes.UUID, allowNull: true },
      actorEmail: { type: DataTypes.STRING(254), allowNull: true },
      actorRole: { type: DataTypes.STRING(20), allowNull: true },
      action: { type: DataTypes.STRING(64), allowNull: false },
      sourceService: { type: DataTypes.STRING(32), allowNull: false },
      targetType: { type: DataTypes.STRING(32), allowNull: true },
      targetId: { type: DataTypes.STRING(64), allowNull: true },
      // Extra details as JSON (e.g. { from: 'user', to: 'admin' }). Saved as text, and
      // converted to/from an object automatically when you read or set it.
      metadata: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          const raw = this.getDataValue('metadata');
          return raw ? JSON.parse(raw) : null;
        },
        set(value) {
          this.setDataValue('metadata', value == null ? null : JSON.stringify(value));
        },
      },
      ip: { type: DataTypes.STRING(45), allowNull: true },
    },
    { tableName: 'audit_logs', updatedAt: false },
  );
