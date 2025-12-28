let devModeLogged = false;
const { requireEnv } = require('../config/env');

const adminToken = requireEnv('PORTAL_ADMIN_TOKEN');

function adminAuth(req, res, next) {
  if (!adminToken) {
    if (!devModeLogged) {
      // eslint-disable-next-line no-console
      console.warn('[portal] PORTAL_ADMIN_TOKEN not set - admin endpoints are open (dev mode).');
      devModeLogged = true;
    }
    return next();
  }

  const headerToken = req.headers['x-admin-token'] || req.headers['x-portal-admin-token'];
  const bearerToken = (req.headers.authorization || '').replace('Bearer ', '');
  const providedToken = headerToken || bearerToken;

  if (!providedToken || providedToken !== adminToken) {
    return res.status(401).json({ error: 'unauthorized', message: 'Admin token invalid or missing' });
  }

  return next();
}

module.exports = adminAuth;
