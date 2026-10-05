'use strict';
const bcrypt = require('bcryptjs');
const config = require('../../config');

// The team's shared accounts. Run `npm run db:seed` and you get exactly these accounts, with the
// same emails, passwords and ids as everyone else on the team.
// Need an account the whole team should have? Add it to ACCOUNTS below and commit.
//
// This is the ONLY way the system admin is created. There can be just one (the database enforces
// it, see migration 20261005000005), and the API can't create one.
// DECISION: the plan used a command-line script to create a secret system admin. Since this project
// only runs locally and the team wants one shared login, the seed creates it instead.
const DEV_PASSWORD = 'Password123';
const ACCOUNTS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'sysadmin@example.com',
    fullName: 'System Admin',
    role: 'system_admin',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'admin@example.com',
    fullName: 'Demo Admin',
    role: 'admin',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'user@example.com',
    fullName: 'Demo User',
    role: 'user',
  },
];

module.exports = {
  async up(queryInterface) {
    if (config.isProduction) throw new Error('Refusing to seed known passwords in production');

    const passwordHash = await bcrypt.hash(DEV_PASSWORD, config.bcryptCost);
    const now = new Date();
    // bulkInsert writes rows directly (no model defaults), so we fill in every column ourselves.
    const rows = ACCOUNTS.map(({ id, email, fullName, role }) => ({
      id,
      email,
      password_hash: passwordHash,
      full_name: fullName,
      role,
      is_active: true,
      token_version: 0,
      created_at: now,
      updated_at: now,
    }));
    // Safe to run again after adding accounts: ones that already exist are skipped.
    await queryInterface.bulkInsert('users', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    const emails = ACCOUNTS.map((a) => a.email);
    await queryInterface.bulkDelete('users', { email: { [Sequelize.Op.in]: emails } });
  },
};
