import type { NextApiRequest, NextApiResponse } from 'next';
import { isAuthorizedRequest } from '../auth';

const simulatedMessages = [
  '[DEMO] Flux de logs simulé — aucun moteur Freqtrade connecté',
  '[DEMO-STRATEGY] Calcul fictif des bougies 1h & 15m',
  '[INDICATORS] BTC/USDT: 1h_EMA200=95400 (Bullish), 5m_RSI=39.2, ADX=28.4 (Signal d\'entrée fort)',
  '[INDICATORS] ETH/USDT: Momentum MACD haussier (+8.7), Trailing Stop déplacé à 2792.00 USDT',
  '[INDICATORS] SOL/USDT: RSI 62.4, Cible Take-Profit #1 approchée (+3.33% en cours)',
  '[PAIRLIST] VolumePairList: 140 paires scannées sur Binance -> 8 paires sélectionnées par volatilité/liquidité',
  '[RISK-GUARD] Drawdown actuel: 1.4% (Seuil maximal configuré: 15.0%) -> Nominal',
  '[DATABASE] Sauvegarde SQLite: tradesv3.sqlite actualisé sans verrouillage',
  '[FREQ-API] Session JWT vérifiée pour console Coolify, Heartbeat 14ms',
  '[TELEMETRY] FreqUI WebSocket stream émettant métriques SQN=3.42, Calmar=8.9, Sharpe=2.45',
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthorizedRequest(req)) {
    return res.status(401).json({ success: false, message: 'Authentification requise' });
  }

  res.setHeader('X-Quant-Core-Data-Mode', 'simulated');
  if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    res.write('data: [QUANT-CORE-DEMO] Flux SSE simulé initialisé — aucun moteur réel connecté\n\n');

    let idx = 0;
    const interval = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(interval);
        return;
      }
      const time = new Date().toLocaleTimeString('fr-FR');
      const msg = simulatedMessages[idx % simulatedMessages.length];
      res.write(`data: [${time}] ${msg}\n\n`);
      idx++;
    }, 2500);

    req.on('close', () => {
      clearInterval(interval);
      if (!res.writableEnded) {
        res.end();
      }
    });

    return;
  }

  // Regular JSON endpoint
  return res.status(200).json({ success: true, dataMode: 'simulated', messages: simulatedMessages });
}
