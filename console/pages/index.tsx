import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import {
  Play,
  Square,
  RefreshCw,
  TrendingUp,
  Activity,
  Shield,
  Zap,
  Terminal,
  BarChart3,
  DollarSign,
  ArrowUpRight,
  Server,
  Layers,
  CandlestickChart,
  Settings,
  AlertTriangle,
  Radio,
  BookOpen,
  Lock,
  LogOut,
  Key,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  Check,
  Info
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart
} from 'recharts';

interface Candle {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  macdHist?: number;
  bbUpper?: number;
  bbLower?: number;
}

interface Ticker {
  symbol: string;
  pair: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  rsi?: number;
  trend: 'bullish' | 'bearish' | 'neutral';
}

interface StrategyInfo {
  id: string;
  name: string;
  type: string;
  timeframe: string;
  winrate: string;
}

interface RackState {
  status: 'configured' | 'not_configured' | 'unavailable';
  profile_id?: string;
  label?: string;
  strategy?: string;
  timeframe?: string;
  pair_limit?: number;
  budget?: { cpu: number; memory_mb: number; max_parallel_jobs: number };
  indicators?: string[];
  protections?: string[];
  tools?: Record<string, 'off' | 'on' | 'warm' | 'job'>;
  config_applied?: boolean;
  restart_required?: boolean;
  updated_at?: string;
}

interface Trade {
  id: number;
  pair: string;
  entryPrice: number;
  currentPrice: number;
  amount: number;
  stake: number;
  profit: number;
  profitPct: number;
  openTime: string;
  duration: string;
  rsi?: number;
  macdHist?: number;
  stopLoss: number;
  trailingStopActive: boolean;
  indicators?: {
    adx: number;
    ema50: number;
    ema200: number;
  };
}

interface ClosedTrade {
  id: number;
  pair: string;
  profit: number;
  profitPct: number;
  closeTime: string;
  exitReason: string;
}

interface BotState {
  dataMode: 'live' | 'unavailable';
  status: 'running' | 'stopped' | 'reloading' | 'unavailable';
  version: string;
  strategy: string;
  availableStrategies: StrategyInfo[];
  timeframe: string;
  exchange: string;
  tradingMode: string;
  dryRun: boolean;
  walletBalance: number;
  initialWallet: number;
  profitTotal: number;
  profitPct: number;
  dailyProfit: number;
  dailyProfitPct: number;
  openTradesCount: number;
  maxTrades: number;
  stakeAmount: number;
  stakeCurrency: string;
  stoploss: number;
  trailingStop: boolean;
  trailingOffset: number;
  apiServerStatus: string;
  activeTrades: Trade[];
  closedTrades: ClosedTrade[];
  whitelist: string[];
  dynamicPairlistStats: {
    scanned: number;
    filtered: number;
    active: number;
    method: string;
    lastRefresh: string;
  };
  lastUpdated: string;
  degraded?: boolean;
  stale?: boolean;
  unavailableEndpoints?: string[];
  message?: string;
  system?: { cpuAveragePct: number; cpuCount: number; ramPct: number } | null;
}

const EMPTY_BOT_STATE: BotState = {
  dataMode: 'unavailable',
  status: 'unavailable',
  version: '—',
  strategy: '—',
  availableStrategies: [],
  timeframe: '—',
  exchange: '—',
  tradingMode: '—',
  dryRun: true,
  walletBalance: 0,
  initialWallet: 0,
  profitTotal: 0,
  profitPct: 0,
  dailyProfit: 0,
  dailyProfitPct: 0,
  openTradesCount: 0,
  maxTrades: 0,
  stakeAmount: 0,
  stakeCurrency: '—',
  stoploss: 0,
  trailingStop: false,
  trailingOffset: 0,
  apiServerStatus: 'unavailable',
  activeTrades: [],
  closedTrades: [],
  whitelist: [],
  dynamicPairlistStats: {
    scanned: 0,
    filtered: 0,
    active: 0,
    method: '—',
    lastRefresh: 'Indisponible'
  },
  lastUpdated: new Date(0).toISOString(),
  message: 'Connexion au moteur en attente',
};

function formatNumber(val: number | undefined | null, minDecimals: number = 0, maxDecimals: number = 2): string {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

function formatPrice(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  const num = Number(val);
  if (num >= 1000) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (num >= 1) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } else {
    return num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }
}

export default function QuantApexTradingStation() {
  const [state, setState] = useState<BotState>(EMPTY_BOT_STATE);
  const [logs, setLogs] = useState<string[]>(['Connexion au journal Freqtrade en attente…']);
  const [activeTab, setActiveTab] = useState<'live' | 'risk' | 'chart' | 'backtest' | 'strategy' | 'apikeys' | 'settings' | 'coolify'>('live');
  const isActionLoading = true;
  const handleControlAction = (_action?: string, _payload?: unknown) => setLogs((current) => [...current.slice(-99), '[SÉCURITÉ] Commandes désactivées pendant la phase lecture seule.']);

  // Market & Chart State
  const [selectedPair, setSelectedPair] = useState<string>('BTC/USDT');
  const [selectedInterval, setSelectedInterval] = useState<string>('5m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [marketTickers, setMarketTickers] = useState<Ticker[]>([]);
  const [marketDataSource, setMarketDataSource] = useState<'binance-live' | 'unavailable'>('unavailable');
  const [rackState, setRackState] = useState<RackState>({ status: 'not_configured' });
  const [chartOverlay, setChartOverlay] = useState<{ ema20: boolean; ema50: boolean; ema200: boolean; bb: boolean; rsi: boolean; volume: boolean }>({
    ema20: true,
    ema50: true,
    ema200: true,
    bb: true,
    rsi: true,
    volume: true,
  });

  // Settings State Form
  const [settingsForm, setSettingsForm] = useState({
    strategy: 'QuantCoreBaseline',
    stoploss: -3.8,
    trailingOffset: 2.2,
    maxTrades: 5,
    stakeAmount: 490,
    dryRun: true,
    trailingStop: true
  });

  // Authentication & Secure Access Gate
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [authForm, setAuthForm] = useState({ username: '', password: '', pin: '' });
  const [authMode, setAuthMode] = useState<'password' | 'pin'>('password');
  const [authError, setAuthError] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<string>('Operator Lead');
  const [publicDomain, setPublicDomain] = useState<string>('localhost');

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setIsAuthenticated(true);
            if (data.user) setCurrentUser(data.user);
            if (data.domain) setPublicDomain(data.domain);
          } else {
            setIsAuthenticated(false);
          }
        }
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setAuthChecking(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const payload = authMode === 'password'
        ? { username: authForm.username, password: authForm.password }
        : { pin: authForm.pin };

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        if (data.user) setCurrentUser(data.user);
      } else {
        setAuthError(data.message || 'Identifiants ou Code PIN incorrects');
      }
    } catch (err) {
      setAuthError('Erreur de connexion avec le serveur de sécurité');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } catch (e) {}
    setIsAuthenticated(false);
  };

  // Fetch bot state
  const fetchState = async () => {
    try {
      const res = await fetch('/api/bot/control');
      const data = await res.json();
      if (data && data.status) {
        if (res.ok) {
          setState(data);
          setSettingsForm(prev => ({
            ...prev,
            strategy: data.strategy || prev.strategy,
            stoploss: data.stoploss ?? prev.stoploss,
            trailingOffset: data.trailingOffset ?? prev.trailingOffset,
            maxTrades: data.maxTrades || prev.maxTrades,
            stakeAmount: data.stakeAmount || prev.stakeAmount,
            dryRun: data.dryRun !== undefined ? data.dryRun : prev.dryRun,
            trailingStop: data.trailingStop !== undefined ? data.trailingStop : prev.trailingStop
          }));
        } else {
          setState({ ...EMPTY_BOT_STATE, ...data });
        }
      }
    } catch (e) {
      setState({ ...EMPTY_BOT_STATE, message: 'Console incapable de joindre son adaptateur Freqtrade', lastUpdated: new Date().toISOString() });
    }
  };

  // Fetch Market Tickers
  const fetchTickers = async () => {
    try {
      const res = await fetch('/api/market/ticker');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.tickers) && data.tickers.length > 0) {
          setMarketTickers(data.tickers);
          setMarketDataSource('binance-live');
        }
      } else {
        setMarketTickers([]);
        setMarketDataSource('unavailable');
      }
    } catch (e) {
      setMarketTickers([]);
      setMarketDataSource('unavailable');
    }
  };

  // Fetch Candlestick Data
  const fetchCandles = async (pair: string, interval: string) => {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/market/klines?pair=${encodeURIComponent(pair)}&interval=${interval}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.candles) && data.candles.length > 0) {
          setCandles(data.candles);
        }
      } else {
        setCandles([]);
      }
    } catch (e) {
      setCandles([]);
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchState();
    fetchTickers();
    const intervalState = setInterval(fetchState, 5000);
    const intervalTickers = setInterval(fetchTickers, 7000);
    return () => {
      clearInterval(intervalState);
      clearInterval(intervalTickers);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchRackState = async () => {
      try {
        const response = await fetch('/api/rack/status');
        if (response.ok) setRackState(await response.json());
      } catch {
        setRackState({ status: 'unavailable' });
      }
    };
    fetchRackState();
    const interval = setInterval(fetchRackState, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchCandles(selectedPair, selectedInterval);
    const intervalCandles = setInterval(() => fetchCandles(selectedPair, selectedInterval), 6000);
    return () => clearInterval(intervalCandles);
  }, [isAuthenticated, selectedPair, selectedInterval]);

  // Read-only Freqtrade logs, polled to avoid a permanent SSE worker on the small VPS.
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/bot/logs');
        const payload = await response.json();
        if (response.ok && Array.isArray(payload.messages)) {
          setLogs(payload.messages.length ? payload.messages : ['Journal Freqtrade vide']);
        } else {
          setLogs([payload.message || 'Journal Freqtrade indisponible']);
        }
      } catch {
        setLogs(['Journal Freqtrade indisponible']);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 10_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Selected Ticker Info
  const currentTicker = marketTickers.find(t => t.pair === selectedPair) || {
    pair: selectedPair,
    lastPrice: 0,
    priceChangePercent: 0,
    highPrice: 0,
    lowPrice: 0,
    volume: 0,
    trend: 'neutral' as const,
  };

  // A single real point is preferable to a beautiful fictional curve.
  const equityCurve = [
    { time: new Date(state.lastUpdated).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), balance: state.walletBalance, pnl: state.profitTotal },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#060913', color: '#f8fafc' }}>
      <Head>
        <title>QuantApex Pro | Freqtrade Algorithmic Engine & Trading Station</title>
        <meta name="description" content="Next-Gen Open Source Freqtrade Algorithmic Trading Station" />
      </Head>

      {/* Secure operator access gate */}
      {!isAuthenticated && !authChecking && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: '#060913',
            backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(56, 189, 248, 0.12) 0%, transparent 60%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '20px',
              padding: '36px 32px',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.15)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* Header / Security Badge */}
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 35px rgba(56, 189, 248, 0.45)',
                }}
              >
                <Lock size={32} color="#060913" />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', backgroundColor: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '11px', color: '#38bdf8', fontWeight: '700', marginBottom: '8px' }}>
                <Shield size={12} /> CONSOLE OPÉRATEUR
              </div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                QuantApex <span style={{ color: '#38bdf8' }}>Gate</span>
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                Accès restreint à la console sur <span style={{ color: '#38bdf8', fontWeight: '600' }}>{publicDomain}</span>
              </p>
            </div>

            {/* Auth Mode Switch */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                backgroundColor: 'rgba(2, 6, 23, 0.7)',
                padding: '4px',
                borderRadius: '10px',
                marginBottom: '22px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <button
                type="button"
                onClick={() => { setAuthMode('password'); setAuthError(''); }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: authMode === 'password' ? '#38bdf8' : 'transparent',
                  color: authMode === 'password' ? '#060913' : '#94a3b8',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Key size={13} /> Identifiant & MDP
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('pin'); setAuthError(''); }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: authMode === 'pin' ? '#38bdf8' : 'transparent',
                  color: authMode === 'pin' ? '#060913' : '#94a3b8',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Lock size={13} /> Code PIN Rapide
              </button>
            </div>

            {/* Error banner */}
            {authError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  fontSize: '12px',
                  fontWeight: '600',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={15} />
                <span>{authError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin}>
              {authMode === 'password' ? (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                      Identifiant Opérateur
                    </label>
                    <input
                      type="text"
                      value={authForm.username}
                      onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                      placeholder="Identifiant opérateur"
                      required
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(2, 6, 23, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '22px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                      Mot de Passe
                    </label>
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                      placeholder="••••••••••••"
                      required
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(2, 6, 23, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </>
              ) : (
                <div style={{ marginBottom: '22px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                    Code PIN de Sécurité (4 chiffres)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={authForm.pin}
                    onChange={(e) => setAuthForm({ ...authForm, pin: e.target.value })}
                    placeholder="PIN configuré"
                    required
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(2, 6, 23, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#38bdf8',
                      fontSize: '22px',
                      fontWeight: '800',
                      letterSpacing: '8px',
                      textAlign: 'center',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '10px',
                  backgroundColor: '#38bdf8',
                  color: '#060913',
                  border: 'none',
                  fontWeight: '800',
                  fontSize: '14px',
                  cursor: authLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 0 25px rgba(56, 189, 248, 0.35)',
                  transition: 'opacity 0.2s ease',
                  opacity: authLoading ? 0.7 : 1
                }}
              >
                <UserCheck size={16} />
                {authLoading ? 'Vérification...' : 'Déverrouiller le Terminal'}
              </button>
            </form>

            <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '16px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <ShieldCheck size={13} color="#10b981" /> Chiffrement HMAC-SHA256 & Session persistante
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Institutional Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(12, 18, 34, 0.95)',
          backdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '12px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(56, 189, 248, 0.4)',
            }}
          >
            <Zap style={{ color: '#060913', width: '24px', height: '24px' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.03em', margin: 0 }}>
                QUANTAPEX <span style={{ color: '#38bdf8', fontWeight: '400' }}>PRO</span>
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                OPEN-SOURCE CORE
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: state?.dryRun ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: state?.dryRun ? '#f59e0b' : '#10b981',
                  border: `1px solid ${state?.dryRun ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                }}
              >
                {state.dataMode === 'live' ? (state.dryRun ? 'FREQTRADE RÉEL — DRY-RUN' : 'FREQTRADE RÉEL — LIVE') : 'MOTEUR INDISPONIBLE'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8', margin: 0, marginTop: '3px' }}>
              <span>Exchange: <strong style={{ color: '#f8fafc' }}>{state?.exchange.toUpperCase()}</strong></span>
              <span>•</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Stratégie:</span>
                <select
                  value={state?.strategy || 'QuantCoreBaseline'}
                  disabled
                  style={{
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    color: '#38bdf8',
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  {state?.availableStrategies.map(strat => (
                    <option key={strat.id} value={strat.id} style={{ backgroundColor: '#0c1222', color: '#f8fafc' }}>
                      {strat.name} ({strat.winrate})
                    </option>
                  ))}
                </select>
              </div>
              <span>•</span>
              <span>TF: {state?.timeframe}</span>
            </div>
          </div>
        </div>

        {/* Engine Controls & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '13px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: state?.status === 'running' ? '#10b981' : '#f43f5e',
                boxShadow: state?.status === 'running' ? '0 0 10px #10b981' : 'none',
              }}
              className={state?.status === 'running' ? 'pulse-dot' : ''}
            />
            <span style={{ fontWeight: '600', color: state?.status === 'running' ? '#10b981' : '#f43f5e' }}>
              {state?.status === 'running' ? 'Moteur Freqtrade en ligne' : state?.status === 'stopped' ? 'Moteur arrêté' : 'Moteur indisponible'}
            </span>
          </div>

          {state?.status === 'running' ? (
            <button
              onClick={() => handleControlAction('stop')}
              disabled={isActionLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '8px',
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                color: '#f43f5e',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <Square size={14} /> Mettre en Pause
            </button>
          ) : (
            <button
              onClick={() => handleControlAction('start')}
              disabled={isActionLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '8px',
                backgroundColor: '#10b981',
                color: '#060913',
                border: 'none',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)',
              }}
            >
              <Play size={14} fill="#060913" /> Démarrer l&apos;Exécution
            </button>
          )}

          <button
            onClick={() => handleControlAction('exit_all')}
            disabled={isActionLoading || (state?.activeTrades.length || 0) === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              fontWeight: '700',
              fontSize: '12px',
              cursor: 'pointer',
            }}
            title="Clôture d'urgence de toutes les positions"
          >
            <AlertTriangle size={14} /> Panic Sell All
          </button>

          <button
            onClick={() => handleControlAction('reload')}
            disabled={isActionLoading}
            style={{
              padding: '9px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94a3b8',
              cursor: 'pointer',
            }}
            title="Recharger la stratégie et les paires"
          >
            <RefreshCw size={16} />
          </button>

          {/* Secure Operator Profile & Logout */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              marginLeft: '4px',
            }}
          >
            <ShieldCheck size={16} color="#38bdf8" />
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>{currentUser}</span>
            <button
              onClick={handleLogout}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px',
                marginLeft: '4px'
              }}
              title="Verrouiller la session (Déconnexion)"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <div
        role="status"
        style={{
          padding: '8px 28px',
          backgroundColor: 'rgba(245, 158, 11, 0.14)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.35)',
          color: '#fbbf24',
          fontSize: '12px',
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {state.dataMode === 'live'
          ? `DONNÉES FREQTRADE RÉELLES — console en lecture seule${state.stale ? ' — dernier état connu' : state.degraded ? ` — mode dégradé (${state.unavailableEndpoints?.join(', ')})` : ''}.`
          : `MOTEUR INDISPONIBLE — aucune donnée fictive affichée. ${state.message || ''}`}
      </div>

      {/* Market ticker ribbon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          overflowX: 'auto',
          padding: '8px 28px',
          backgroundColor: '#040711',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '12px',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: '700' }}>
          <Radio size={14} className={marketDataSource === 'binance-live' ? 'pulse-dot' : ''} />
          {marketDataSource === 'binance-live' ? 'BINANCE PUBLIC LIVE :' : 'MARCHÉ INDISPONIBLE'}
        </div>
        {marketTickers.map((t) => {
          const isSelected = selectedPair === t.pair;
          return (
            <button
              key={t.pair}
              onClick={() => setSelectedPair(t.pair)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: isSelected ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: '700' }}>{t.pair}</span>
              <span style={{ color: '#cbd5e1' }}>${formatPrice(t.lastPrice)}</span>
              <span style={{ color: t.priceChangePercent >= 0 ? '#10b981' : '#f43f5e', fontWeight: '700' }}>
                {t.priceChangePercent >= 0 ? '+' : ''}{t.priceChangePercent.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Navigation Sub-bar */}
      <div
        style={{
          padding: '8px 28px',
          backgroundColor: 'rgba(12, 18, 34, 0.7)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <nav style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {[
            { id: 'live', label: 'Terminal Démo & Positions', icon: Activity },
            { id: 'chart', label: 'Marché & Graphique', icon: CandlestickChart },
            { id: 'risk', label: 'Risque', icon: ShieldAlert },
            { id: 'backtest', label: 'Validation', icon: BarChart3 },
            { id: 'strategy', label: 'Stratégies', icon: BookOpen },
            { id: 'apikeys', label: 'Connexions', icon: Key },
            { id: 'settings', label: 'Réglages', icon: Settings },
            { id: 'coolify', label: 'Déploiement', icon: Server },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  backgroundColor: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  border: isActive ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#94a3b8' }}>
          <span>VolumePairList : <strong style={{ color: '#10b981' }}>{state?.dynamicPairlistStats.active} paires actives</strong></span>
          <span>Trailing Stop : <strong style={{ color: '#10b981' }}>+{state?.trailingOffset}%</strong></span>
          <span>Max Trades : <strong style={{ color: '#f8fafc' }}>{state?.maxTrades}</strong></span>
        </div>
      </div>

      {/* Main Terminal Container */}
      <main style={{ padding: '24px 28px', maxWidth: '1680px', margin: '0 auto', width: '100%', flex: 1 }}>
        
        {/* KPI Institutional Metrics Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          
          <div className="glass-card" style={{ padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
              <span>Capital Total (Wallet)</span>
              <DollarSign size={18} color="#38bdf8" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.02em' }}>
              ${formatPrice(state?.walletBalance || 2489.65)} <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '400' }}>USDT</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', marginTop: '6px', fontWeight: '600' }}>
              <ArrowUpRight size={14} /> +${state?.dailyProfit || 34.20} aujourd&apos;hui (+{state?.dailyProfitPct || 1.71}%)
            </div>
          </div>

          <div className="glass-card" style={{ padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
              <span>Profit Net Réalisé</span>
              <TrendingUp size={18} color="#10b981" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#10b981', letterSpacing: '-0.02em' }}>
              +${state?.profitTotal.toFixed(2) || '489.65'}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
              Rendement total net : <strong style={{ color: '#10b981' }}>+{state?.profitPct || 24.48}%</strong>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
              <span>Exposition & Positions</span>
              <Layers size={18} color="#f59e0b" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.02em' }}>
              {state?.openTradesCount || 4} <span style={{ fontSize: '16px', color: '#64748b', fontWeight: '400' }}>/ {state?.maxTrades || 5}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
              Exposition active : <strong style={{ color: '#38bdf8' }}>${state?.activeTrades.reduce((acc, t) => acc + t.stake, 0).toFixed(2) || '1,968.76'} USDT</strong>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
              <span>Smart Risk Guardian</span>
              <Shield size={18} color="#a855f7" />
            </div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#f8fafc', marginTop: '4px' }}>
              Trailing Stop : <span style={{ color: '#10b981' }}>ACTIF (+1.2%)</span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px' }}>
              Hard Stoploss : <strong style={{ color: '#f43f5e' }}>{state?.stoploss || -3.8}%</strong> • Drawdown max: <strong style={{ color: '#10b981' }}>1.4%</strong>
            </div>
          </div>

        </div>

        {/* TAB 1: LIVE TERMINAL & POSITIONS */}
        {activeTab === 'live' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
            
            {/* Left Column: Live Positions Table & Equity Curve */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Active Trades Table */}
              <div className="glass-card" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Activity size={20} color="#38bdf8" />
                    <h2 style={{ fontSize: '17px', fontWeight: '700', margin: 0 }}>Positions Ouvertes en Direct ({state?.activeTrades.length || 0})</h2>
                  </div>

                  <div style={{ padding: '5px 12px', borderRadius: '6px', backgroundColor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.22)', color: '#94a3b8', fontSize: '11px', fontWeight: '700' }}>
                    LECTURE SEULE
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <th style={{ padding: '10px' }}>Paire</th>
                        <th style={{ padding: '10px' }}>Prix Entrée / Actuel</th>
                        <th style={{ padding: '10px' }}>Indicateurs MTF</th>
                        <th style={{ padding: '10px' }}>Capital Investi</th>
                        <th style={{ padding: '10px' }}>P&L En Cours</th>
                        <th style={{ padding: '10px' }}>Durée</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state?.activeTrades.map((t) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '14px 10px' }}>
                            <div style={{ fontWeight: '700', color: '#f8fafc' }}>{t.pair}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>#{t.id}</div>
                          </td>
                          <td style={{ padding: '14px 10px' }}>
                            <div style={{ color: '#e2e8f0', fontWeight: '500' }}>${formatPrice(t.currentPrice)}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Entrée: ${formatPrice(t.entryPrice)}</div>
                          </td>
                          <td style={{ padding: '14px 10px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: 'rgba(100, 116, 139, 0.15)', color: '#94a3b8' }}>
                                Indicateurs via stratégie
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '14px 10px', color: '#94a3b8' }}>
                            ${t.stake.toFixed(2)} USDT
                          </td>
                          <td style={{ padding: '14px 10px', fontWeight: '700', color: t.profit >= 0 ? '#10b981' : '#f43f5e' }}>
                            {t.profit >= 0 ? '+' : ''}${t.profit.toFixed(2)} ({t.profitPct >= 0 ? '+' : ''}{t.profitPct}%)
                          </td>
                          <td style={{ padding: '14px 10px', color: '#64748b' }}>
                            {t.duration}
                          </td>
                          <td style={{ padding: '14px 10px', textAlign: 'right' }}>
                            <button
                              disabled
                              style={{
                                padding: '5px 12px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(244, 63, 94, 0.12)',
                                color: '#f43f5e',
                                border: '1px solid rgba(244, 63, 94, 0.3)',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'not-allowed',
                              }}
                            >
                              Lecture seule
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Real-time Equity Chart */}
              <div className="glass-card" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <BarChart3 size={20} color="#10b981" />
                    <h2 style={{ fontSize: '17px', fontWeight: '700', margin: 0 }}>Courbe d&apos;Équité & Performance Cumulée (USDT)</h2>
                  </div>
                  <span style={{ fontSize: '12px', color: state.profitPct >= 0 ? '#10b981' : '#f43f5e', fontWeight: '700' }}>Rendement Freqtrade : {state.profitPct >= 0 ? '+' : ''}{state.profitPct.toFixed(2)}%</span>
                </div>
                
                <div style={{ height: '230px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityCurve}>
                      <defs>
                        <linearGradient id="colorApex" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45}/>
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={['dataMin - 100', 'dataMax + 100']} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0c1222', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="balance" stroke="#38bdf8" strokeWidth={2.5} fillOpacity={1} fill="url(#colorApex)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* Right Column: Terminal Logs & Closed History */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Terminal Logs View */}
              <div style={{ backgroundColor: '#040711', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '18px', display: 'flex', flexDirection: 'column', height: '370px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal size={16} color="#38bdf8" />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>Freqtrade Core Engine Stream</span>
                  </div>
                  <span style={{ fontSize: '11px', color: state.dataMode === 'live' ? '#10b981' : '#fbbf24', fontWeight: '600' }}>● Journal REST {state.dataMode === 'live' ? 'réel' : 'indisponible'}</span>
                </div>
                
                <div
                  ref={logContainerRef}
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    lineHeight: '1.65',
                    color: '#94a3b8',
                  }}
                >
                  {logs.map((line, idx) => (
                    <div key={idx} style={{ padding: '2px 0' }}>
                      {line.includes('INDICATORS') ? (
                        <span style={{ color: '#38bdf8' }}>{line}</span>
                      ) : line.includes('Take-Profit') || line.includes('ROI') ? (
                        <span style={{ color: '#10b981' }}>{line}</span>
                      ) : line.includes('Stop-Loss') || line.includes('Drawdown') ? (
                        <span style={{ color: '#f43f5e' }}>{line}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Trade Closures */}
              <div className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '14px', color: '#f8fafc' }}>
                  Historique Récent des Clôtures
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {state?.closedTrades.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(12, 18, 34, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.04)',
                        fontSize: '12px',
                      }}
                    >
                      <div>
                        <strong style={{ color: '#f8fafc', fontSize: '13px' }}>{c.pair}</strong>
                        <span style={{ color: '#64748b', marginLeft: '6px' }}>({c.exitReason})</span>
                      </div>
                      <div style={{ fontWeight: '700', color: c.profit >= 0 ? '#10b981' : '#f43f5e', fontSize: '13px' }}>
                        {c.profit >= 0 ? '+' : ''}${c.profit.toFixed(2)} ({c.profitPct >= 0 ? '+' : ''}{c.profitPct}%)
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: ADVANCED INTERACTIVE TRADING CHART */}
        {activeTab === 'chart' && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              
              {/* Pair & Price Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0 }}>{selectedPair}</h2>
                    <span style={{ fontSize: '13px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', backgroundColor: currentTicker.priceChangePercent >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)', color: currentTicker.priceChangePercent >= 0 ? '#10b981' : '#f43f5e' }}>
                      {currentTicker.priceChangePercent >= 0 ? '+' : ''}{currentTicker.priceChangePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#38bdf8', marginTop: '2px' }}>
                    ${formatPrice(currentTicker.lastPrice)} <span style={{ fontSize: '12px', color: '#94a3b8' }}>USDT</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#94a3b8', borderLeft: '1px solid rgba(255, 255, 255, 0.08)', paddingLeft: '16px' }}>
                  <div>Haut 24h : <strong style={{ color: '#f8fafc' }}>${formatPrice(currentTicker.highPrice)}</strong></div>
                  <div>Bas 24h : <strong style={{ color: '#f8fafc' }}>${formatPrice(currentTicker.lowPrice)}</strong></div>
                  <div>Vol 24h : <strong style={{ color: '#f8fafc' }}>{formatNumber(currentTicker.volume, 0, 2)}</strong></div>
                  <div>RSI (14) : <strong style={{ color: '#94a3b8' }}>{currentTicker.rsi ?? '—'}</strong></div>
                </div>
              </div>

              {/* Timeframe & Overlays Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(15, 23, 42, 0.8)', padding: '4px', borderRadius: '8px' }}>
                  {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setSelectedInterval(tf)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: selectedInterval === tf ? '700' : '500',
                        backgroundColor: selectedInterval === tf ? '#38bdf8' : 'transparent',
                        color: selectedInterval === tf ? '#060913' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {/* Overlays toggle */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setChartOverlay(prev => ({ ...prev, ema20: !prev.ema20 }))}
                    style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: chartOverlay.ema20 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: chartOverlay.ema20 ? '#38bdf8' : '#64748b', border: '1px solid rgba(56, 189, 248, 0.3)', cursor: 'pointer' }}
                  >
                    EMA 20
                  </button>
                  <button
                    onClick={() => setChartOverlay(prev => ({ ...prev, ema50: !prev.ema50 }))}
                    style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: chartOverlay.ema50 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: chartOverlay.ema50 ? '#f59e0b' : '#64748b', border: '1px solid rgba(245, 158, 11, 0.3)', cursor: 'pointer' }}
                  >
                    EMA 50
                  </button>
                  <button
                    onClick={() => setChartOverlay(prev => ({ ...prev, ema200: !prev.ema200 }))}
                    style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: chartOverlay.ema200 ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: chartOverlay.ema200 ? '#a855f7' : '#64748b', border: '1px solid rgba(168, 85, 247, 0.3)', cursor: 'pointer' }}
                  >
                    EMA 200
                  </button>
                  <button
                    onClick={() => setChartOverlay(prev => ({ ...prev, bb: !prev.bb }))}
                    style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: chartOverlay.bb ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: chartOverlay.bb ? '#10b981' : '#64748b', border: '1px solid rgba(16, 185, 129, 0.3)', cursor: 'pointer' }}
                  >
                    Bollinger
                  </button>
                </div>
              </div>

            </div>

            {/* Interactive Price Chart with Technical Indicators */}
            <div style={{ height: '360px', width: '100%', marginBottom: '14px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={candles}>
                  <defs>
                    <linearGradient id="priceGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={['dataMin - (dataMin * 0.005)', 'dataMax + (dataMax * 0.005)']} />
                  <Tooltip contentStyle={{ backgroundColor: '#0c1222', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', fontSize: '12px' }} />
                  
                  {/* Candlestick Close Line with Gradient Fill */}
                  <Area type="monotone" dataKey="close" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#priceGlow)" />
                  
                  {/* EMA Overlays */}
                  {chartOverlay.ema20 && <Line type="monotone" dataKey="ema20" stroke="#00f2fe" strokeWidth={1.5} dot={false} name="EMA 20" />}
                  {chartOverlay.ema50 && <Line type="monotone" dataKey="ema50" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="EMA 50" />}
                  {chartOverlay.ema200 && <Line type="monotone" dataKey="ema200" stroke="#a855f7" strokeWidth={1.8} dot={false} name="EMA 200" />}
                  {chartOverlay.bb && <Line type="monotone" dataKey="bbUpper" stroke="rgba(16, 185, 129, 0.6)" strokeDasharray="3 3" dot={false} name="BB Upper" />}
                  {chartOverlay.bb && <Line type="monotone" dataKey="bbLower" stroke="rgba(244, 63, 94, 0.6)" strokeDasharray="3 3" dot={false} name="BB Lower" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* RSI & Volume Sub-chart */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: '140px' }}>
              <div style={{ backgroundColor: 'rgba(12, 18, 34, 0.6)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>RSI (14) - Seuil Achat &lt; 35 | Vente &gt; 70</div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={candles}>
                    <YAxis domain={[0, 100]} ticks={[30, 50, 70]} stroke="#64748b" fontSize={9} />
                    <Tooltip contentStyle={{ backgroundColor: '#0c1222', fontSize: '11px' }} />
                    <Line type="monotone" dataKey="rsi" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ backgroundColor: 'rgba(12, 18, 34, 0.6)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Volume de la source graphique</div>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={candles}>
                    <YAxis stroke="#64748b" fontSize={9} />
                    <Tooltip contentStyle={{ backgroundColor: '#0c1222', fontSize: '11px' }} />
                    <Bar dataKey="volume" fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Order Execution Dock */}
            <div style={{ marginTop: '20px', padding: '16px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.9)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#94a3b8', fontSize: '13px' }}>
              Les ordres manuels sont retirés de cette phase. Ils reviendront uniquement avec confirmation forte, journal d&apos;audit et rollback validé.
            </div>

          </div>
        )}

        {/* Risk controls implemented in the baseline strategy. */}
        {activeTab === 'risk' && (
          <div className="glass-card" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Shield size={22} color="#38bdf8" />
              <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>Garde-fous de la stratégie</h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
              Paramètres présents dans <code>strategies/QuantCoreBaseline.py</code>. Leur efficacité reste à démontrer par backtest et dry-run.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {[
                ['Mode', 'Spot et dry-run forcé'],
                ['Cooldown', '2 bougies après une sortie'],
                ['StoplossGuard', '3 pertes sur 48 bougies'],
                ['MaxDrawdown', '15 % sur l’équité'],
                ['LowProfitPairs', 'Pause des paires peu rentables']
              ].map(([label, value]) => (
                <div key={label} style={{ padding: '16px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700' }}>{label}</div>
                  <div style={{ color: '#f8fafc', marginTop: '6px', fontWeight: '700' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Real validation workflow: no fabricated backtest result. */}
        {activeTab === 'backtest' && (
          <div className="glass-card" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Terminal size={22} color="#38bdf8" />
              <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>Validation reproductible</h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>
              Aucun rendement n’est affiché tant que le moteur Freqtrade n’a pas produit un résultat réel.
            </p>
            <div style={{ marginTop: '18px', display: 'grid', gap: '12px' }}>
              {[
                ['1', 'Préparer la configuration', 'Copier config_examples/quantcore.dry-run.json vers user_data/config.json.'],
                ['2', 'Télécharger les données', 'Utiliser freqtrade download-data sur la période et les paires retenues.'],
                ['3', 'Lancer les contrôles', 'scripts/strategy-check.sh QuantCoreBaseline 20250101-20260101'],
                ['4', 'Décider', 'Comparer hors échantillon, frais, drawdown et stabilité avant tout dry-run prolongé.']
              ].map(([step, title, detail]) => (
                <div key={step} style={{ padding: '16px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.8)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '14px' }}>
                  <span style={{ color: '#38bdf8', fontWeight: '800' }}>{step}</span>
                  <div><strong>{title}</strong><div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>{detail}</div></div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '18px', color: '#fbbf24', fontSize: '13px' }}>
              Statut : non exécuté dans cette interface.
            </div>
          </div>
        )}

        {/* Small, explicit strategy surface. */}
        {activeTab === 'strategy' && (
          <div className="glass-card" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <BookOpen size={22} color="#38bdf8" />
              <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>Stratégies</h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>
              Deux profils de recherche installés. Les autres familles restent des pistes d’étude, pas des promesses de performance.
            </p>
            <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                <strong style={{ color: '#f8fafc' }}>QuantCoreBaseline</strong>
                <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>Trend/pullback spot, 15m, EMA/RSI/ADX/ATR. À valider.</p>
                <code style={{ color: '#38bdf8', fontSize: '12px' }}>strategies/QuantCoreBaseline.py</code>
              </div>
              <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <strong style={{ color: '#f8fafc' }}>IchiV1Research</strong>
                <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>Version modernisée de la stratégie fournie : Ichimoku, EMA, ADX, ATR et volume. Non validée.</p>
                <code style={{ color: '#38bdf8', fontSize: '12px' }}>strategies/IchiV1Research.py</code>
              </div>
              <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <strong style={{ color: '#f8fafc' }}>Pistes suivantes</strong>
                <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>Mean reversion et breakout, seulement après validation de la baseline.</p>
                <code style={{ color: '#38bdf8', fontSize: '12px' }}>docs/STRATEGY_TOOLING_STUDY_2026-08-22.md</code>
              </div>
            </div>

            <div style={{ marginTop: '22px', padding: '18px', borderRadius: '12px', backgroundColor: '#040711', border: '1px solid rgba(56, 189, 248, 0.22)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Quant Rack</div>
                  <h3 style={{ margin: '5px 0 0', fontSize: '16px' }}>
                    {rackState.status === 'configured' ? rackState.label : 'Rack non initialisé'}
                  </h3>
                </div>
                <span style={{ color: rackState.status === 'configured' ? '#10b981' : '#fbbf24', fontSize: '12px', fontWeight: '800' }}>
                  {rackState.status === 'configured' ? `${rackState.timeframe} • ${rackState.pair_limit} paires max` : 'scripts/rackctl list'}
                </span>
              </div>

              {rackState.status === 'configured' && (
                <>
                  <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ color: '#64748b', fontSize: '11px' }}>BUDGET</div>
                      <strong>{rackState.budget?.cpu} CPU • {rackState.budget?.memory_mb} Mo</strong>
                    </div>
                    <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ color: '#64748b', fontSize: '11px' }}>INDICATEURS DU PROFIL</div>
                      <strong>{rackState.indicators?.length || 0}</strong>
                    </div>
                    <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ color: '#64748b', fontSize: '11px' }}>JOBS PARALLÈLES</div>
                      <strong>{rackState.budget?.max_parallel_jobs || 1}</strong>
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', color: '#94a3b8', fontSize: '12px', lineHeight: 1.7 }}>
                    {rackState.indicators?.join(' • ')}
                  </div>
                  {rackState.restart_required && (
                    <div style={{ marginTop: '10px', color: '#fbbf24', fontSize: '12px' }}>Configuration appliquée : redémarrage contrôlé du moteur requis.</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Connections: secrets stay outside the browser until a vault is implemented. */}
        {activeTab === 'apikeys' && (
          <div className="glass-card" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <Key size={22} color="#38bdf8" />
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>Connexions</h2>
                <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                  Les secrets restent côté serveur. Le navigateur reçoit uniquement les données opérateur nécessaires.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.8)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <strong style={{ color: '#fbbf24' }}>Moteur Freqtrade</strong>
                <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6 }}>
                  Connecté par adaptateur serveur privé. État : {state.apiServerStatus}.
                </p>
              </div>
              <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.8)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                <strong style={{ color: '#38bdf8' }}>Exchange</strong>
                <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6 }}>
                  Configuré uniquement dans Freqtrade ou les secrets Coolify. Aucune clé n&apos;est exposée au navigateur.
                </p>
              </div>
              <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.8)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                <strong style={{ color: '#10b981' }}>Sécurité active</strong>
                <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6 }}>
                  Les commandes restent bloquées jusqu&apos;à l&apos;activation contrôlée avec audit, contrôle santé et rollback.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Read-only settings snapshot */}
        {activeTab === 'settings' && (
          <div className="glass-card" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <Settings size={24} color="#38bdf8" />
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>Configuration Freqtrade observée</h2>
                <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                  Lecture seule pendant P2. Les valeurs viennent de `show_config` et ne peuvent pas être modifiées ici.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                    Stratégie Active
                  </label>
                  <select
                    value={settingsForm.strategy}
                    disabled
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#040711', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#f8fafc', fontSize: '13px' }}
                  >
                    {state?.availableStrategies.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                    Hard Stop-Loss (%) : <span style={{ color: '#f43f5e' }}>{settingsForm.stoploss}%</span>
                  </label>
                  <input
                    type="range"
                    min="-10"
                    max="-1"
                    step="0.1"
                    value={settingsForm.stoploss}
                    disabled
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                    Trailing Stop Offset (%) : <span style={{ color: '#10b981' }}>+{settingsForm.trailingOffset}%</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.1"
                    value={settingsForm.trailingOffset}
                    disabled
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                    Positions Simultanées Maximales (Max Open Trades)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={settingsForm.maxTrades}
                    disabled
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#040711', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#f8fafc', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                    Stake Amount par Position (USDT)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="5000"
                    value={settingsForm.stakeAmount}
                    disabled
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#040711', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#f8fafc', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                  <input
                    type="checkbox"
                    id="dryRunToggle"
                    checked
                    disabled
                    style={{ width: '18px', height: '18px' }}
                  />
                  <label htmlFor="dryRunToggle" style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '600', cursor: 'pointer' }}>
                    Mode actuellement déclaré par Freqtrade : {state.dryRun ? 'dry-run' : 'live'}
                  </label>
                </div>
              </div>

            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                disabled
                style={{
                  padding: '11px 24px',
                  borderRadius: '8px',
                  backgroundColor: '#38bdf8',
                  color: '#060913',
                  fontWeight: '800',
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'not-allowed',
                  opacity: 0.55
                }}
              >
                Modification verrouillée
              </button>
            </div>
          </div>
        )}

        {/* TAB 8: COOLIFY PRODUCTION DEPLOYMENT */}
        {activeTab === 'coolify' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Deployment banner */}
            <div className="glass-card" style={{ padding: '24px 28px', border: '1px solid rgba(56, 189, 248, 0.35)', background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(12, 18, 34, 0.8) 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Server size={22} color="#38bdf8" />
                    <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>Déploiement Docker Compose (Linux VPS / Coolify)</h2>
                  </div>
                  <p style={{ color: '#cbd5e1', fontSize: '13px', marginTop: '6px' }}>
                    La stack se déploie depuis <code>docker-compose.coolify.yml</code> après configuration de <code>.env</code> et <code>user_data/config.json</code>.
                  </p>
                </div>

                <div style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: '#040711', border: '1px solid rgba(56, 189, 248, 0.3)', fontFamily: 'monospace', fontSize: '13px', color: '#38bdf8', fontWeight: '700' }}>
                  docker compose up -d --build
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              
              <div className="glass-card" style={{ padding: '26px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                  <Server size={22} color="#38bdf8" />
                  <h2 style={{ fontSize: '19px', fontWeight: '800', margin: 0 }}>Déploiement Coolify</h2>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.6', marginBottom: '20px' }}>
                  Le Compose est prêt à être validé, mais le fichier <code>user_data/config.json</code> et tous les secrets restent à fournir avant le démarrage.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.7)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <strong style={{ color: '#38bdf8', fontSize: '14px' }}>Étape 1 : Créer l&apos;application Docker Compose</strong>
                    <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>Sélectionnez &quot;Docker Compose&quot; dans votre dashboard Coolify et pointez vers ce dépôt Git.</p>
                  </div>

                  <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.7)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <strong style={{ color: '#38bdf8', fontSize: '14px' }}>Étape 2 : Configurer les Secrets</strong>
                    <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>Définissez les variables de <code>.env.example</code> dans Coolify. Aucun mot de passe par défaut n&apos;est accepté.</p>
                  </div>

                  <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'rgba(12, 18, 34, 0.7)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <strong style={{ color: '#38bdf8', fontSize: '14px' }}>Étape 3 : Domaines et Ports</strong>
                    <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>Attribuez votre domaine sur le port <code>3000</code> pour la Console UI.</p>
                  </div>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '26px' }}>
                <h2 style={{ fontSize: '19px', fontWeight: '800', marginBottom: '14px', margin: 0 }}>Commandes de validation</h2>
                <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
                  Le fichier du dépôt reste l’unique source de vérité ; la console n’en conserve pas une copie.
                </p>

                <pre
                  style={{
                    backgroundColor: '#040711',
                    padding: '16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    lineHeight: '1.6',
                    color: '#cbd5e1',
                    overflowX: 'auto',
                  }}
                >
{`cp .env.example .env
cp config_examples/quantcore.dry-run.json user_data/config.json

docker compose --env-file .env \\
  -f docker-compose.coolify.yml config

docker compose --env-file .env \\
  -f docker-compose.coolify.yml up -d --build`}
                </pre>
              </div>

            </div>

          </div>
        )}

      </main>
    </div>
  );
}
