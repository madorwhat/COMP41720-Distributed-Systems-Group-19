'use strict';
const bcrypt = require('bcryptjs');
const { bcryptCost } = require('../../src/config');

// 100 demo users, so the app (and the AI planner) has realistic data to work with.
// Booking's and Notification's seeders use the same ids and emails, so the data lines up:
//   id     00000000-0000-4000-8000-1000000000NN   (NN = 001 … 100)
//   email  userNNN@bookmyvisa.test                (".test" can never be a real domain, and
//                                                   Notification never emails it)
// Every demo user's password is Password123. Running this again is safe: existing rows are skipped.
const FIRST = ['Aoife', 'Liam', 'Priya', 'Noah', 'Mei', 'Omar', 'Sofia', 'Jack', 'Ananya', 'Lucas',
  'Chloe', 'Ravi', 'Emma', 'Kenji', 'Fatima', 'Daniel', 'Zara', 'Sean', 'Elena', 'Arjun'];
const LAST = ['Murphy', 'Sharma', 'Kelly', 'Chen', 'Walsh', 'Patel', 'Byrne', 'Garcia', 'Ryan', 'Khan'];
const NATIONALITIES = ['Indian', 'Chinese', 'Brazilian', 'Nigerian', 'American', 'Pakistani',
  'Filipino', 'Mexican', 'Irish', 'Vietnamese'];

const USER_COUNT = 100;
const pad = (n) => String(n).padStart(3, '0');
const userId = (n) => `00000000-0000-4000-8000-1${String(n).padStart(11, '0')}`;

module.exports = {
  async up(queryInterface) {
    const passwordHash = await bcrypt.hash('Password123', bcryptCost); // one hash, reused: same password
    const rows = [];
    for (let n = 1; n <= USER_COUNT; n++) {
      rows.push({
        id: userId(n),
        email: `user${pad(n)}@bookmyvisa.test`,
        full_name: `${FIRST[n % FIRST.length]} ${LAST[n % LAST.length]}`,
        password_hash: passwordHash,
        role: 'user',
        mobile: `+353 87 ${String(1000000 + n * 7919).slice(-7)}`,
        nationality: NATIONALITIES[n % NATIONALITIES.length],
      });
    }
    await queryInterface.bulkInsert('users', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: { [require('sequelize').Op.like]: '%@bookmyvisa.test' } });
  },
};
