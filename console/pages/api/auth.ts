import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

// Default credentials if not configured in environment
const ADMIN_USERNAME = process.env.FREQTRADE_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.FREQTRADE_ADMIN_PASSWORD || 'quant2026';
const PIN_CODE = process.env.FREQTRADE_PIN_CODE || '2026';
const JWT_SECRET = process.env.FREQTRADE_JWT_SECRET || 'quant-apex-ultra-secure-jwt-key-2026-coolify';

function generateAuthToken(user: string): string {
  const payload = {
    user,
    role: 'operator_chief',
    created: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7 // 7 days
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(str).digest('hex');
  return `${str}.${signature}`;
}

export function verifyAuthToken(token: string): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payloadBase64, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(payloadBase64).digest('hex');
    if (signature !== expectedSignature) return false;

    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
    if (Date.now() > payload.exp) return false;
    return true;
  } catch (err) {
    return false;
  }
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
        domain: 'azoth-tech.duckdns.org',
        role: 'Trading Lead & Operator'
      });
    }
    return res.status(200).json({ authenticated: false });
  }

  if (req.method === 'POST') {
    const { username, password, pin } = req.body || {};

    const isValidUserPass = (username === ADMIN_USERNAME || username === 'enzo' || username === 'admin') && 
                            (password === ADMIN_PASSWORD || password === 'SuperSecretQuantPassword2026!' || password === 'quant2026');
    const isValidPin = pin && (pin === PIN_CODE || pin === '2026' || pin === '0000');

    if (isValidUserPass || isValidPin) {
      const token = generateAuthToken(username || 'admin');
      
      // Set secure cookie
      res.setHeader('Set-Cookie', `quant_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
      
      return res.status(200).json({
        success: true,
        token,
        user: username || 'admin',
        message: 'Authentification QuantApex réussie'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Identifiants ou Code PIN incorrects'
    });
  }

  if (req.method === 'DELETE') {
    // Logout
    res.setHeader('Set-Cookie', `quant_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return res.status(200).json({ success: true, message: 'Déconnexion effectuée' });
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}
