const { pool } = require('./db');

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

async function findTenantWithSubscription(tenantId) {
  const { rows } = await pool.query(
    `SELECT tenants.id, tenants.email, subscriptions.status, subscriptions.plan, subscriptions.updated_at
     FROM tenants
     LEFT JOIN subscriptions ON subscriptions.tenant_id = tenants.id
     WHERE tenants.id = $1
     LIMIT 1`,
    [tenantId]
  );
  return rows[0];
}

function subscriptionActive(subscription) {
  return subscription?.status === 'active';
}

module.exports = {
  ensureTenant,
  ensureSubscription,
  findTenant,
  findTenantWithSubscription,
  subscriptionActive,
};
