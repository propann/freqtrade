-- Minimal schema placeholder for the portal
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'BASIC',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  paypal_subscription_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
