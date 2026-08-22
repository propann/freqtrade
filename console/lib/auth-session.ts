import crypto from 'crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  user: string;
  created: number;
  exp: number;
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSessionToken(user: string, secret: string, now = Date.now()): string {
  if (!user || secret.length < 32) throw new Error('Personal access is not configured');
  const payload: SessionPayload = { user, created: now, exp: now + SESSION_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySessionToken(
  token: string,
  expectedUser: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token || !expectedUser || secret.length < 32) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [encoded, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    if (!safeEqual(signature, expectedSignature)) return false;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as Partial<SessionPayload>;
    return payload.user === expectedUser
      && Number.isFinite(payload.created)
      && Number.isFinite(payload.exp)
      && payload.created! <= now
      && payload.exp! > now
      && payload.exp! - payload.created! === SESSION_TTL_MS;
  } catch {
    return false;
  }
}
