// What the AI service reports to Prometheus (shown in the "AI Planner" row in Grafana).
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const opts = (name, help, labelNames = []) => ({ name, help, labelNames, registers: [register] });

module.exports = {
  register,
  modelDuration: new client.Histogram({
    ...opts('ai_model_request_duration_seconds', 'Time the model took to answer', ['outcome']),
    buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  }),
  tokens: new client.Counter(opts('ai_model_tokens_total', 'Tokens used by the model', ['type'])),
  plans: new client.Counter(opts('ai_plans_total', 'Plans made, by who made them', ['source'])),
  fallbacks: new client.Counter(opts('ai_fallbacks_total', 'Times we used the rule-based plan instead of the model', ['reason'])),
  numberCheckFailures: new client.Counter(opts('ai_number_check_failures_total', 'AI reasons that quoted a number not in the data')),
  missedByModel: new client.Counter(opts('ai_missed_by_model_total', 'Shortages the model left out (added by the check)')),
  approvals: new client.Counter(opts('ai_plans_approved_total', 'Plans an admin approved')),
  slotsCreated: new client.Counter(opts('ai_slots_created_total', 'Slots created from approved plans')),
  breakerOpen: new client.Gauge(opts('ai_breaker_open', '1 while the model is switched off after repeated failures')),
};
