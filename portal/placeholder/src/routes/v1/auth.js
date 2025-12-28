const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireEnv } = require('../../config/env');
const { ensureTenant } = require('../../services/tenants');
const { requireAuth, authCookieName } = require('../../middlewares/auth');

const router = express.Router();

const adminEmail = requireEnv('ADMIN_EMAIL');
const adminPasswordHash = requireEnv('ADMIN_PASSWORD_HASH');
const adminTenantId = requireEnv('ADMIN_TENANT_ID');
const jwtSecret = requireEnv('PORTAL_JWT_SECRET');
const jwtTtl = requireEnv('PORTAL_JWT_TTL');

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'invalid_credentials', message: 'Invalid credentials.' });
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

  res.cookie(authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return res.json({
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

router.post('/logout', (_req, res) => {
  res.clearCookie(authCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ status: 'ok' });
});

module.exports = router;
