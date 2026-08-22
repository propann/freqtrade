import type { NextApiRequest, NextApiResponse } from 'next';
import { isAuthorizedRequest } from '../auth';
import { freqtradeGet, publicFreqtradeError } from '../../../lib/freqtrade-client';

type JsonObject = Record<string, any>;
let cache: { expiresAt: number; state: JsonObject } | null = null;
let lastGoodState: JsonObject | null = null;
let consecutiveFailures = 0;

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown, fallback = '—'): string {
  return typeof value === 'string' && value ? value : fallback;
}

function duration(openTimestamp: unknown): string {
  const startedAt = number(openTimestamp);
  if (!startedAt) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function mapTrade(trade: JsonObject) {
  return {
    id: number(trade.trade_id),
    pair: text(trade.pair),
    entryPrice: number(trade.open_rate),
    currentPrice: number(trade.current_rate, number(trade.close_rate, number(trade.open_rate))),
    amount: number(trade.amount),
    stake: number(trade.stake_amount),
    profit: number(trade.profit_abs, number(trade.close_profit_abs)),
    profitPct: number(trade.profit_pct, number(trade.close_profit_pct)),
    openTime: text(trade.open_date),
    duration: duration(trade.open_timestamp),
    stopLoss: number(trade.stop_loss_abs),
    trailingStopActive: Boolean(trade.stoploss_last_update_timestamp),
    exitReason: text(trade.exit_reason),
    closeTime: text(trade.close_date),
  };
}

async function optional<T>(endpoint: string, errors: string[]): Promise<T | null> {
  try {
    return await freqtradeGet<T>(endpoint);
  } catch {
    errors.push(endpoint.split('?')[0]);
    return null;
  }
}

async function buildState() {
  const errors: string[] = [];
  const [ping, config, openTrades, balances, tradeHistory, profit, whitelist, strategies, sysinfo, health, daily] = await Promise.all([
    freqtradeGet<JsonObject>('/ping'),
    freqtradeGet<JsonObject>('/show_config'),
    freqtradeGet<JsonObject[]>('/status'),
    optional<JsonObject>('/balance', errors),
    optional<JsonObject>('/trades?limit=20&offset=0&order_by_id=false', errors),
    optional<JsonObject>('/profit', errors),
    optional<JsonObject>('/whitelist', errors),
    optional<JsonObject>('/strategies', errors),
    optional<JsonObject>('/sysinfo', errors),
    optional<JsonObject>('/health', errors),
    optional<JsonObject>('/daily?timescale=1', errors),
  ]);

  if (ping.status !== 'pong') throw new Error('Freqtrade readiness check failed');

  const strategyNames = Array.isArray(strategies?.strategies) ? strategies.strategies : [];
  const closedTrades = Array.isArray(tradeHistory?.trades)
    ? tradeHistory.trades.filter((trade: JsonObject) => !trade.is_open).map(mapTrade)
    : [];
  const dailyRecord = Array.isArray(daily?.data) ? daily.data[0] : null;
  const maxTrades = config.max_open_trades === 'inf' ? -1 : number(config.max_open_trades);

  return {
    dataMode: 'live',
    status: ['running', 'stopped', 'reloading'].includes(config.state) ? config.state : 'unavailable',
    version: text(config.version),
    strategy: text(config.strategy),
    availableStrategies: strategyNames.map((name: string) => ({
      id: name,
      name,
      type: name === config.strategy ? 'Active' : 'Disponible',
      timeframe: text(config.timeframe),
      winrate: 'À mesurer',
    })),
    timeframe: text(config.timeframe),
    exchange: text(config.exchange),
    tradingMode: text(config.trading_mode),
    dryRun: Boolean(config.dry_run),
    walletBalance: number(balances?.total_bot, number(balances?.total)),
    initialWallet: number(balances?.starting_capital),
    profitTotal: number(profit?.profit_all_coin),
    profitPct: number(profit?.profit_all_percent),
    dailyProfit: number(dailyRecord?.abs_profit),
    dailyProfitPct: number(dailyRecord?.rel_profit) * 100,
    openTradesCount: openTrades.length,
    maxTrades,
    stakeAmount: number(config.stake_amount),
    stakeCurrency: text(config.stake_currency),
    stoploss: number(config.stoploss) * 100,
    trailingStop: Boolean(config.trailing_stop),
    trailingOffset: number(config.trailing_stop_positive_offset) * 100,
    apiServerStatus: errors.length ? 'degraded' : 'connected',
    activeTrades: openTrades.map(mapTrade),
    closedTrades,
    whitelist: Array.isArray(whitelist?.whitelist) ? whitelist.whitelist : [],
    dynamicPairlistStats: {
      scanned: 0,
      filtered: 0,
      active: number(whitelist?.length),
      method: Array.isArray(whitelist?.method) ? whitelist.method.join(' + ') : '—',
      lastRefresh: 'État Freqtrade en direct',
    },
    system: sysinfo ? {
      cpuAveragePct: number(sysinfo.cpu_avg),
      cpuCount: number(sysinfo.cpu_count),
      ramPct: number(sysinfo.ram_pct),
    } : null,
    health: health || null,
    degraded: errors.length > 0,
    stale: false,
    unavailableEndpoints: errors,
    lastUpdated: new Date().toISOString(),
  };
}

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
    if (cache && cache.expiresAt > Date.now()) return res.status(200).json(cache.state);
    const state = await buildState();
    lastGoodState = state;
    consecutiveFailures = 0;
    cache = { expiresAt: Date.now() + 10_000, state };
    return res.status(200).json(state);
  } catch (error) {
    cache = null;
    consecutiveFailures += 1;
    if (lastGoodState && consecutiveFailures < 2) {
      return res.status(200).json({
        ...lastGoodState,
        degraded: true,
        stale: true,
        message: 'Dernier état connu — une lecture Freqtrade a échoué',
      });
    }
    return res.status(503).json({
      dataMode: 'unavailable',
      status: 'unavailable',
      apiServerStatus: 'unavailable',
      ...publicFreqtradeError(error),
      lastKnownAt: lastGoodState?.lastUpdated || null,
      lastUpdated: new Date().toISOString(),
    });
  }
}
