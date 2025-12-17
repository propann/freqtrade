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
  await pool.query('INSERT INTO subscriptions(tenant_id) VALUES($1) ON CONFLICT (tenant_id) DO NOTHING', [tenantId]);
}

async function getSubscriptionStatus(tenantId) {
  const { rows } = await pool.query('SELECT status FROM subscriptions WHERE tenant_id = $1 LIMIT 1', [tenantId]);
  return rows[0]?.status;
}

async function requireActiveSubscription(tenantId, res) {
  const status = (await getSubscriptionStatus(tenantId)) || 'inactive';
  if (status !== 'active') {
    res
      .status(402)
      .json({
        error: 'subscription_inactive',
        status,
        message: 'Subscription must be active to provision or start jobs.',
      });
    return false;
  }
  return true;
}

async function recordAudit(tenantId, action, meta = {}) {
  await pool.query('INSERT INTO audit_logs(tenant_id, action, meta) VALUES($1, $2, $3)', [tenantId, action, meta]);
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
      'SELECT tenants.id, tenants.email, subscriptions.status, subscriptions.plan, subscriptions.updated_at FROM tenants LEFT JOIN subscriptions ON subscriptions.tenant_id = tenants.id ORDER BY tenants.id'
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

app.post('/api/clients/:id/provision', async (req, res) => {
  const clientId = req.params.id;
  const email = req.body?.email || null;
  try {
    await ensureTenant(clientId, email);
    await ensureSubscription(clientId);

    if (!(await requireActiveSubscription(clientId, res))) {
      return;
    }

    await recordAudit(clientId, 'provision', { email });
    res.status(201).json({ status: 'provisioned', id: clientId });
  } catch (error) {
    res.status(500).json({ error: 'provision_failed', detail: error.message });
  }
});

app.post('/api/clients/:id/backtest', async (req, res) => {
  const clientId = req.params.id;
  try {
    await ensureTenant(clientId, req.body?.email || null);
    await ensureSubscription(clientId);

    if (!(await requireActiveSubscription(clientId, res))) {
      return;
    }

    await recordAudit(clientId, 'backtest_requested', {
      timerange: req.body?.timerange,
      strategy: req.body?.strategy,
    });
    const timerange = req.body?.timerange || '20230101-20230201';
    res.json({
      status: 'accepted',
      job: {
        clientId,
        mode: 'backtest',
        timerange,
        quotas,
      },
      note: 'Ce placeholder ne déclenche pas réellement de conteneur. Brancher docker-socket-proxy ici.',
    });
  } catch (error) {
    res.status(500).json({ error: 'backtest_failed', detail: error.message });
  }
});

app.post('/api/billing/webhook/paypal', async (req, res) => {
  const { subscription_id: subscriptionId, status } = req.body || {};
  if (!subscriptionId || !status) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  try {
    await ensureTenant(subscriptionId, null);
    await ensureSubscription(subscriptionId);
    await pool.query(
      'UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE tenant_id = $2',
      [status.toLowerCase(), subscriptionId]
    );
    await recordAudit(subscriptionId, 'subscription_update', { status: status.toLowerCase(), source: 'paypal-webhook' });
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
