import Head from 'next/head';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CircleDollarSign,
  Cpu,
  Layers3,
  LogOut,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';

type Trade = {
  id: number;
  pair: string;
  entryPrice: number;
  currentPrice: number;
  stake: number;
  profit: number;
  profitPct: number;
  duration: string;
};

type BotState = {
  dataMode: 'live' | 'unavailable';
  status: 'running' | 'stopped' | 'reloading' | 'unavailable';
  version: string;
  strategy: string;
  timeframe: string;
  exchange: string;
  tradingMode: string;
  dryRun: boolean | null;
  walletBalance: number;
  profitTotal: number;
  profitPct: number;
  dailyProfit: number;
  dailyProfitPct: number;
  openTradesCount: number;
  maxTrades: number;
  stakeCurrency: string;
  activeTrades: Trade[];
  system: { cpuAveragePct: number; cpuCount: number; ramPct: number } | null;
  degraded: boolean;
  stale: boolean;
  unavailableEndpoints: string[];
  lastUpdated: string;
  message?: string;
};

type RackState = {
  status: 'configured' | 'not_configured' | 'unavailable';
  profile_id?: string;
  label?: string;
  strategy?: string;
  timeframe?: string;
  pair_limit?: number;
  budget?: { cpu?: number; memory_mb?: number; max_parallel_jobs?: number };
  indicators?: string[];
  protections?: string[];
  tools?: Record<string, 'on' | 'job' | 'warm' | 'off'>;
  config_applied?: boolean;
};

type ObservabilityState = {
  status: 'configured' | 'not_configured' | 'unavailable';
  windowHours?: number;
  generatedAt?: string | null;
  samples?: number;
  statusCounts?: { healthy: number; degraded: number; critical: number };
  cpuAveragePct?: { average: number | null; max: number | null };
  ramPct?: { average: number | null; max: number | null };
  freshnessAgeSeconds?: { average: number | null; max: number | null };
  restartCountLowerBound?: number | null;
  exchangeErrors?: { maxInLogWindow: number; samplesWithErrors: number; maxConsecutiveAlertSamples: number };
};

const EMPTY_STATE: BotState = {
  dataMode: 'unavailable', status: 'unavailable', version: '—', strategy: '—', timeframe: '—',
  exchange: '—', tradingMode: '—', dryRun: null, walletBalance: 0, profitTotal: 0, profitPct: 0,
  dailyProfit: 0, dailyProfitPct: 0, openTradesCount: 0, maxTrades: 0, stakeCurrency: 'USDT',
  activeTrades: [], system: null, degraded: false, stale: false, unavailableEndpoints: [], lastUpdated: '',
};

const TOOL_LABELS: Record<string, string> = {
  telegram: 'Alertes',
  backtest: 'Backtests',
  lookahead_analysis: 'Anti-biais',
  recursive_analysis: 'Stabilité',
  hyperopt: 'Optimisation',
  freqai: 'Intelligence',
};

const TOOL_STATES = {
  on: 'Actif',
  job: 'À la demande',
  warm: 'Prêt',
  off: 'Arrêté',
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 })
    .format(Number.isFinite(value) ? value : 0);
}

function percent(value: number) {
  return `${value > 0 ? '+' : ''}${(Number.isFinite(value) ? value : 0).toFixed(2)} %`;
}

function freshness(iso: string) {
  if (!iso) return 'Jamais synchronisé';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'À l’instant';
  if (seconds < 60) return `Il y a ${seconds} s`;
  return `Il y a ${Math.floor(seconds / 60)} min`;
}

function Metric({ label, value, detail, tone = 'neutral', icon }: {
  label: string; value: string; detail: string; tone?: 'neutral' | 'positive' | 'negative'; icon: ReactNode;
}) {
  return (
    <article className="metric">
      <div className="metric__top"><span>{label}</span>{icon}</div>
      <strong className={`metric__value metric__value--${tone}`}>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [bot, setBot] = useState<BotState>(EMPTY_STATE);
  const [rack, setRack] = useState<RackState>({ status: 'not_configured' });
  const [observability, setObservability] = useState<ObservabilityState>({ status: 'not_configured' });
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const logout = useCallback(async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    setAuthenticated(false);
    setBot(EMPTY_STATE);
    setRack({ status: 'not_configured' });
    setObservability({ status: 'not_configured' });
    setLogs([]);
  }, []);

  const fetchJson = useCallback(async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.status === 401) {
      await logout();
      throw new Error('Session expirée');
    }
    const payload = await response.json();
    return { response, payload };
  }, [logout]);

  const refreshBot = useCallback(async () => {
    setLoading(true);
    try {
      const [{ payload: state }, { payload: logState }] = await Promise.all([
        fetchJson('/api/bot/control'), fetchJson('/api/bot/logs'),
      ]);
      setBot({ ...EMPTY_STATE, ...state, activeTrades: state.activeTrades || [], unavailableEndpoints: state.unavailableEndpoints || [] });
      setLogs(Array.isArray(logState.messages) ? logState.messages.slice(-50).reverse() : []);
    } catch (error) {
      if ((error as Error).message !== 'Session expirée') {
        setBot((current) => ({ ...current, dataMode: 'unavailable', degraded: true, message: 'Console momentanément indisponible' }));
      }
    } finally {
      setLoading(false);
    }
  }, [fetchJson]);

  const refreshRack = useCallback(async () => {
    try {
      const [{ payload: rackState }, { payload: observationState }] = await Promise.all([
        fetchJson('/api/rack/status'), fetchJson('/api/observability/summary'),
      ]);
      setRack(rackState);
      setObservability(observationState);
    } catch (error) {
      if ((error as Error).message !== 'Session expirée') {
        setRack({ status: 'unavailable' });
        setObservability({ status: 'unavailable' });
      }
    }
  }, [fetchJson]);

  useEffect(() => {
    fetch('/api/auth').then((response) => response.json()).then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    refreshBot();
    refreshRack();
    const botTimer = window.setInterval(refreshBot, 10_000);
    const rackTimer = window.setInterval(refreshRack, 30_000);
    return () => { window.clearInterval(botTimer); window.clearInterval(rackTimer); };
  }, [authenticated, refreshBot, refreshRack]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Connexion refusée');
      setAuthenticated(true);
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }

  const alert = useMemo(() => {
    if (bot.dryRun === false) return { level: 'danger', title: 'Mode réel actif', text: 'Cette console est en lecture seule. Vérifiez le compte et les positions avant toute intervention.' };
    if (bot.dataMode === 'unavailable') return { level: 'danger', title: 'Noyau indisponible', text: bot.message || 'Aucune donnée exploitable.' };
    if (bot.stale) return { level: 'warning', title: 'Données anciennes', text: bot.message || 'Le dernier état sain est affiché.' };
    if (bot.degraded) return { level: 'warning', title: 'Service dégradé', text: `Endpoints indisponibles : ${bot.unavailableEndpoints.join(', ') || 'non précisé'}.` };
    if ((observability.statusCounts?.critical || 0) > 0) return { level: 'warning', title: 'Incidents observés', text: `${observability.statusCounts?.critical} relevé(s) critique(s) dans la fenêtre de surveillance.` };
    return null;
  }, [bot, observability]);

  if (authenticated === null) return <main className="boot"><Activity className="spin" size={24} /><span>Ouverture de Quant Core…</span></main>;

  if (!authenticated) {
    return (
      <main className="login-shell">
        <Head><title>Quant Core</title><meta name="description" content="Espace privé" /></Head>
        <div className="login-grid" aria-hidden="true" />
        <section className="login-intro">
          <div className="login-brand"><span className="brand-mark"><Activity size={21} /></span><strong>QUANT CORE</strong></div>
          <div>
            <p className="eyebrow">Espace personnel</p>
            <h1>Le calme avant<br />le mouvement.</h1>
            <p>Un espace privé, précis et silencieux. Rien de plus à montrer avant d’entrer.</p>
          </div>
          <div className="login-signature"><span /><span /><span /></div>
        </section>
        <section className="login-card">
          <header><div><p className="eyebrow">Accès unique</p><h2>Bienvenue.</h2></div><span className="access-light" aria-label="Accès protégé" /></header>
          <p className="muted">Retrouvez votre espace exactement là où vous l’avez laissé.</p>
          <form onSubmit={login}>
            <label>Identifiant<input autoFocus autoComplete="username" value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} /></label>
            <label>Mot de passe<input type="password" autoComplete="current-password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} /></label>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <button className="button button--primary" disabled={authBusy}>{authBusy ? 'Ouverture…' : 'Ouvrir mon espace'}</button>
          </form>
          <p className="login-foot"><ShieldCheck size={14} /> Accès privé · session protégée</p>
        </section>
      </main>
    );
  }

  const currency = bot.stakeCurrency === '—' ? 'USD' : bot.stakeCurrency;
  const totalTone = bot.profitTotal > 0 ? 'positive' : bot.profitTotal < 0 ? 'negative' : 'neutral';
  const dailyTone = bot.dailyProfit > 0 ? 'positive' : bot.dailyProfit < 0 ? 'negative' : 'neutral';

  return (
    <main className="app-shell">
      <Head><title>Quant Core</title><meta name="description" content="Espace de pilotage privé" /></Head>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Activity size={18} /></span><div><strong>Quant Core</strong><small>Control room</small></div></div>
        <div className="topbar__actions">
          <span className={`engine engine--${bot.status}`}><i />{bot.status === 'running' ? 'Actif' : bot.status}</span>
          <span className={`mode mode--${bot.dryRun === false ? 'live' : 'dry'}`}>{bot.dryRun === false ? 'RÉEL' : 'SIMULATION'}</span>
          <button className="icon-button" onClick={refreshBot} disabled={loading} aria-label="Actualiser"><RefreshCw className={loading ? 'spin' : ''} size={17} /></button>
          <button className="icon-button" onClick={logout} aria-label="Déconnexion"><LogOut size={17} /></button>
        </div>
      </header>

      <div className="content">
        {alert && <section className={`alert alert--${alert.level}`} role="alert"><strong>{alert.title}</strong><span>{alert.text}</span></section>}

        <section className="page-heading">
          <div><p className="eyebrow">Supervision en lecture seule</p><h1>Vue d’ensemble</h1></div>
          <span className="freshness">Mis à jour {freshness(bot.lastUpdated)}</span>
        </section>

        <section className="metrics-grid" aria-label="Indicateurs clés">
          <Metric label="Capital suivi" value={money(bot.walletBalance, currency)} detail={`${bot.exchange} · ${currency}`} icon={<CircleDollarSign size={18} />} />
          <Metric label="Positions ouvertes" value={`${bot.openTradesCount}`} detail={`Limite ${bot.maxTrades < 0 ? 'illimitée' : bot.maxTrades}`} icon={<Activity size={18} />} />
          <Metric label="P&L total" value={money(bot.profitTotal, currency)} detail={percent(bot.profitPct)} tone={totalTone} icon={<Layers3 size={18} />} />
          <Metric label="P&L du jour" value={money(bot.dailyProfit, currency)} detail={percent(bot.dailyProfitPct)} tone={dailyTone} icon={<Activity size={18} />} />
        </section>

        <section className="panel panel--wide">
          <div className="panel__head"><div><p className="eyebrow">Exposition</p><h2>Positions</h2></div><span className="count">{bot.activeTrades.length}</span></div>
          {bot.activeTrades.length ? (
            <div className="table-wrap"><table><thead><tr><th>Paire</th><th>Entrée</th><th>Actuel</th><th>Mise</th><th>P&L</th><th>Durée</th></tr></thead><tbody>
              {bot.activeTrades.map((trade) => <tr key={trade.id}><td><strong>{trade.pair}</strong></td><td>{trade.entryPrice.toLocaleString('fr-FR')}</td><td>{trade.currentPrice.toLocaleString('fr-FR')}</td><td>{money(trade.stake, currency)}</td><td className={trade.profit >= 0 ? 'positive' : 'negative'}>{money(trade.profit, currency)} <small>{percent(trade.profitPct)}</small></td><td>{trade.duration}</td></tr>)}
            </tbody></table></div>
          ) : <div className="empty"><ShieldCheck size={22} /><strong>Aucune position ouverte</strong><span>Aucune exposition active.</span></div>}
        </section>

        <div className="two-columns">
          <section className="panel">
            <div className="panel__head"><div><p className="eyebrow">Configuration active</p><h2>Rack</h2></div><Layers3 size={19} /></div>
            <dl className="facts"><div><dt>Profil</dt><dd>{rack.profile_id || 'Non configuré'}</dd></div><div><dt>Stratégie</dt><dd>{rack.strategy || bot.strategy}</dd></div><div><dt>Timeframe</dt><dd>{rack.timeframe || bot.timeframe}</dd></div><div><dt>Paires max.</dt><dd>{rack.pair_limit ?? bot.maxTrades}</dd></div><div><dt>Budget</dt><dd>{rack.budget ? `${rack.budget.cpu ?? '—'} CPU · ${rack.budget.memory_mb ?? '—'} Mio` : '—'}</dd></div><div><dt>Config appliquée</dt><dd>{rack.config_applied ? 'Oui' : 'Non / inconnue'}</dd></div></dl>
            <div className="tag-list">{rack.indicators?.length ? rack.indicators.map((item) => <span key={item}>{item}</span>) : <span>Aucun registre chargé</span>}</div>
          </section>

          <section className="panel">
            <div className="panel__head"><div><p className="eyebrow">Petit VPS</p><h2>Système</h2></div><Cpu size={19} /></div>
            <div className="gauges"><div><span>CPU moyen</span><strong>{bot.system ? `${bot.system.cpuAveragePct.toFixed(1)} %` : '—'}</strong><progress max="100" value={bot.system?.cpuAveragePct || 0} /></div><div><span>RAM</span><strong>{bot.system ? `${bot.system.ramPct.toFixed(1)} %` : '—'}</strong><progress max="100" value={bot.system?.ramPct || 0} /></div></div>
            <dl className="facts facts--compact"><div><dt>Noyau</dt><dd>{bot.version}</dd></div><div><dt>Marché</dt><dd>{bot.exchange}</dd></div><div><dt>Mode</dt><dd>{bot.tradingMode}</dd></div><div><dt>Cœurs</dt><dd>{bot.system?.cpuCount ?? '—'}</dd></div></dl>
            <div className="observation">
              <div className="observation__head"><strong>Observation 7 jours</strong><span className={`observation__status observation__status--${observability.status}`}>{observability.status === 'configured' ? `${observability.samples ?? 0} relevés` : 'En attente'}</span></div>
              {observability.status === 'configured' ? <>
                <div className="observation__grid"><div><span>CPU max.</span><strong>{observability.cpuAveragePct?.max != null ? `${observability.cpuAveragePct.max.toFixed(1)} %` : '—'}</strong></div><div><span>RAM max.</span><strong>{observability.ramPct?.max != null ? `${observability.ramPct.max.toFixed(1)} %` : '—'}</strong></div><div><span>Critiques</span><strong>{observability.statusCounts?.critical ?? 0}</strong></div><div><span>Erreurs marché</span><strong>{observability.exchangeErrors?.maxInLogWindow ?? 0}</strong></div></div>
                <small>{observability.restartCountLowerBound ?? 0} redémarrage(s) minimum · fraîcheur max. {observability.freshnessAgeSeconds?.max != null ? `${Math.round(observability.freshnessAgeSeconds.max)} s` : '—'} · généré {freshness(observability.generatedAt || '')}</small>
              </> : <p>L’historique apparaîtra après le premier passage de <code>rack-observer</code>.</p>}
            </div>
          </section>
        </div>

        <div className="two-columns two-columns--lower">
          <section className="panel">
            <div className="panel__head"><div><p className="eyebrow">Derniers événements</p><h2>Journal système</h2></div><TerminalSquare size={19} /></div>
            <div className="log-view">{logs.length ? logs.map((line, index) => <div key={`${index}-${line.slice(0, 20)}`}>{line}</div>) : <div className="log-empty">Aucun journal disponible.</div>}</div>
          </section>
          <section className="panel tool-rack">
            <div className="panel__head"><div><p className="eyebrow">Charge maîtrisée</p><h2>Outils du rack</h2></div><Layers3 size={19} /></div>
            <div className="tool-rack__list">
              {rack.tools && Object.keys(rack.tools).length ? Object.entries(rack.tools).map(([name, state]) => (
                <div key={name}><span className={`tool-light tool-light--${state}`} /><strong>{TOOL_LABELS[name] || name}</strong><small>{TOOL_STATES[state]}</small></div>
              )) : <p className="muted">Le rack apparaîtra après son initialisation.</p>}
            </div>
            {rack.protections?.length ? <p className="tool-rack__foot">{rack.protections.length} protections chargées avec le profil actif.</p> : null}
          </section>
        </div>

        <footer><span>Espace personnel · lecture seule</span><span>{rack.status === 'configured' ? `Rack ${rack.profile_id}` : 'Rack non initialisé'}</span></footer>
      </div>
    </main>
  );
}
