import Head from 'next/head';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CircleDollarSign,
  Cpu,
  Layers3,
  LogOut,
  KeyRound,
  Pause,
  Play,
  RefreshCw,
  Settings,
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

type SettingsState = {
  exchangeConfigured: boolean;
  exchangePasswordConfigured: boolean;
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  telegramAuthorizedUsers: number;
  updatedAt: string | null;
};

type RackProfile = { id: string; label: string; strategy: string; timeframe: string };

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

function compactDate(iso: string | null | undefined) {
  if (!iso) return 'Jamais';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    exchangeKey: '', exchangeSecret: '', exchangePassword: '', exchangeUid: '',
    telegramEnabled: false, telegramToken: '', telegramChatId: '', telegramAuthorizedUsers: '',
    confirmPassword: '',
  });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [profiles, setProfiles] = useState<RackProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [activatePassword, setActivatePassword] = useState('');
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateMessage, setActivateMessage] = useState('');
  const [activateError, setActivateError] = useState('');

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
      const { payload: state } = await fetchJson('/api/bot/control');
      setBot({ ...EMPTY_STATE, ...state, activeTrades: state.activeTrades || [], unavailableEndpoints: state.unavailableEndpoints || [] });
    } catch (error) {
      if ((error as Error).message !== 'Session expirée') {
        setBot((current) => ({ ...current, dataMode: 'unavailable', degraded: true, message: 'Console momentanément indisponible' }));
      }
    } finally {
      setLoading(false);
    }
  }, [fetchJson]);

  const refreshLogs = useCallback(async () => {
    try {
      const { payload } = await fetchJson('/api/bot/logs');
      setLogs(Array.isArray(payload.messages) ? payload.messages.slice(-50).reverse() : []);
    } catch (error) {
      if ((error as Error).message !== 'Session expirée') setLogs([]);
    }
  }, [fetchJson]);

  const refreshRack = useCallback(async () => {
    try {
      const [{ payload: rackState }, { payload: observationState }, { payload: profilesState }] = await Promise.all([
        fetchJson('/api/rack/status'), fetchJson('/api/observability/summary'), fetchJson('/api/rack/profiles'),
      ]);
      setRack(rackState);
      setObservability(observationState);
      setProfiles(Array.isArray(profilesState.profiles) ? profilesState.profiles : []);
    } catch (error) {
      if ((error as Error).message !== 'Session expirée') {
        setRack({ status: 'unavailable' });
        setObservability({ status: 'unavailable' });
        setProfiles([]);
      }
    }
  }, [fetchJson]);

  const refreshSettings = useCallback(async () => {
    try {
      const { payload } = await fetchJson('/api/settings');
      setSettings(payload);
      setSettingsForm((current) => ({ ...current, telegramEnabled: Boolean(payload.telegramEnabled) }));
    } catch (error) {
      if ((error as Error).message !== 'Session expirée') setSettings(null);
    }
  }, [fetchJson]);

  useEffect(() => {
    fetch('/api/auth').then((response) => response.json()).then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    refreshBot();
    refreshLogs();
    refreshRack();
    refreshSettings();
    const botTimer = window.setInterval(refreshBot, 15_000);
    const logTimer = window.setInterval(refreshLogs, 30_000);
    const rackTimer = window.setInterval(refreshRack, 60_000);
    return () => { window.clearInterval(botTimer); window.clearInterval(logTimer); window.clearInterval(rackTimer); };
  }, [authenticated, refreshBot, refreshLogs, refreshRack, refreshSettings]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSettingsBusy(true); setSettingsError(''); setSettingsMessage('');
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settingsForm, confirmation: 'APPLIQUER' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Réglages refusés');
      setSettings(payload);
      setSettingsMessage('Réglages enregistrés et rechargés.');
      setSettingsForm((current) => ({
        ...current, exchangeKey: '', exchangeSecret: '', exchangePassword: '', exchangeUid: '',
        telegramToken: '', telegramChatId: '', telegramAuthorizedUsers: '', confirmPassword: '',
      }));
      await refreshBot();
    } catch (error) { setSettingsError((error as Error).message); }
    finally { setSettingsBusy(false); }
  }

  async function control(action: 'start' | 'stopbuy' | 'reload') {
    setSettingsBusy(true); setSettingsError(''); setSettingsMessage('');
    try {
      const response = await fetch('/api/bot/control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, confirmPassword: settingsForm.confirmPassword, confirmation: 'CONFIRMER' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Commande refusée');
      setSettingsMessage('Commande transmise.');
      window.setTimeout(refreshBot, 1200);
    } catch (error) { setSettingsError((error as Error).message); }
    finally { setSettingsBusy(false); }
  }

  async function activateProfile(event: FormEvent) {
    event.preventDefault();
    setActivateBusy(true); setActivateError(''); setActivateMessage('');
    try {
      const response = await fetch('/api/rack/activate', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedProfile, confirmPassword: activatePassword, confirmation: 'ACTIVER' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Activation refusée');
      setRack(payload);
      setActivateMessage('Profil activé en dry-run.');
      setActivatePassword('');
    } catch (error) { setActivateError((error as Error).message); }
    finally { setActivateBusy(false); }
  }

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
    if (bot.dryRun === false) return { level: 'danger', title: 'Mode réel actif', text: 'Vérifiez le compte et les positions avant toute commande.' };
    if (bot.dataMode === 'unavailable') return { level: 'danger', title: 'Noyau indisponible', text: bot.message || 'Aucune donnée exploitable.' };
    if (bot.stale) return { level: 'warning', title: 'Données anciennes', text: bot.message || 'Le dernier état sain est affiché.' };
    if (bot.degraded) return { level: 'warning', title: 'Service dégradé', text: `Endpoints indisponibles : ${bot.unavailableEndpoints.join(', ') || 'non précisé'}.` };
    if ((observability.statusCounts?.critical || 0) > 0) return { level: 'warning', title: 'Incidents observés', text: `${observability.statusCounts?.critical} relevé(s) critique(s) dans la fenêtre de surveillance.` };
    return null;
  }, [bot, observability]);

  if (authenticated === null) return <main className="boot"><Activity className="spin" size={24} /></main>;

  if (!authenticated) {
    return (
      <main className="login-shell login-shell--simple">
        <Head><title>Accès</title><meta name="description" content="Espace privé" /></Head>
        <div className="login-grid" aria-hidden="true" />
        <section className="login-card">
          <header><div><span className="brand-mark"><Activity size={20} /></span><h2>Accès</h2></div><span className="access-light" aria-label="Accès protégé" /></header>
          <form onSubmit={login}>
            <label>Identifiant<input autoFocus autoComplete="username" value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} /></label>
            <label>Mot de passe<input type="password" autoComplete="current-password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} /></label>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <button className="button button--primary" disabled={authBusy}>{authBusy ? 'Ouverture…' : 'Entrer'}</button>
          </form>
          <p className="login-foot"><ShieldCheck size={14} /> Accès privé</p>
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
          <button className={`icon-button ${settingsOpen ? 'icon-button--active' : ''}`} onClick={() => setSettingsOpen((open) => !open)} aria-label="Réglages" aria-pressed={settingsOpen}><Settings size={17} /></button>
          <button className="icon-button" onClick={logout} aria-label="Déconnexion"><LogOut size={17} /></button>
        </div>
      </header>

      <div className="content">
        {settingsOpen ? (
          <>
            <section className="page-heading"><div><p className="eyebrow">Coffre serveur</p><h1>Réglages</h1></div><button className="text-button" onClick={() => setSettingsOpen(false)}>Retour</button></section>
            <section className="settings-summary" aria-label="État des réglages">
              <div><span>Exchange</span><strong className={settings?.exchangeConfigured ? 'positive' : ''}>{settings?.exchangeConfigured ? 'Prêt' : 'À configurer'}</strong></div>
              <div><span>Telegram</span><strong className={settings?.telegramEnabled ? 'positive' : ''}>{settings?.telegramEnabled ? 'Actif' : settings?.telegramConfigured ? 'Prêt' : 'À configurer'}</strong></div>
              <div><span>Dernière écriture</span><strong>{compactDate(settings?.updatedAt)}</strong></div>
            </section>
            <form className="settings-grid" onSubmit={saveSettings}>
              <section className="panel settings-card">
                <div className="panel__head"><div><p className="eyebrow">Marché actif : {bot.exchange}</p><h2>Exchange</h2></div><KeyRound size={19} /></div>
                <p className="status-line"><i className={settings?.exchangeConfigured ? 'ok' : ''} />{settings?.exchangeConfigured ? 'Clés configurées' : 'Clés absentes'}</p>
                <label>Clé API<input type="password" autoComplete="off" placeholder={settings?.exchangeConfigured ? 'Laisser vide pour conserver' : 'Clé API'} value={settingsForm.exchangeKey} onChange={(event) => setSettingsForm({ ...settingsForm, exchangeKey: event.target.value })} /></label>
                <label>Secret API<input type="password" autoComplete="off" placeholder={settings?.exchangeConfigured ? 'Laisser vide pour conserver' : 'Secret API'} value={settingsForm.exchangeSecret} onChange={(event) => setSettingsForm({ ...settingsForm, exchangeSecret: event.target.value })} /></label>
                <label>Passphrase <small>Seulement si l’exchange l’exige</small><input type="password" autoComplete="off" placeholder={settings?.exchangePasswordConfigured ? 'Déjà configurée' : 'Optionnelle'} value={settingsForm.exchangePassword} onChange={(event) => setSettingsForm({ ...settingsForm, exchangePassword: event.target.value })} /></label>
                <label>UID <small>Seulement si l’exchange l’exige</small><input autoComplete="off" placeholder="Optionnel" value={settingsForm.exchangeUid} onChange={(event) => setSettingsForm({ ...settingsForm, exchangeUid: event.target.value })} /></label>
                <p className="form-note">Créer une clé limitée au trading, sans retrait. Le marché reste celui du profil actif.</p>
              </section>

              <section className="panel settings-card">
                <div className="panel__head"><div><p className="eyebrow">Notifications</p><h2>Telegram</h2></div><Activity size={19} /></div>
                <label className="switch-row"><span>Activer Telegram</span><input type="checkbox" checked={settingsForm.telegramEnabled} onChange={(event) => setSettingsForm({ ...settingsForm, telegramEnabled: event.target.checked })} /></label>
                <p className="status-line"><i className={settings?.telegramConfigured ? 'ok' : ''} />{settings?.telegramConfigured ? `Configuré · ${settings.telegramAuthorizedUsers} utilisateur(s)` : 'Non configuré'}</p>
                <label>Jeton du bot<input type="password" autoComplete="off" placeholder={settings?.telegramConfigured ? 'Laisser vide pour conserver' : '123456:ABC…'} value={settingsForm.telegramToken} onChange={(event) => setSettingsForm({ ...settingsForm, telegramToken: event.target.value })} /></label>
                <label>Chat ID<input inputMode="numeric" placeholder="Identifiant numérique" value={settingsForm.telegramChatId} onChange={(event) => setSettingsForm({ ...settingsForm, telegramChatId: event.target.value })} /></label>
                <label>Utilisateurs autorisés<input placeholder="12345, 67890" value={settingsForm.telegramAuthorizedUsers} onChange={(event) => setSettingsForm({ ...settingsForm, telegramAuthorizedUsers: event.target.value })} /></label>
              </section>

              <section className="panel settings-card settings-card--wide">
                <div className="panel__head"><div><p className="eyebrow">Confirmation</p><h2>Appliquer</h2></div><ShieldCheck size={19} /></div>
                <div className="confirmation-row"><label>Mot de passe actuel<input type="password" autoComplete="current-password" value={settingsForm.confirmPassword} onChange={(event) => setSettingsForm({ ...settingsForm, confirmPassword: event.target.value })} /></label><button className="button button--primary" disabled={settingsBusy || !settingsForm.confirmPassword}>{settingsBusy ? 'Application…' : 'Enregistrer'}</button></div>
                {settingsError && <p className="form-error" role="alert">{settingsError}</p>}
                {settingsMessage && <p className="form-success" role="status">{settingsMessage}</p>}
                <div className="control-row"><button type="button" className="button button--secondary" disabled={settingsBusy || !settingsForm.confirmPassword} onClick={() => control('start')}><Play size={15} /> Démarrer</button><button type="button" className="button button--secondary" disabled={settingsBusy || !settingsForm.confirmPassword} onClick={() => control('stopbuy')}><Pause size={15} /> Bloquer les entrées</button><button type="button" className="button button--secondary" disabled={settingsBusy || !settingsForm.confirmPassword} onClick={() => control('reload')}><RefreshCw size={15} /> Recharger</button></div>
                <p className="form-note">Une sauvegarde est faite avant écriture. Si le moteur refuse la configuration, l’ancienne version est restaurée.</p>
              </section>
            </form>
          </>
        ) : (
        <>
        {alert && <section className={`alert alert--${alert.level}`} role="alert"><strong>{alert.title}</strong><span>{alert.text}</span></section>}

        <section className="page-heading">
          <div><p className="eyebrow">Supervision</p><h1>Vue d’ensemble</h1></div>
          <span className="freshness"><i className={bot.dataMode === 'live' ? 'ok' : ''} />Mis à jour {freshness(bot.lastUpdated)}</span>
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
            <form className="rack-activate" onSubmit={activateProfile}>
              <label>Profil à activer
                <select value={selectedProfile} onChange={(event) => setSelectedProfile(event.target.value)} disabled={!profiles.length}>
                  <option value="">{profiles.length ? 'Choisir…' : 'Aucun profil disponible'}</option>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.timeframe}</option>)}
                </select>
              </label>
              <label>Mot de passe
                <input type="password" autoComplete="current-password" value={activatePassword} onChange={(event) => setActivatePassword(event.target.value)} />
              </label>
              <button className="button button--secondary" disabled={activateBusy || !selectedProfile || !activatePassword}>
                {activateBusy ? 'Activation…' : 'Activer (dry-run)'}
              </button>
              {activateError && <p className="form-error" role="alert">{activateError}</p>}
              {activateMessage && <p className="form-success" role="status">{activateMessage}</p>}
            </form>
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

        <footer><span>Espace personnel</span><span>{rack.status === 'configured' ? `Rack ${rack.profile_id}` : 'Rack non initialisé'}</span></footer>
        </>
        )}
      </div>
    </main>
  );
}
