const express = require('express');
const { z } = require('zod');
const { QueryTypes } = require('sequelize');
const { sequelize, BookingSlot, Appointment } = require('./db');
const { authenticate, requireAdmin, httpError } = require('./auth');
const events = require('./events');

const country = z.enum(['Schengen', 'UK', 'Irish']);
const visaType = z.enum(['Student', 'Business', 'Tourist']);
const timeRange = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d - (?:[01]\d|2[0-3]):[0-5]\d$/,
    'Use HH:MM - HH:MM',
  )
  .refine((range) => {
    const [start, end] = range.split(' - ').map((time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    });
    return end > start;
  }, 'End time must be after start time');

const createSlotBody = z.object({
  country,
  visaType,
  day: z.iso.date(),
  slotTime: timeRange,
});
const filters = z.object({
  country: country.optional(),
  visaType: visaType.optional(),
  day: z.iso.date().optional(),
});
const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'down' });
  }
});

router.post('/api/v1/tpv/slots', authenticate, requireAdmin, async (req, res) => {
  const slot = await BookingSlot.create(createSlotBody.parse(req.body));
  events.slotsOpened(slot); // tell Notification; we don't wait for it
  res.status(201).json({ slot });
});

// --- For the AI planner (backend/ai-service) ---

// Supply per country and visa type, from today on: how many slots, how many booked, how many
// free, and the last day that already has slots (new slots go after it).
router.get('/api/v1/tpv/stats', authenticate, requireAdmin, async (req, res) => {
  const data = await sequelize.query(
    `SELECT country, visa_type AS "visaType",
            COUNT(*)::int AS "upcomingSlots",
            COUNT(*) FILTER (WHERE is_booked)::int AS "bookedSlots",
            COUNT(*) FILTER (WHERE NOT is_booked)::int AS "freeSlots",
            MAX(day) AS "lastSlotDay"
       FROM booking_slots
      WHERE day >= CURRENT_DATE
      GROUP BY country, visa_type`,
    { type: QueryTypes.SELECT },
  );
  res.json({ data });
});

// Creates the slots of an approved plan in one go. Approving the same plan again creates nothing
// (the slots remember the planId), and a slot that already exists is skipped, not an error.
const batchBody = z.object({
  planId: z.uuid(),
  slots: z.array(createSlotBody).min(1).max(200),
});

router.post('/api/v1/tpv/slots/batch', authenticate, requireAdmin, async (req, res) => {
  const { planId, slots } = batchBody.parse(req.body);
  if (await BookingSlot.findOne({ where: { planId } })) {
    return res.json({ planId, created: 0, skipped: slots.length, alreadyApproved: true });
  }

  const created = await sequelize.query(
    `INSERT INTO booking_slots (country, visa_type, day, slot_time, plan_id)
     SELECT country, visa_type, day, slot_time, CAST(:planId AS uuid)
       FROM UNNEST(ARRAY[:countries]::varchar[], ARRAY[:visaTypes]::varchar[],
                   ARRAY[:days]::date[], ARRAY[:times]::varchar[])
         AS s(country, visa_type, day, slot_time)
     ON CONFLICT DO NOTHING -- a slot that already exists is skipped
     RETURNING booking_id AS "bookingId", country, visa_type AS "visaType", day,
               slot_time AS "slotTime", created_at AS "createdAt"`,
    {
      replacements: {
        planId,
        countries: slots.map((s) => s.country),
        visaTypes: slots.map((s) => s.visaType),
        days: slots.map((s) => s.day),
        times: slots.map((s) => s.slotTime),
      },
      type: QueryTypes.SELECT,
    },
  );
  // Tell Notification about each new slot, as for a single slot; we don't wait for it.
  for (const slot of created) events.slotsOpened({ ...slot, createdAt: new Date(slot.createdAt) });
  res.status(201).json({ planId, created: created.length, skipped: slots.length - created.length });
});

router.get('/api/v1/tpv/slots', async (req, res) => {
  const query = filters.parse(req.query);
  const where = { isBooked: false };
  if (query.country) where.country = query.country;
  if (query.visaType) where.visaType = query.visaType;
  if (query.day) where.day = query.day;

  const slots = await BookingSlot.findAll({
    where,
    order: [
      ['day', 'ASC'],
      ['slotTime', 'ASC'],
    ],
  });
  res.json({ data: slots });
});

router.post('/api/v1/bookings', authenticate, async (req, res) => {
  const { bookingId } = z.object({ bookingId: z.uuid() }).parse(req.body);
  const { appointment, slot } = await sequelize.transaction(async (transaction) => {
    // `returning: true` also gives back the booked slot, which the confirmation email needs.
    const [updatedCount, [slot]] = await BookingSlot.update(
      { isBooked: true },
      { where: { bookingId, isBooked: false }, returning: true, transaction },
    );

    if (updatedCount === 0) {
      const slotExists = await BookingSlot.findByPk(bookingId, { transaction });
      if (!slotExists) throw httpError(404, 'NOT_FOUND', 'Slot not found');
      throw httpError(409, 'SLOT_UNAVAILABLE', 'Slot has already been booked');
    }

    const appointment = await Appointment.create(
      { userId: req.user.id, bookingId },
      { transaction },
    );
    return { appointment, slot };
  });
  // Only now that the booking is committed do we tell Notification; we don't wait for it.
  events.bookingConfirmed(appointment, slot, req.user);
  res.status(201).json({ appointment });
});

router.get('/api/v1/bookings/my-slots', authenticate, async (req, res) => {
  const appointments = await Appointment.findAll({
    where: { userId: req.user.id },
    include: [{ model: BookingSlot, as: 'slot' }],
    order: [['createdAt', 'DESC']],
  });
  res.json({ data: appointments });
});

module.exports = router;
