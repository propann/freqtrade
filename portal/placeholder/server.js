const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const clientsDir = process.env.CLIENTS_DIR || '/clients';
const defaultQuotas = {
  cpu: process.env.DEFAULT_CPU || '1.0',
  mem_limit: process.env.DEFAULT_MEM_LIMIT || '1024m',
  pids_limit: process.env.DEFAULT_PIDS_LIMIT || '256',
};

const mockSubscriptions = {
  'demo-active': 'active',
  'demo-past-due': 'past_due',
  'demo-canceled': 'canceled',
};

function getSubscriptionStatus(clientId) {
  return mockSubscriptions[clientId] || 'active';
}

function logAudit(action, clientId, details = {}) {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([key]) => !String(key).toLowerCase().includes('secret')),
  );
  // Placeholder: replace with INSERT INTO audit_logs(...) using Postgres when wiring the real portal
  console.info(`[audit] action=${action} client=${clientId}`, safeDetails);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'freqtrade-aws-portal' });
});

app.get('/api/clients', (_req, res) => {
  // Placeholder list; replace with SELECT ... FROM tenants when DB is wired
  const payload = [
    { id: 'demo-active', plan: 'BASIC', status: 'active' },
    { id: 'demo-past-due', plan: 'BASIC', status: 'past_due' },
    { id: 'demo-canceled', plan: 'BASIC', status: 'canceled' },
  ];
  res.json({ clients: payload, quotas: defaultQuotas, clientsDir });
});

app.post('/api/clients/:id/provision', (req, res) => {
  const clientId = req.params.id;
  const status = getSubscriptionStatus(clientId);
  if (status !== 'active') {
    logAudit('provision_denied', clientId, { status });
    return res.status(403).json({ error: 'Subscription inactive. Provisioning refused.' });
  }
  logAudit('provision_requested', clientId, { requester: req.ip });
  res.json({ message: `Provisioning triggered for ${clientId} (placeholder).`, quotas: defaultQuotas });
});

app.post('/api/clients/:id/backtest', (req, res) => {
  const clientId = req.params.id;
  const status = getSubscriptionStatus(clientId);
  if (status !== 'active') {
    logAudit('backtest_denied', clientId, { status });
    return res.status(403).json({ error: 'Subscription inactive. Backtest refused.' });
  }
  const { strategy = 'SampleStrategy', timerange = '20220101-20220201' } = req.body || {};
  logAudit('backtest_requested', clientId, { strategy, timerange });
  res.json({
    message: `Backtest queued for ${clientId} (placeholder).`,
    strategy,
    timerange,
    quotas: defaultQuotas,
  });
});

app.post('/api/billing/webhook/paypal', (req, res) => {
  // Placeholder endpoint to be replaced by PayPal webhook validation.
  logAudit('paypal_webhook_received', 'n/a', { event: req.body?.event_type });
  res.json({ message: 'Webhook stub received. Implement PayPal signature verification before production.' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error', err.message);
  res.status(500).json({ error: 'Internal placeholder error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Portal placeholder running on ${PORT}, clients dir ${clientsDir}`);
});
