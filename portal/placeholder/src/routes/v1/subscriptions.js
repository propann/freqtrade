const express = require('express');
const { ensureSubscription, ensureTenant } = require('../../services/tenants');
const { requireAuth } = require('../../middlewares/auth');

const router = express.Router();

router.get('/me', requireAuth, async (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: 'missing_tenant', message: 'Tenant not bound to token.' });
  }
  try {
    await ensureTenant(tenantId, req.user.email);
    const subscription = await ensureSubscription(tenantId);
    return res.json({ subscription });
  } catch (error) {
    return res.status(500).json({ error: 'subscription_lookup_failed', detail: error.message });
  }
});

module.exports = router;
