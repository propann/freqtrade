import type { NextApiRequest, NextApiResponse } from 'next';

import { isAuthorizedRequest, verifyOwnerPassword } from '../auth';
import { publicRackAgentError, rackAgentActivate } from '../../../lib/rack-agent-client';
import { publicRackState } from '../../../lib/rack-state';
import { sameOriginRequest } from '../../../lib/request-guard';

export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };

const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
let mutationInProgress = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!isAuthorizedRequest(req)) return res.status(401).json({ success: false, message: 'Authentification requise' });
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ success: false, message: 'Méthode refusée' });
  }
  if (!sameOriginRequest(req.headers)) return res.status(403).json({ success: false, message: 'Origine refusée' });
  if (!verifyOwnerPassword(req.body?.confirmPassword)) {
    return res.status(403).json({ success: false, message: 'Mot de passe de confirmation incorrect' });
  }
  if (req.body?.confirmation !== 'ACTIVER') {
    return res.status(400).json({ success: false, message: 'Confirmation ACTIVER requise' });
  }

  const profileId = typeof req.body?.profileId === 'string' ? req.body.profileId.trim() : '';
  if (!PROFILE_ID_PATTERN.test(profileId)) {
    return res.status(400).json({ success: false, message: 'Identifiant de profil invalide' });
  }
  if (mutationInProgress) return res.status(409).json({ success: false, message: 'Une activation est déjà en cours' });

  mutationInProgress = true;
  try {
    const state = await rackAgentActivate(profileId);
    return res.status(200).json({ success: true, ...publicRackState(state), message: 'Profil activé (dry-run)' });
  } catch (error) {
    const info = publicRackAgentError(error);
    const status = info.code === 'rejected' ? 409 : info.code === 'not_found' ? 404 : info.code === 'unauthorized' ? 502 : 503;
    return res.status(status).json({ success: false, ...info });
  } finally {
    mutationInProgress = false;
  }
}
