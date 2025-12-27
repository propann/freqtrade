import Head from 'next/head';

import BotCard, { BotStats } from '../components/BotCard';
import LiveLogStream from '../components/LiveLogStream';
import StatusBadge from '../components/StatusBadge';

const bots: BotStats[] = [
  {
    botId: 'aurora',
    name: 'Aurora Momentum',
    status: 'running',
    profit: 12.4,
    pairCount: 8,
    errorCount: 0,
    updatedAt: 'Il y a 15 sec',
    mode: 'Dry-run',
  },
  {
    botId: 'atlas',
    name: 'Atlas Range',
    status: 'running',
    profit: 4.1,
    pairCount: 5,
    errorCount: 1,
    updatedAt: 'Il y a 32 sec',
    mode: 'Dry-run',
  },
  {
    botId: 'nova',
    name: 'Nova Breakout',
    status: 'stopped',
    profit: -1.2,
    pairCount: 3,
    errorCount: 0,
    updatedAt: 'Il y a 6 min',
    mode: 'Paused',
  },
];

const performance = [
  { pair: 'BTC/USDT', pnl: 6.8, trades: 124, winRate: 58, sparkline: [12, 18, 16, 24, 28, 26, 33] },
  { pair: 'ETH/USDT', pnl: 4.2, trades: 98, winRate: 54, sparkline: [10, 12, 14, 17, 16, 19, 21] },
  { pair: 'SOL/USDT', pnl: -1.1, trades: 76, winRate: 45, sparkline: [18, 15, 12, 10, 11, 9, 8] },
];

const buildSparklinePoints = (values: number[]) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return values
    .map((value, index) => {
      const x = index * 18;
      const y = 40 - ((value - min) / (max - min || 1)) * 32;
      return `${x},${y}`;
    })
    .join(' ');
};

export default function Home() {
  const runningCount = bots.filter((bot) => bot.status === 'running').length;

  return (
    <div className="page">
      <Head>
        <title>Freqtrade SaaS Console</title>
        <meta
          name="description"
          content="Console de pilotage multi-tenant pour Freqtrade (aucune promesse de gains financiers)."
        />
      </Head>
      <main className="container">
        <header className="hero">
          <div>
            <p className="eyebrow">STONE TRADER · Console sécurisée</p>
            <h1>Monitoring &amp; Dashboard</h1>
            <p className="lede">
              Vue temps réel des bots, journaux sécurisés et performances par paire. Les secrets restent côté
              orchestrateur et ne transitent jamais vers le navigateur.
            </p>
          </div>
          <div className="cta-group">
            <button className="btn primary">Voir les bots</button>
            <button className="btn ghost">Ouvrir un ticket</button>
          </div>
        </header>

        <section className="section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>État global des bots</h2>
            </div>
            <div className="badge-row">
              <StatusBadge status="running" label={`${runningCount} running`} />
              <StatusBadge status="stopped" label={`${bots.length - runningCount} arrêtés`} />
            </div>
          </div>
          <div className="metrics-grid">
            <article className="metric-card">
              <p>PNL global (dry-run)</p>
              <h3>+5.7%</h3>
              <span>Dernière synchro · 30s</span>
            </article>
            <article className="metric-card">
              <p>Quotas consommés</p>
              <h3>3 / 5 bots</h3>
              <span>Plan Pro · CPU 68%</span>
            </article>
            <article className="metric-card">
              <p>Alertes risques</p>
              <h3>1 active</h3>
              <span>Drawdown 35% (limite 40%)</span>
            </article>
            <article className="metric-card">
              <p>Audit trail</p>
              <h3>12 événements</h3>
              <span>Dernier: restart via console</span>
            </article>
          </div>
          <div className="bot-grid">
            {bots.map((bot) => (
              <BotCard key={bot.botId} botId={bot.botId} fallback={bot} />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Performance</p>
              <h2>Rentabilité par paire</h2>
            </div>
            <span className="muted">Les valeurs restent indicatives (dry-run).</span>
          </div>
          <div className="table">
            {performance.map((entry) => (
              <div key={entry.pair} className="table-row">
                <div>
                  <strong>{entry.pair}</strong>
                  <p className="muted">{entry.trades} trades · win rate {entry.winRate}%</p>
                </div>
                <div className={`pnl ${entry.pnl >= 0 ? 'positive' : 'negative'}`}>
                  {entry.pnl >= 0 ? '+' : ''}
                  {entry.pnl}%
                </div>
                <svg className="sparkline" viewBox="0 0 110 50" aria-hidden="true">
                  <polyline points={buildSparklinePoints(entry.sparkline)} />
                </svg>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Live Logs</p>
              <h2>Flux en temps réel</h2>
            </div>
            <span className="muted">Streaming activé uniquement lorsque la console est ouverte.</span>
          </div>
          <LiveLogStream tenantId="demo" botId="aurora" />
        </section>
      </main>
    </div>
  );
}
