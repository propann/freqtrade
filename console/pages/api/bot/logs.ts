import type { NextApiRequest, NextApiResponse } from 'next';
import { isAuthorizedRequest } from '../auth';
import { freqtradeGet, publicFreqtradeError } from '../../../lib/freqtrade-client';

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
    const payload = await freqtradeGet<{ logs?: unknown[][] }>('/logs?limit=100');
    const messages = Array.isArray(payload.logs)
      ? payload.logs.map((entry) => entry.map(String).join(' | '))
      : [];
    return res.status(200).json({ success: true, dataMode: 'live', messages });
  } catch (error) {
    return res.status(503).json({ success: false, dataMode: 'unavailable', ...publicFreqtradeError(error), messages: [] });
  }
}
