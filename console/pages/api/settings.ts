import type { NextApiRequest, NextApiResponse } from 'next';

import { FreqtradeApiError, freqtradePost, publicFreqtradeError } from '../../lib/freqtrade-client';
import { sameOriginRequest } from '../../lib/request-guard';
import {
  applyRuntimeSecretsUpdate,
  readRuntimeSecrets,
  type RuntimeSecrets,
  runtimeSecretsStatus,
  writeRuntimeSecrets,
} from '../../lib/runtime-secrets';
import { isAuthorizedRequest, verifyOwnerPassword } from './auth';

export const config = { api: { bodyParser: { sizeLimit: '12kb' } } };
let mutationInProgress = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!isAuthorizedRequest(req)) return res.status(401).json({ success: false, message: 'Authentification requise' });

  if (req.method === 'GET') {
    try {
      return res.status(200).json({ success: true, ...(await runtimeSecretsStatus()) });
    } catch {
      return res.status(503).json({ success: false, message: 'Coffre serveur indisponible' });
    }
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ success: false, message: 'Méthode refusée' });
  }
  if (!sameOriginRequest(req.headers)) return res.status(403).json({ success: false, message: 'Origine refusée' });
  if (!verifyOwnerPassword(req.body?.confirmPassword)) {
    return res.status(403).json({ success: false, message: 'Mot de passe de confirmation incorrect' });
  }
  if (req.body?.confirmation !== 'APPLIQUER') {
    return res.status(400).json({ success: false, message: 'Confirmation APPLIQUER requise' });
  }
  if (mutationInProgress) return res.status(409).json({ success: false, message: 'Une application est déjà en cours' });

  let previous: RuntimeSecrets | undefined;
  mutationInProgress = true;
  try {
    previous = await readRuntimeSecrets();
    const next = applyRuntimeSecretsUpdate(previous, req.body || {});
    await writeRuntimeSecrets(next);
    await freqtradePost('/reload_config');
    return res.status(200).json({ success: true, ...(await runtimeSecretsStatus()), message: 'Réglages appliqués' });
  } catch (error) {
    if (previous) {
      await writeRuntimeSecrets(previous).catch(() => undefined);
      await freqtradePost('/reload_config').catch(() => undefined);
    }
    const message = error instanceof FreqtradeApiError
      ? publicFreqtradeError(error).message
      : error instanceof Error ? error.message : 'Réglages refusés';
    return res.status(400).json({ success: false, message });
  } finally {
    mutationInProgress = false;
  }
}
