// Asks the local Ollama model for a release plan. The model only answers "how many slots for which
// country and visa type, and why". It never writes anything: src/planner.js checks the answer and
// an admin approves it before Booking creates a single slot.
//
// Resilience: every call has a timeout, and after 3 failures in a row a circuit breaker stops
// calling the model for 30 seconds. While it is open, callers get the rule-based plan instead.
const config = require('./config');
const metrics = require('./metrics');
const { COUNTRIES, VISA_TYPES, MAX_SLOTS } = require('./choices');

const PROMPT = `You plan visa appointment slot releases for an admin.
You get one row per country and visa type:
  subscribers = people waiting to hear about new slots
  freeSlots   = slots still free
  shortfall   = subscribers minus freeSlots (people who cannot get a slot today)
Suggest new slots only for rows where shortfall is more than 0. Leave every other row out.
For each suggestion give: country, visaType, slots (a whole number from 1 to ${MAX_SLOTS}, usually
about the shortfall) and reason: one plain sentence for the admin, using only numbers from the row.
Example reason: "36 people are waiting but only 4 slots are free."`;

// The answer must have exactly this shape (Ollama enforces it).
const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          country: { type: 'string', enum: COUNTRIES },
          visaType: { type: 'string', enum: VISA_TYPES },
          slots: { type: 'integer' },
          reason: { type: 'string' },
        },
        required: ['country', 'visaType', 'slots', 'reason'],
      },
    },
  },
  required: ['items'],
};

// --- circuit breaker ---
const FAILURES_TO_OPEN = 3;
const OPEN_FOR_MS = 30_000;
let failuresInARow = 0;
let openUntil = 0;

const breakerIsOpen = () => Date.now() < openUntil;

function recordResult(ok) {
  if (ok) failuresInARow = 0;
  else if (++failuresInARow >= FAILURES_TO_OPEN) {
    openUntil = Date.now() + OPEN_FOR_MS;
    failuresInARow = 0;
    console.warn(`Model failed ${FAILURES_TO_OPEN} times in a row: not calling it for ${OPEN_FOR_MS / 1000}s`);
  }
  metrics.breakerOpen.set(breakerIsOpen() ? 1 : 0);
}

const fail = (reason, message) => Object.assign(new Error(message), { reason });

// Returns { items, tokens: { prompt, completion } }, or throws an error with .reason set to
// 'breaker_open', 'timeout', 'model_error' or 'invalid_answer'.
async function askModel(rows) {
  if (breakerIsOpen()) throw fail('breaker_open', 'The model is switched off for a moment after repeated failures');

  const stopTimer = metrics.modelDuration.startTimer();
  let outcome = 'ok';
  try {
    let res;
    try {
      res = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(config.modelTimeoutMs),
        body: JSON.stringify({
          model: config.model,
          stream: false,
          format: SCHEMA,
          options: { temperature: 0 }, // same data, same answer
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: JSON.stringify(rows) },
          ],
        }),
      });
    } catch (err) {
      outcome = err.name === 'TimeoutError' ? 'timeout' : 'error';
      throw fail(outcome === 'timeout' ? 'timeout' : 'model_error', `Model did not answer: ${err.message}`);
    }
    if (!res.ok) {
      outcome = 'error';
      throw fail('model_error', `Model answered ${res.status}: ${await res.text()}`);
    }

    const body = await res.json();
    metrics.tokens.inc({ type: 'prompt' }, body.prompt_eval_count || 0);
    metrics.tokens.inc({ type: 'completion' }, body.eval_count || 0);
    let answer;
    try {
      answer = JSON.parse(body.message.content);
    } catch {
      outcome = 'invalid';
      throw fail('invalid_answer', 'Model answer was not valid JSON');
    }
    if (!Array.isArray(answer.items)) {
      outcome = 'invalid';
      throw fail('invalid_answer', 'Model answer had no items');
    }
    return { items: answer.items, tokens: { prompt: body.prompt_eval_count, completion: body.eval_count } };
  } finally {
    stopTimer({ outcome });
    recordResult(outcome === 'ok');
  }
}

// For /health: is Ollama up, and has it got our model?
async function modelStatus() {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const { models = [] } = await res.json();
    return models.some((m) => m.name === config.model || m.model === config.model) ? 'ok' : 'model not pulled yet';
  } catch {
    return 'down';
  }
}

module.exports = { askModel, modelStatus, breakerIsOpen };
