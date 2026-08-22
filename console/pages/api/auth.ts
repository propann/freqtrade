import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

import { createSessionToken, verifySessionToken } from '../../lib/auth-session';
import { clearLoginFailures, loginAllowance, recordLoginFailure } from '../../lib/login-guard';

const ADMIN_USERNAME = process.env.FREQTRADE_ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.FREQTRADE_ADMIN_PASSWORD || '';
const JWT_SECRET = process.env.FREQTRADE_JWT_SECRET || '';

function authIsConfigured(): boolean {
  return Boolean(ADMIN_USERNAME && ADMIN_PASSWORD && JWT_SECRET.length >= 32);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAuthToken(token: string): boolean {
  return authIsConfigured() && verifySessionToken(token, ADMIN_USERNAME, JWT_SECRET);
}

export function isAuthorizedRequest(req: NextApiRequest): boolean {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies.quant_session;
  return Boolean(token && verifyAuthToken(token));
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '4kb' },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    // Check session
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies['quant_session'];

    if (token && verifyAuthToken(token)) {
      return res.status(200).json({
        authenticated: true,
        user: ADMIN_USERNAME
      });
    }
    return res.status(200).json({ authenticated: false });
  }

  if (req.method === 'POST') {
    if (!authIsConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Accès personnel non configuré côté serveur.'
      });
    }

    const allowance = loginAllowance();
    if (!allowance.allowed) {
      res.setHeader('Retry-After', String(allowance.retryAfterSeconds));
      return res.status(429).json({ success: false, message: 'Trop de tentatives. Réessayez plus tard.' });
    }

    const { username, password } = req.body || {};

    const isValidUserPass = typeof username === 'string' && typeof password === 'string'
      && safeEqual(username, ADMIN_USERNAME) && safeEqual(password, ADMIN_PASSWORD);
    if (isValidUserPass) {
      clearLoginFailures();
      const token = createSessionToken(username, JWT_SECRET);

      // Set secure cookie
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `quant_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);

      return res.status(200).json({
        success: true,
        user: username,
        message: 'Accès ouvert'
      });
    }

    recordLoginFailure();

    return res.status(401).json({
      success: false,
      message: 'Identifiants incorrects'
    });
  }

  if (req.method === 'DELETE') {
    // Logout
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `quant_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
    return res.status(200).json({ success: true, message: 'Déconnexion effectuée' });
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}
