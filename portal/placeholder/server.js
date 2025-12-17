const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const port = process.env.PORT || 8080;
const clientDir = process.env.CLIENTS_DIR || '/data/clients';
const quotas = {
  cpu: process.env.DEFAULT_CPU || '1.0',
  mem: process.env.DEFAULT_MEM_LIMIT || '1024m',
  pids: parseInt(process.env.DEFAULT_PIDS_LIMIT || '256', 10),
};

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 2,
});

async function ensureTenant(tenantId, email) {
  await pool.query(
    'INSERT INTO tenants(id, email) VALUES($1, $2) ON CONFLICT (id) DO UPDATE SET email = COALESCE($2, tenants.email)',
    [tenantId, email || null]
  );
}

async function ensureSubscription(tenantId) {
  await pool.query(
    'INSERT INTO subscriptions(tenant_id) VALUES($1) ON CONFLICT (tenant_id) DO NOTHING',
    [tenantId]
  );
  const { rows } = await pool.query(
    'SELECT tenant_id, status, plan, updated_at FROM subscriptions WHERE tenant_id = $1 LIMIT 1',
    [tenantId]
  );
  return rows[0];
}

async function findTenant(tenantId) {
  const { rows } = await pool.query('SELECT id, email FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
  return rows[0];
}

function subscriptionActive(subscription) {
  return subscription?.status === 'active';
}

async function requireActiveSubscription(req, res, next) {
  const tenantId = req.params.id;
  if (!tenantId) {
    return res.status(400).json({ error: 'missing_tenant', message: 'Tenant id is required' });
  }

  try {
    const tenant = await findTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'tenant_not_found', message: `Tenant ${tenantId} not found` });
    }

    const subscription = await ensureSubscription(tenantId);
    if (!subscriptionActive(subscription)) {
      await pool.query('INSERT INTO audit_logs(tenant_id, action, meta) VALUES($1, $2, $3)', [
        tenantId,
        'gating_blocked',
        { path: req.path, status: subscription?.status || 'missing' },
      ]);
      return res.status(402).json({
        error: 'subscription_inactive',
        message: `Subscription for ${tenantId} is missing or inactive`,
        status: subscription?.status || 'missing',
      });
    }
    req.subscription = subscription;
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'subscription_check_failed', detail: error.message });
  }
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.get('/api/clients', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT tenants.id, tenants.email, subscriptions.status, subscriptions.plan
       FROM tenants
       LEFT JOIN subscriptions ON subscriptions.tenant_id = tenants.id
       ORDER BY tenants.id`
    );
    res.json({
      clients: result.rows,
      defaults: quotas,
      clientRoot: clientDir,
    });
  } catch (error) {
    res.status(500).json({ error: 'db_unavailable', detail: error.message });
  }
});

app.post('/api/clients/:id/provision', async (req, res, next) => {
  const clientId = req.params.id;
  const email = req.body?.email;
  if (!email) {
    return res.status(400).json({ error: 'missing_email', message: 'Email requis pour provisionner un tenant.' });
  }

  try {
    await pool.query(
      'INSERT INTO tenants(id, email) VALUES($1, $2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email',
      [clientId, email]
    );
    await ensureSubscription(clientId);
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'provision_failed', detail: error.message });
  }
}, requireActiveSubscription, async (req, res) => {
  try {
    await pool.query('INSERT INTO audit_logs(tenant_id, action, meta) VALUES($1, $2, $3)', [
      req.params.id,
      'provision_attempt',
      { email: req.body?.email, status: req.subscription.status },
    ]);
    res.status(200).json({
      status: 'provision_allowed',
      id: req.params.id,
      plan: req.subscription.plan,
      subscription_status: req.subscription.status,
    });
  } catch (error) {
    res.status(500).json({ error: 'audit_failed', detail: error.message });
  }
});

app.post('/api/clients/:id/backtest', requireActiveSubscription, async (req, res) => {
  const clientId = req.params.id;
  const timerange = req.body?.timerange || '20230101-20230201';
  const strategy = req.body?.strategy || 'SampleStrategy';

  try {
    await pool.query('INSERT INTO audit_logs(tenant_id, action, meta) VALUES($1, $2, $3)', [
      clientId,
      'backtest_requested',
      { timerange, strategy },
    ]);
    res.json({
      status: 'accepted',
      job: {
        clientId,
        mode: 'backtest',
        timerange,
        strategy,
        quotas,
      },
      subscription_status: req.subscription.status,
      note: 'Ce placeholder ne déclenche pas réellement de conteneur. Brancher docker-socket-proxy ici.',
    });
  } catch (error) {
    res.status(500).json({ error: 'backtest_failed', detail: error.message });
  }
});

app.post('/api/clients/:id/start', requireActiveSubscription, async (req, res) => {
  const clientId = req.params.id;
  try {
    await pool.query('INSERT INTO audit_logs(tenant_id, action, meta) VALUES($1, $2, $3)', [
      clientId,
      'start_requested',
      { source: 'api', status: req.subscription.status },
    ]);
    res.json({
      status: 'accepted',
      message: 'Start job placeholder : brancher l’orchestration de conteneur ici.',
      plan: req.subscription.plan,
      subscription_status: req.subscription.status,
    });
  } catch (error) {
    res.status(500).json({ error: 'start_failed', detail: error.message });
  }
});

app.post('/api/billing/webhook/paypal', async (req, res) => {
  const { subscription_id: subscriptionId, status, tenant_id: tenantIdFromHook } = req.body || {};
  const tenantId = tenantIdFromHook || subscriptionId;

  if (!tenantId || !status) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  try {
    const tenant = await findTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'tenant_not_found', message: `Tenant ${tenantId} not found` });
    }
    await pool.query(
      'INSERT INTO subscriptions(tenant_id, status, updated_at) VALUES($1, $2, NOW()) ON CONFLICT (tenant_id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at',
      [tenantId, status.toLowerCase()]
    );
    await pool.query('INSERT INTO audit_logs(tenant_id, action, meta) VALUES($1, $2, $3)', [
      tenantId,
      'subscription_update',
      { status: status.toLowerCase(), source: 'paypal-webhook' },
    ]);
    res.json({ status: 'ack' });
  } catch (error) {
    res.status(500).json({ error: 'webhook_failed', detail: error.message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Portal placeholder listening on ${port}`);
});
