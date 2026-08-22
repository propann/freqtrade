import type { NextApiRequest, NextApiResponse } from 'next';
import { isAuthorizedRequest } from '../auth';
import { freqtradeGet, publicFreqtradeError } from '../../../lib/freqtrade-client';
import { sanitizeLogLine } from '../../../lib/log-sanitizer';

let cache: { expiresAt: number; messages: string[] } | null = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthorizedRequest(req)) {
    return res.status(401).json({ success: false, message: 'Authentification requise' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (cache && cache.expiresAt > Date.now()) {
      return res.status(200).json({ success: true, dataMode: 'live', messages: cache.messages });
    }
    const payload = await freqtradeGet<{ logs?: unknown[][] }>('/logs?limit=100');
    const messages = Array.isArray(payload.logs)
      ? payload.logs.slice(-100).filter(Array.isArray).map((entry) => sanitizeLogLine(entry.join(' | ')))
      : [];
    cache = { expiresAt: Date.now() + 10_000, messages };
    return res.status(200).json({ success: true, dataMode: 'live', messages });
  } catch (error) {
    return res.status(503).json({ success: false, dataMode: 'unavailable', ...publicFreqtradeError(error), messages: [] });
  }
}
