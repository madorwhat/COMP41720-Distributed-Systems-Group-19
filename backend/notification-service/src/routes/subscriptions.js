// "Tell me when new appointments open for this country and visa type."
//
// A person chooses a country and a visa type, and from then on gets the "new appointments are
// open" email for exactly that choice, and for nothing else. They can have several choices.
// Whose choice it is comes from the login token, so everyone only sees and changes their own.
//
//   GET    /subscriptions                        my choices
//   PUT    /subscriptions/:country/:visaType     subscribe (repeating it is harmless)
//   DELETE /subscriptions/:country/:visaType     unsubscribe (also harmless to repeat)
//   GET    /subscriptions/stats                  admins: how many people wait for each choice
const express = require('express');
const { QueryTypes } = require('sequelize');
const { z, ZodError } = require('zod');
const { sequelize, SlotSubscription } = require('../db');
const { authenticate, requireAdmin } = require('./auth');
const { country, visaType } = require('../choices');

const choice = z.object({ country, visaType });

const router = express.Router();
router.use(authenticate);

// My choices, in a steady order.
router.get('/', async (req, res) => {
  const data = await SlotSubscription.findAll({
    where: { userEmail: req.user.email },
    attributes: ['country', 'visaType', 'createdAt'],
    order: [
      ['country', 'ASC'],
      ['visaType', 'ASC'],
    ],
  });
  res.json({ data });
});

// For the AI planner: how many people are waiting for each country and visa type. Counts only.
router.get('/stats', requireAdmin, async (req, res) => {
  const data = await sequelize.query(
    `SELECT country, visa_type AS "visaType", COUNT(*)::int AS subscribers
       FROM slot_subscriptions GROUP BY country, visa_type`,
    { type: QueryTypes.SELECT },
  );
  res.json({ data });
});

router.put('/:country/:visaType', async (req, res) => {
  const { country, visaType } = choice.parse(req.params);
  // One statement: add the choice, or, if it is already there, just refresh the name.
  const [subscription] = await sequelize.query(
    `INSERT INTO slot_subscriptions (user_email, country, visa_type, user_name)
     VALUES (:userEmail, :country, :visaType, :userName)
     ON CONFLICT (user_email, country, visa_type) DO UPDATE SET user_name = EXCLUDED.user_name
     RETURNING country, visa_type AS "visaType", created_at AS "createdAt"`,
    {
      replacements: {
        userEmail: req.user.email,
        country,
        visaType,
        userName: req.user.name ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );
  res.json({ subscription });
});

router.delete('/:country/:visaType', async (req, res) => {
  const { country, visaType } = choice.parse(req.params);
  await SlotSubscription.destroy({ where: { userEmail: req.user.email, country, visaType } });
  res.status(204).end();
});

// Every error on these routes ends up here and looks the same as in the other services:
// { "error": { "code": "...", "message": "..." } }.
router.use((err, req, res, _next) => {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `${issue.path.join('.') || 'body'}: ${issue.message}`,
      },
    });
  }
  if (err.status) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
});

module.exports = router;
