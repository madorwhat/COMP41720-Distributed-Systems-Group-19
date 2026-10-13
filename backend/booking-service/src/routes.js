const express = require('express');
const { z } = require('zod');
const { sequelize, BookingSlot, Appointment } = require('./db');
const { authenticate, requireAdmin, httpError } = require('./auth');

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
  res.status(201).json({ slot });
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
  const appointment = await sequelize.transaction(async (transaction) => {
    const [updatedCount] = await BookingSlot.update(
      { isBooked: true },
      { where: { bookingId, isBooked: false }, transaction },
    );

    if (updatedCount === 0) {
      const slotExists = await BookingSlot.findByPk(bookingId, { transaction });
      if (!slotExists) throw httpError(404, 'NOT_FOUND', 'Slot not found');
      throw httpError(409, 'SLOT_UNAVAILABLE', 'Slot has already been booked');
    }

    return Appointment.create({ userId: req.user.id, bookingId }, { transaction });
  });
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
