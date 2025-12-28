const jwt = require('jsonwebtoken');

const secret = process.env.PORTAL_JWT_SECRET || 'change-me';
const authCookieName = 'portal_auth';

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = getCookieValue(req.headers.cookie, authCookieName);
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Unauthorized.' });
  }
  try {
    const payload = jwt.verify(token, secret);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'unauthorized', message: 'Unauthorized.' });
  }
}

module.exports = {
  requireAuth,
  authCookieName,
};
