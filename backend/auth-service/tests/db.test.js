const { UniqueConstraintError } = require('sequelize');
const { umzug } = require('./setup');
const { User, RefreshToken, AuditLog } = require('../src/db');

const makeUser = (email = 'a@example.com') =>
  User.create({ email, passwordHash: 'x'.repeat(60), fullName: 'Test User' });

describe('database schema', () => {
  test('every migration rolls back and re-applies cleanly', async () => {
    await umzug.down({ to: 0 });
    expect(await umzug.executed()).toHaveLength(0);
    await umzug.up();
    expect(await umzug.executed()).toHaveLength(5);
  });

  test('email is stored lowercased and trimmed', async () => {
    const user = await makeUser('  Mixed@Example.COM ');
    expect(user.email).toBe('mixed@example.com');
  });

  test('duplicate email raises UniqueConstraintError (case-insensitive)', async () => {
    await makeUser('dup@example.com');
    await expect(makeUser('DUP@example.com')).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  test('passwordHash is hidden unless the withPassword scope is used', async () => {
    await makeUser('scope@example.com');
    const plain = await User.findOne({ where: { email: 'scope@example.com' } });
    expect(plain.passwordHash).toBeUndefined();
    const withPw = await User.scope('withPassword').findOne({
      where: { email: 'scope@example.com' },
    });
    expect(withPw.passwordHash).toHaveLength(60);
    expect(withPw.toJSON().passwordHash).toBeUndefined();
    expect(withPw.toJSON().tokenVersion).toBeUndefined();
  });

  test('rejects a role outside the allowed list', async () => {
    await expect(
      User.create({ email: 'r@example.com', passwordHash: 'x', fullName: 'R', role: 'god' }),
    ).rejects.toThrow();
  });

  test('only ONE system admin can exist; many admins are fine', async () => {
    const root = await User.create({
      email: 'root1@example.com',
      passwordHash: 'x',
      fullName: 'R',
      role: 'system_admin',
    });
    await expect(
      User.create({
        email: 'root2@example.com',
        passwordHash: 'x',
        fullName: 'R2',
        role: 'system_admin',
      }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
    await User.create({
      email: 'adm1@example.com',
      passwordHash: 'x',
      fullName: 'A1',
      role: 'admin',
    });
    await User.create({
      email: 'adm2@example.com',
      passwordHash: 'x',
      fullName: 'A2',
      role: 'admin',
    });
    await root.destroy(); // leave the slot free for the seeder test below
  });

  test('deleting a user cascades to their refresh tokens', async () => {
    const user = await makeUser('cascade@example.com');
    await RefreshToken.create({
      userId: user.id,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60000),
    });
    await user.destroy();
    expect(await RefreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  test('audit log metadata round-trips as JSON', async () => {
    const log = await AuditLog.create({
      action: 'TEST',
      sourceService: 'auth',
      metadata: { from: 'user', to: 'admin' },
    });
    const reloaded = await AuditLog.findByPk(log.id);
    expect(reloaded.metadata).toEqual({ from: 'user', to: 'admin' });
  });
});

describe('team accounts seeder', () => {
  const seeder = require('../src/db/seeders/20261005000001-team-accounts');
  const { sequelize } = require('../src/db');

  test('creates the same fixed accounts, and is safe to run twice', async () => {
    const qi = sequelize.getQueryInterface();
    await seeder.up(qi, sequelize.constructor);
    await seeder.up(qi, sequelize.constructor); // second run must not fail or duplicate

    const sysadmin = await User.findOne({ where: { email: 'sysadmin@example.com' } });
    expect(sysadmin).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      role: 'system_admin',
    });
    expect(
      await User.count({
        where: { email: ['sysadmin@example.com', 'admin@example.com', 'user@example.com'] },
      }),
    ).toBe(3);

    await seeder.down(qi, sequelize.constructor);
    expect(await User.count({ where: { email: 'sysadmin@example.com' } })).toBe(0);
  });
});
