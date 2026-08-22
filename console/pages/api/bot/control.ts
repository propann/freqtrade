import type { NextApiRequest, NextApiResponse } from 'next';
import { isAuthorizedRequest, verifyOwnerPassword } from '../auth';
import { freqtradeGet, freqtradePost, publicFreqtradeError } from '../../../lib/freqtrade-client';
import { sameOriginRequest } from '../../../lib/request-guard';

type JsonObject = Record<string, any>;
let cache: { expiresAt: number; state: JsonObject } | null = null;
let lastGoodState: JsonObject | null = null;
let consecutiveFailures = 0;

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };

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
  const [ping, config, openTrades, balances, profit, sysinfo, daily] = await Promise.all([
    freqtradeGet<JsonObject>('/ping'),
    freqtradeGet<JsonObject>('/show_config'),
    freqtradeGet<JsonObject[]>('/status'),
    optional<JsonObject>('/balance', errors),
    optional<JsonObject>('/profit', errors),
    optional<JsonObject>('/sysinfo', errors),
    optional<JsonObject>('/daily?timescale=1', errors),
  ]);

  if (ping.status !== 'pong') throw new Error('Freqtrade readiness check failed');

  const dailyRecord = Array.isArray(daily?.data) ? daily.data[0] : null;
  const maxTrades = config.max_open_trades === 'inf' ? -1 : number(config.max_open_trades);

  return {
    dataMode: 'live',
    status: ['running', 'stopped', 'reloading'].includes(config.state) ? config.state : 'unavailable',
    version: text(config.version),
    strategy: text(config.strategy),
    timeframe: text(config.timeframe),
    exchange: text(config.exchange),
    tradingMode: text(config.trading_mode),
    dryRun: Boolean(config.dry_run),
    walletBalance: number(balances?.total_bot, number(balances?.total)),
    profitTotal: number(profit?.profit_all_coin),
    profitPct: number(profit?.profit_all_percent),
    dailyProfit: number(dailyRecord?.abs_profit),
    dailyProfitPct: number(dailyRecord?.rel_profit) * 100,
    openTradesCount: openTrades.length,
    maxTrades,
    stakeCurrency: text(config.stake_currency),
    activeTrades: openTrades.map(mapTrade),
    system: sysinfo ? {
      cpuAveragePct: number(sysinfo.cpu_avg),
      cpuCount: number(sysinfo.cpu_count),
      ramPct: number(sysinfo.ram_pct),
    } : null,
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
  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!sameOriginRequest(req.headers)) return res.status(403).json({ success: false, message: 'Origine refusée' });
    if (!verifyOwnerPassword(req.body?.confirmPassword) || req.body?.confirmation !== 'CONFIRMER') {
      return res.status(403).json({ success: false, message: 'Confirmation propriétaire requise' });
    }
    const endpoints: Record<string, string> = { start: '/start', stopbuy: '/stopbuy', reload: '/reload_config' };
    const action = typeof req.body?.action === 'string' ? req.body.action : '';
    const endpoint = endpoints[action];
    if (!endpoint) return res.status(400).json({ success: false, message: 'Action refusée' });
    try {
      await freqtradePost(endpoint);
      cache = null;
      return res.status(200).json({ success: true, action, message: 'Commande appliquée' });
    } catch (error) {
      return res.status(503).json({ success: false, ...publicFreqtradeError(error) });
    }
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, message: 'Méthode refusée' });
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
