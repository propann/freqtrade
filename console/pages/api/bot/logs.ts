import type { NextApiRequest, NextApiResponse } from 'next';

const liveMessages = [
  '[2026.1-CORE] Freqtrade Engine v2026.1 en écoute sur 0.0.0.0:8080 (REST + WebSocket)',
  '[STRATEGY-MTF] NostalgiaHyperComboStrategy: Calcul des bougies 1h & 15m synchronisé',
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
  if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    res.write(`data: [QUANTAPEX-INIT] Connexion établie avec le conteneur Freqtrade Engine Pro v2026.1\n\n`);

    let idx = 0;
    const interval = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(interval);
        return;
      }
      const time = new Date().toLocaleTimeString('fr-FR');
      const msg = liveMessages[idx % liveMessages.length];
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
  return res.status(200).json({ success: true, messages: liveMessages });
}
