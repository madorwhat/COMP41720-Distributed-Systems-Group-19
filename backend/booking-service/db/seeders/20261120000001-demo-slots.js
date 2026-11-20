'use strict';
const crypto = require('crypto');

// Demo slots and bookings, so the app (and the AI planner) has realistic data to work with.
// Demand is deliberately uneven: some country/visa types are almost sold out, others are quiet.
// Bookings belong to the 100 demo users from Auth's seeder (same ids).
// Slots are on weekdays from Mon 23 Nov 2026, 09:00–12:00 in 30-minute slots.
// Running this again is safe: existing rows are skipped.
//
//   [country, visaType, days of slots, share already booked]
const PLAN = [
  ['UK', 'Business', 2, 1.0],
  ['UK', 'Student', 5, 0.7],
  ['UK', 'Tourist', 4, 0.6],
  ['Schengen', 'Student', 6, 0.9],
  ['Schengen', 'Tourist', 8, 0.3],
  ['Schengen', 'Business', 4, 0.5],
  ['Irish', 'Student', 2, 1.0],
  ['Irish', 'Tourist', 5, 0.2],
  ['Irish', 'Business', 2, 0.0],
];
const TIMES = ['09:00 - 09:30', '09:30 - 10:00', '10:00 - 10:30', '10:30 - 11:00', '11:00 - 11:30', '11:30 - 12:00'];
const FIRST_DAY = '2026-11-23';
const USER_COUNT = 100;
const userId = (n) => `00000000-0000-4000-8000-1${String(n).padStart(11, '0')}`;

// The same input always gives the same id, so a second run finds the rows it made the first time.
function stableId(text) {
  const h = crypto.createHash('md5').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function weekdays(count) {
  const days = [];
  for (const d = new Date(`${FIRST_DAY}T12:00:00Z`); days.length < count; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function build() {
  const slots = [];
  const appointments = [];
  let nextUser = 0;
  for (const [country, visaType, dayCount, bookedShare] of PLAN) {
    const pairSlots = weekdays(dayCount).flatMap((day) =>
      TIMES.map((slotTime) => ({ booking_id: stableId(`slot|${country}|${visaType}|${day}|${slotTime}`), country, visa_type: visaType, day, slot_time: slotTime })),
    );
    const bookedCount = Math.round(pairSlots.length * bookedShare);
    pairSlots.forEach((slot, i) => {
      slot.is_booked = i < bookedCount;
      slots.push(slot);
      if (slot.is_booked) {
        appointments.push({
          appointment_id: stableId(`appointment|${slot.booking_id}`),
          booking_id: slot.booking_id,
          user_id: userId((nextUser++ % USER_COUNT) + 1),
        });
      }
    });
  }
  return { slots, appointments };
}

module.exports = {
  async up(queryInterface) {
    const { slots, appointments } = build();
    await queryInterface.bulkInsert('booking_slots', slots, { ignoreDuplicates: true });

    // Only book slots that really are ours: if an admin had already added a slot at the same
    // country/visa/day/time, our row was skipped and there is nothing to attach a booking to.
    const [existing] = await queryInterface.sequelize.query(
      'SELECT booking_id FROM booking_slots WHERE booking_id IN (:ids) AND is_booked',
      { replacements: { ids: appointments.map((a) => a.booking_id) } },
    );
    const ours = new Set(existing.map((row) => row.booking_id));
    const rows = appointments.filter((a) => ours.has(a.booking_id));
    if (rows.length) await queryInterface.bulkInsert('appointments', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    const { slots, appointments } = build();
    const { Op } = require('sequelize');
    await queryInterface.bulkDelete('appointments', { appointment_id: { [Op.in]: appointments.map((a) => a.appointment_id) } });
    await queryInterface.bulkDelete('booking_slots', { booking_id: { [Op.in]: slots.map((s) => s.booking_id) } });
  },
};
