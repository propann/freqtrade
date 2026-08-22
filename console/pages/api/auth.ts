import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

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

function generateAuthToken(user: string): string {
  if (!authIsConfigured()) {
    throw new Error('Personal access is not configured');
  }
  const payload = {
    user,
    created: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7 // 7 days
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(str).digest('hex');
  return `${str}.${signature}`;
}

export function verifyAuthToken(token: string): boolean {
  if (!token || !authIsConfigured()) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payloadBase64, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(payloadBase64).digest('hex');
    if (!safeEqual(signature, expectedSignature)) return false;

    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
    if (Date.now() > payload.exp) return false;
    return true;
  } catch (err) {
    return false;
  }
}

export function isAuthorizedRequest(req: NextApiRequest): boolean {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies.quant_session;
  return Boolean(token && verifyAuthToken(token));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Check session
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies['quant_session'];

    if (token && verifyAuthToken(token)) {
      return res.status(200).json({
        authenticated: true,
        user: ADMIN_USERNAME,
        domain: process.env.FREQTRADE_PUBLIC_DOMAIN || 'localhost'
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

    const { username, password } = req.body || {};

    const isValidUserPass = typeof username === 'string' && typeof password === 'string'
      && safeEqual(username, ADMIN_USERNAME) && safeEqual(password, ADMIN_PASSWORD);
    if (isValidUserPass) {
      const token = generateAuthToken(username);
      
      // Set secure cookie
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `quant_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
      
      return res.status(200).json({
        success: true,
        user: username,
        message: 'Accès ouvert'
      });
    }

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
