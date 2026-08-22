import type { NextApiRequest, NextApiResponse } from 'next';

import { accessIsReady } from '../../lib/runtime-health';

type HealthResponse = { status: 'ok' | 'unavailable' };

export default function handler(req: NextApiRequest, res: NextApiResponse<HealthResponse>) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  if (!accessIsReady()) return res.status(503).json({ status: 'unavailable' });
  return res.status(200).json({ status: 'ok' });
}
