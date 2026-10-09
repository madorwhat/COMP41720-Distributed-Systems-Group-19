'use strict';
const bcrypt = require('bcryptjs');
const { bcryptCost } = require('../../src/config');

// The team's admin accounts.
// This file is how an admin ends up on everyone's laptop. To add one:
//   1. add an entry to ADMINS below (use the next id),
//   2. commit and push.
// Teammates get it the next time they run `npm run dev` (or `npm run db:seed`).
// Running it again is safe: accounts that already exist are left alone.
// These passwords are in git. That's fine for a local demo, but never put a real password here.
const ADMINS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@example.com',
    fullName: 'Demo Admin',
    password: 'Password123',
  },
];

module.exports = {
  // Passwords are saved as bcrypt hashes, never as plain text.
  async up(queryInterface) {
    const rows = await Promise.all(
      ADMINS.map(async ({ id, email, fullName, password }) => ({
        id,
        email,
        full_name: fullName,
        password_hash: await bcrypt.hash(password, bcryptCost),
        role: 'admin',
      })),
    );
    await queryInterface.bulkInsert('users', rows, { ignoreDuplicates: true });
  },

  // Undo: remove exactly these accounts.
  async down(queryInterface, Sequelize) {
    const ids = ADMINS.map((a) => a.id);
    await queryInterface.bulkDelete('users', { id: { [Sequelize.Op.in]: ids } });
  },
};
