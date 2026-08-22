import type { NextApiRequest, NextApiResponse } from 'next';
import { readFile } from 'fs/promises';

import { isAuthorizedRequest } from '../auth';

const statePath = process.env.QUANT_RACK_STATE_PATH || '/app/user_data/rack/state.json';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthorizedRequest(req)) {
    return res.status(401).json({ success: false, message: 'Authentification requise' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  res.setHeader('Cache-Control', 'no-store');
  try {
    const state = JSON.parse(await readFile(statePath, 'utf-8'));
    return res.status(200).json({ success: true, ...state, status: 'configured' });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return res.status(200).json({ success: true, status: 'not_configured' });
    }
    return res.status(503).json({ success: false, status: 'unavailable', message: 'État du rack illisible' });
  }
}
