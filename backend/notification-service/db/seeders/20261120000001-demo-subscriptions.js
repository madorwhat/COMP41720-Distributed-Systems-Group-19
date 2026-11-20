'use strict';

// Demo "tell me when slots open" choices for the 100 demo users from Auth's seeder (same emails).
// Demand is deliberately uneven, so the AI planner has something to find: lots of people are
// waiting for UK Business and Schengen Student, few for Irish Tourist.
// These addresses end in ".test", which Notification never emails (see src/mailer.js).
// Running this again is safe: existing rows are skipped.
//
//   [country, visaType, number of demo users waiting]
const DEMAND = [
  ['UK', 'Business', 40],
  ['UK', 'Student', 25],
  ['UK', 'Tourist', 12],
  ['Schengen', 'Student', 35],
  ['Schengen', 'Tourist', 10],
  ['Schengen', 'Business', 8],
  ['Irish', 'Student', 20],
  ['Irish', 'Tourist', 3],
  ['Irish', 'Business', 0],
];
const USER_COUNT = 100;
const email = (n) => `user${String(n).padStart(3, '0')}@bookmyvisa.test`;

function build() {
  const rows = [];
  DEMAND.forEach(([country, visaType, count], pairIndex) => {
    for (let i = 0; i < count; i++) {
      // a different stretch of users for each choice, wrapping round at 100
      const n = ((pairIndex * 11 + i) % USER_COUNT) + 1;
      rows.push({ user_email: email(n), country, visa_type: visaType });
    }
  });
  return rows;
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('slot_subscriptions', build(), { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    const { Op } = require('sequelize');
    await queryInterface.bulkDelete('slot_subscriptions', { user_email: { [Op.like]: '%@bookmyvisa.test' } });
  },
};
