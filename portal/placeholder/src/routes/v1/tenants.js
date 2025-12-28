const express = require('express');
const { ensureTenant, findTenantWithSubscription } = require('../../services/tenants');
const { requireAuth } = require('../../middlewares/auth');

const router = express.Router();

router.get('/me', requireAuth, async (req, res) => {
  const tenantId = req.user.tenant_id;
  const email = req.user.email;
  if (!tenantId) {
    return res.status(400).json({ error: 'missing_tenant', message: 'Tenant not bound to token.' });
  }
  try {
    await ensureTenant(tenantId, email);
    const tenant = await findTenantWithSubscription(tenantId);
    return res.json({
      tenant: {
        id: tenant.id,
        email: tenant.email,
      },
      subscription: tenant.status
        ? { status: tenant.status, plan: tenant.plan, updated_at: tenant.updated_at }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ error: 'tenant_lookup_failed', detail: error.message });
  }
});

module.exports = router;
