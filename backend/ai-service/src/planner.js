// The AI slot-release planner.
//
//   1. snapshot   read demand (Notification) and supply (Booking) for every country/visa type
//   2. propose    ask the model, or use the rule-based plan if the model is down/slow/wrong
//   3. check      never trust the model: allowed choices only, 1–40 slots, and every number in
//                 its reason must be in the data (otherwise we replace the reason)
//   4. approve    the admin may change the counts; we re-read Booking (the snapshot may be old),
//                 lay the slots out on the next free weekdays, and Booking creates them in one go
const crypto = require('crypto');
const config = require('./config');
const metrics = require('./metrics');
const { askModel } = require('./model');
const { httpError } = require('./auth');
const { COUNTRIES, VISA_TYPES, MAX_SLOTS, TIMES } = require('./choices');

// --- 1. snapshot ---

async function getJson(base, path, token, service) {
  let res;
  try {
    res = await fetch(base + path, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw httpError(503, 'DEPENDENCY_DOWN', `Cannot plan: the ${service} service is not reachable`);
  }
  if (!res.ok) throw httpError(503, 'DEPENDENCY_DOWN', `Cannot plan: the ${service} service answered ${res.status}`);
  return (await res.json()).data;
}

const bookingStats = (token) => getJson(config.bookingUrl, '/api/v1/tpv/stats', token, 'Booking');

// One row per country and visa type. We refuse to plan with half the data: a plan that doesn't
// know how many people are waiting would be a guess.
async function snapshot(token) {
  const [supply, demand] = await Promise.all([
    bookingStats(token),
    getJson(config.notificationUrl, '/subscriptions/stats', token, 'Notification'),
  ]);
  const find = (list, c, v) => list.find((r) => r.country === c && r.visaType === v);
  return COUNTRIES.flatMap((country) =>
    VISA_TYPES.map((visaType) => {
      const s = find(supply, country, visaType) || {};
      return {
        country,
        visaType,
        subscribers: find(demand, country, visaType)?.subscribers || 0,
        freeSlots: s.freeSlots || 0,
        bookedSlots: s.bookedSlots || 0,
        lastSlotDay: s.lastSlotDay || null,
      };
    }),
  );
}

// --- 2. propose ---

const shortfall = (row) => row.subscribers - row.freeSlots; // people who can't get a slot now
const rowFor = (rows, country, visaType) => rows.find((r) => r.country === country && r.visaType === visaType);
const factualReason = (row) =>
  `${row.subscribers} people are waiting and ${row.freeSlots} ${row.freeSlots === 1 ? 'slot is' : 'slots are'} free.`;

// The fallback, and a baseline to compare the model against: one slot per waiting person who
// has no free slot, capped at 40.
function rulesPlan(rows) {
  return rows
    .map((row) => ({ ...row, slots: Math.min(MAX_SLOTS, shortfall(row)), reason: factualReason(row) }))
    .filter((item) => item.slots > 0)
    .map(({ country, visaType, slots, reason }) => ({ country, visaType, slots, reason }));
}

// --- 3. check ---

// Keeps only what we would accept from a person: a real country/visa type (once), 1–40 slots,
// and only where free slots really don't cover the people waiting. A reason quoting a number
// that is not in the data is replaced and flagged. Shortages the model left out are returned
// as `missed`, and makePlan adds them to the plan.
function checkItems(modelItems, rows) {
  const seen = new Set();
  const items = [];
  let dropped = 0;
  for (const item of modelItems) {
    const row = rowFor(rows, item.country, item.visaType);
    const key = `${item.country}|${item.visaType}`;
    // never more than needed: people waiting minus free slots (and at most 40)
    const slots = Number.isInteger(item.slots) && row ? Math.min(item.slots, MAX_SLOTS, shortfall(row)) : 0;
    if (!row || seen.has(key) || slots < 1 || shortfall(row) <= 0) {
      dropped++;
      continue;
    }
    seen.add(key);

    // The reason must state the real waiting and free counts, and quote no other numbers except
    // the shortfall. Otherwise the model mixed numbers up (e.g. "only 22 slots are free" when 14
    // are, 22 being the shortfall) and we use a sentence built from the real figures instead.
    const quoted = String(item.reason || '').match(/\d+/g) || [];
    const allowed = new Set([row.subscribers, row.freeSlots, shortfall(row)].map(String));
    const correct =
      quoted.includes(String(row.subscribers)) &&
      quoted.includes(String(row.freeSlots)) &&
      quoted.every((n) => allowed.has(n));
    if (!correct) metrics.numberCheckFailures.inc();
    items.push({
      country: item.country,
      visaType: item.visaType,
      slots,
      reason: correct ? String(item.reason).trim() : factualReason(row),
      reasonCorrected: !correct, // not shown on screen; in the API response and Grafana
    });
  }
  const missed = rows
    .filter((row) => shortfall(row) > 0 && !seen.has(`${row.country}|${row.visaType}`))
    .map(({ country, visaType, subscribers, freeSlots }) => ({ country, visaType, subscribers, freeSlots }));
  return { items, dropped, missed };
}

// --- 4. schedule and approve ---

const dublinToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(new Date());

// The next `count` slots on weekdays after `after` (YYYY-MM-DD).
function layOut(count, after) {
  const slots = [];
  const d = new Date(`${after}T12:00:00Z`);
  while (slots.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const day = d.toISOString().slice(0, 10);
    for (const slotTime of TIMES) if (slots.length < count) slots.push({ day, slotTime });
  }
  return slots;
}

// New slots start the weekday after the last existing slot (or after today), so they never
// clash with what is already there.
function schedule(item, row) {
  const today = dublinToday();
  const after = row?.lastSlotDay && row.lastSlotDay > today ? row.lastSlotDay : today;
  const slots = layOut(item.slots, after);
  return { ...item, firstDay: slots[0].day, lastDay: slots[slots.length - 1].day, times: slots };
}

// Plans wait here for the admin's decision. In memory: a restart only means "make a new plan".
const plans = new Map();

async function makePlan(token) {
  const rows = await snapshot(token);
  const started = Date.now();
  let source = 'ai';
  let fallbackReason = null;
  let tokens = null;
  let items;
  let dropped = 0;
  let missed = [];
  try {
    const answer = await askModel(
      rows.map(({ country, visaType, subscribers, freeSlots }) => ({ country, visaType, subscribers, freeSlots, shortfall: subscribers - freeSlots })),
    );
    tokens = answer.tokens;
    ({ items, dropped, missed } = checkItems(answer.items, rows));
    // Shortages the model left out are added with the rule-based count, so the admin never
    // loses a real gap. They are marked `addedByCheck` (in the API and metrics, not on screen).
    for (const m of missed) {
      const row = rowFor(rows, m.country, m.visaType);
      items.push({ country: m.country, visaType: m.visaType, slots: Math.min(MAX_SLOTS, shortfall(row)), reason: factualReason(row), reasonCorrected: false, addedByCheck: true });
    }
    if (missed.length) metrics.missedByModel.inc(missed.length);
  } catch (err) {
    if (!err.reason) throw err;
    console.warn(`Using the rule-based plan: ${err.message}`);
    source = 'rules';
    fallbackReason = err.reason;
    items = rulesPlan(rows).map((item) => ({ ...item, reasonCorrected: false }));
    metrics.fallbacks.inc({ reason: err.reason });
  }
  metrics.plans.inc({ source });

  const plan = {
    planId: crypto.randomUUID(),
    source, // 'ai' or 'rules'
    fallbackReason,
    model: source === 'ai' ? config.model : null,
    promptVersion: source === 'ai' ? config.promptVersion : null,
    dataAsOf: new Date().toISOString(),
    tookMs: Date.now() - started,
    tokens,
    droppedItems: dropped, // model suggestions that failed the checks
    missed, // shortages the model did not mention (added to the plan by the check)
    snapshot: rows,
    items: items.map((item) => schedule(item, rowFor(rows, item.country, item.visaType))),
  };
  plans.set(plan.planId, plan);
  if (plans.size > 100) plans.delete(plans.keys().next().value); // keep the newest 100
  return plan;
}

async function approve(token, planId, edited) {
  const plan = plans.get(planId);
  if (!plan) throw httpError(404, 'PLAN_NOT_FOUND', 'This plan has expired. Please make a new one.');

  // The admin can change each count (0 removes it), but not add new country/visa types.
  const counts = new Map(edited.map((e) => [`${e.country}|${e.visaType}`, e.slots]));
  const rows = await bookingStats(token); // fresh: slots may have been added since the plan was made
  const items = plan.items
    .map((item) => ({ ...item, slots: Math.min(MAX_SLOTS, counts.get(`${item.country}|${item.visaType}`) ?? item.slots) }))
    .filter((item) => item.slots > 0)
    .map((item) => schedule(item, rowFor(rows, item.country, item.visaType)));
  if (!items.length) throw httpError(400, 'VALIDATION_ERROR', 'The plan has no slots left to create');

  const slots = items.flatMap((item) =>
    item.times.map(({ day, slotTime }) => ({ country: item.country, visaType: item.visaType, day, slotTime })),
  );
  let res;
  try {
    res = await fetch(`${config.bookingUrl}/api/v1/tpv/slots/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ planId, slots }),
    });
  } catch {
    // Safe to try again: Booking remembers the planId, so a retry never creates slots twice.
    throw httpError(503, 'DEPENDENCY_DOWN', 'Booking is not reachable. Nothing was created; please try again.');
  }
  const result = await res.json();
  if (!res.ok) throw httpError(res.status, result.error?.code, result.error?.message);

  if (!result.alreadyApproved) metrics.approvals.inc(); // a repeat approval isn't a new one
  metrics.slotsCreated.inc(result.created);
  console.log(
    `Plan ${planId} (made by ${plan.source === 'ai' ? `${plan.model} (${plan.promptVersion})` : 'rules'}) approved: ` +
      `${result.created} slots created, ${result.skipped} skipped`,
  );
  return { ...result, items };
}

module.exports = { makePlan, approve, checkItems, rulesPlan };
