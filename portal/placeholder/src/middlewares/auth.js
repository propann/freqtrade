const jwt = require('jsonwebtoken');

const secret = process.env.PORTAL_JWT_SECRET || 'change-me';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token.' });
  }
  try {
    const payload = jwt.verify(token, secret);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid token.' });
  }
}

module.exports = {
  requireAuth,
};
