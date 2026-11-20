// The AI service: an admin-only slot-release planner on top of a local Ollama model.
//
//   POST /plans                     make a plan (AI, or rule-based if the model is unavailable)
//   POST /plans/:planId/approve     create the plan's slots in Booking  { items: [{ country, visaType, slots }] }
//   GET  /health, GET /metrics
const express = require('express');
const cors = require('cors');
const { z, ZodError } = require('zod');
const config = require('./config');
const metrics = require('./metrics');
const { requireAdmin } = require('./auth');
const { makePlan, approve } = require('./planner');
const { modelStatus, breakerIsOpen } = require('./model');
const { COUNTRIES, VISA_TYPES } = require('./choices');

const app = express();

app.get('/health', async (req, res) => {
  // Healthy even without the model: the planner still works with the rule-based plan.
  res.json({ status: 'ok', model: config.model, ollama: await modelStatus(), breakerOpen: breakerIsOpen() });
});

app.get('/metrics', async (req, res) => {
  res.type(metrics.register.contentType).send(await metrics.register.metrics());
});

app.use('/plans', cors({ origin: config.corsOrigins }), express.json({ limit: '20kb' }), requireAdmin);

app.post('/plans', async (req, res) => {
  res.status(201).json(await makePlan(req.token));
});

const approveBody = z.object({
  items: z.array(z.object({
    country: z.enum(COUNTRIES),
    visaType: z.enum(VISA_TYPES),
    slots: z.number().int().min(0),
  })),
});

app.post('/plans/:planId/approve', async (req, res) => {
  const { items } = approveBody.parse(req.body);
  res.status(201).json(await approve(req.token, req.params.planId, items));
});

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
});

app.use((err, req, res, _next) => {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    err = Object.assign(new Error(`${issue.path.join('.') || 'body'}: ${issue.message}`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  if (!err.status) {
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  }
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
});

app.listen(config.port, () => console.log(`AI service on http://localhost:${config.port} (model ${config.model})`));
