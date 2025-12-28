const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ensureTenant } = require('../../services/tenants');
const { requireAuth } = require('../../middlewares/auth');

const router = express.Router();

const adminEmail = process.env.ADMIN_EMAIL;
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
const adminTenantId = process.env.ADMIN_TENANT_ID || 'admin';
const jwtSecret = process.env.PORTAL_JWT_SECRET || 'change-me';
const jwtTtl = process.env.PORTAL_JWT_TTL || '12h';

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'invalid_credentials', message: 'Email and password are required.' });
  }
  if (!adminEmail || !adminPasswordHash) {
    return res.status(500).json({ error: 'admin_not_configured', message: 'ADMIN_EMAIL or ADMIN_PASSWORD_HASH missing.' });
  }
  if (email !== adminEmail) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid credentials.' });
  }
  const matches = await bcrypt.compare(password, adminPasswordHash);
  if (!matches) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid credentials.' });
  }

  await ensureTenant(adminTenantId, adminEmail);

  const token = jwt.sign(
    {
      sub: adminEmail,
      role: 'admin',
      tenant_id: adminTenantId,
      email: adminEmail,
    },
    jwtSecret,
    { expiresIn: jwtTtl }
  );

  return res.json({
    token,
    user: {
      email: adminEmail,
      role: 'admin',
      tenant_id: adminTenantId,
    },
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      email: req.user.email,
      role: req.user.role,
      tenant_id: req.user.tenant_id,
    },
  });
});

router.post('/logout', requireAuth, (_req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
