import type { NextApiRequest, NextApiResponse } from 'next';

import { isAuthorizedRequest } from '../auth';
import { publicRackAgentError, rackAgentGet } from '../../../lib/rack-agent-client';

type ProfileSummary = { id: string; label: string; strategy: string; timeframe: string };

function sanitized(value: unknown): ProfileSummary[] {
  const list = value && typeof value === 'object' && Array.isArray((value as { profiles?: unknown }).profiles)
    ? (value as { profiles: unknown[] }).profiles
    : [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id.slice(0, 64) : '',
      label: typeof item.label === 'string' ? item.label.slice(0, 120) : '',
      strategy: typeof item.strategy === 'string' ? item.strategy.slice(0, 120) : '',
      timeframe: typeof item.timeframe === 'string' ? item.timeframe.slice(0, 20) : '',
    }))
    .filter((item) => item.id)
    .slice(0, 50);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!isAuthorizedRequest(req)) return res.status(401).json({ success: false, message: 'Authentification requise' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, message: 'Méthode refusée' });
  }

  try {
    const payload = await rackAgentGet('/profiles');
    return res.status(200).json({ success: true, profiles: sanitized(payload) });
  } catch (error) {
    return res.status(503).json({ success: false, profiles: [], ...publicRackAgentError(error) });
  }
}
