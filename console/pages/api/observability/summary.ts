import type { NextApiRequest, NextApiResponse } from 'next';
import { readFile } from 'fs/promises';

import { publicObservabilitySummary } from '../../../lib/observability';
import { isAuthorizedRequest } from '../auth';

const summaryPath = process.env.QUANT_OBSERVABILITY_SUMMARY_PATH
  || '/app/user_data/observability/summary-168h.json';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthorizedRequest(req)) {
    return res.status(401).json({ success: false, message: 'Authentification requise' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, message: 'Console en lecture seule' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const payload = JSON.parse(await readFile(summaryPath, 'utf-8'));
    return res.status(200).json({ success: true, ...publicObservabilitySummary(payload) });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return res.status(200).json({ success: true, status: 'not_configured' });
    }
    return res.status(503).json({ success: false, status: 'unavailable', message: 'Résumé d’observation illisible' });
  }
}
