import type { NextApiRequest, NextApiResponse } from 'next';
import { isAuthorizedRequest } from '../auth';

let botState = {
  dataMode: 'simulated',
  status: 'running',
  version: 'Freqtrade 2026.1 (Latest Open-Source)',
  strategy: 'QuantCoreBaseline',
  availableStrategies: [
    { id: 'QuantCoreBaseline', name: 'Quant Core Baseline', type: 'Trend/pullback spot — recherche', timeframe: '15m', winrate: 'À mesurer' },
    { id: 'IchiV1Research', name: 'Ichi V1 Research', type: 'Ichimoku/EMA spot — non validée', timeframe: '15m', winrate: 'À mesurer' }
  ],
  timeframe: '15m',
  exchange: 'binance',
  tradingMode: 'spot',
  dryRun: true,
  walletBalance: 2489.65,
  initialWallet: 2000.00,
  profitTotal: 489.65,
  profitPct: 24.48,
  dailyProfit: 34.20,
  dailyProfitPct: 1.71,
  openTradesCount: 4,
  maxTrades: 5,
  stakeAmount: 490.00,
  stakeCurrency: 'USDT',
  stoploss: -3.8,
  trailingStop: true,
  trailingOffset: 2.2,
  apiServerStatus: 'simulated',
  activeTrades: [
    {
      id: 201,
      pair: 'BTC/USDT',
      entryPrice: 96420.00,
      currentPrice: 97840.50,
      amount: 0.0051,
      stake: 491.74,
      profit: 7.25,
      profitPct: 1.47,
      openTime: '2026-08-21 11:15',
      duration: '45m',
      rsi: 39.2,
      macdHist: 14.2,
      stopLoss: 92756.00,
      trailingStopActive: true,
      indicators: { adx: 28.4, ema50: 96100, ema200: 95400 }
    },
    {
      id: 202,
      pair: 'ETH/USDT',
      entryPrice: 2740.00,
      currentPrice: 2815.20,
      amount: 0.18,
      stake: 493.20,
      profit: 13.54,
      profitPct: 2.74,
      openTime: '2026-08-21 10:30',
      duration: '1h 30m',
      rsi: 58.6,
      macdHist: 8.7,
      stopLoss: 2635.88,
      trailingStopActive: true,
      indicators: { adx: 32.1, ema50: 2720, ema200: 2680 }
    },
    {
      id: 203,
      pair: 'SOL/USDT',
      entryPrice: 192.40,
      currentPrice: 198.60,
      amount: 2.55,
      stake: 490.62,
      profit: 15.81,
      profitPct: 3.22,
      openTime: '2026-08-21 11:40',
      duration: '20m',
      rsi: 62.4,
      macdHist: 19.5,
      stopLoss: 185.08,
      trailingStopActive: true,
      indicators: { adx: 41.5, ema50: 190.2, ema200: 184.0 }
    },
    {
      id: 204,
      pair: 'RENDER/USDT',
      entryPrice: 6.85,
      currentPrice: 6.88,
      amount: 72.0,
      stake: 493.20,
      profit: 2.16,
      profitPct: 0.44,
      openTime: '2026-08-21 11:55',
      duration: '5m',
      rsi: 48.8,
      macdHist: 0.2,
      stopLoss: 6.58,
      trailingStopActive: false,
      indicators: { adx: 21.0, ema50: 6.82, ema200: 6.70 }
    }
  ],
  closedTrades: [
    { id: 199, pair: 'AVAX/USDT', profit: 24.50, profitPct: 5.10, closeTime: '2026-08-21 09:45', exitReason: 'roi_target_1' },
    { id: 198, pair: 'NEAR/USDT', profit: 18.20, profitPct: 3.80, closeTime: '2026-08-21 08:20', exitReason: 'trailing_stop' },
    { id: 197, pair: 'LINK/USDT', profit: 11.40, profitPct: 2.35, closeTime: '2026-08-21 06:10', exitReason: 'exit_signal_macd' },
    { id: 196, pair: 'BTC/USDT', profit: -14.80, profitPct: -3.00, closeTime: '2026-08-20 23:40', exitReason: 'stop_loss' },
    { id: 195, pair: 'ETH/USDT', profit: 38.60, profitPct: 7.90, closeTime: '2026-08-20 20:15', exitReason: 'roi_target_0' },
  ],
  whitelist: [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT',
    'AVAX/USDT', 'NEAR/USDT', 'RENDER/USDT', 'LINK/USDT', 'SUI/USDT'
  ],
  dynamicPairlistStats: {
    scanned: 180,
    filtered: 20,
    active: 9,
    method: 'VolumePairList + AgeFilter + SpreadFilter',
    lastRefresh: 'Données de démonstration'
  },
  lastUpdated: new Date().toISOString()
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthorizedRequest(req)) {
    return res.status(401).json({ success: false, message: 'Authentification requise' });
  }

  res.setHeader('X-Quant-Core-Data-Mode', 'simulated');
  if (req.method === 'GET') {
    return res.status(200).json(botState);
  }

  if (req.method === 'POST') {
    const { action, payload } = req.body || {};

    if (action === 'start') {
      botState.status = 'running';
    } else if (action === 'stop') {
      botState.status = 'stopped';
    } else if (action === 'reload') {
      botState.status = 'reloading';
      setTimeout(() => {
        botState.status = 'running';
      }, 1000);
    } else if (action === 'force_exit' && payload?.tradeId) {
      const tradeIndex = botState.activeTrades.findIndex(t => t.id === payload.tradeId);
      if (tradeIndex !== -1) {
        const trade = botState.activeTrades[tradeIndex];
        botState.activeTrades.splice(tradeIndex, 1);
        botState.closedTrades.unshift({
          id: trade.id,
          pair: trade.pair,
          profit: trade.profit,
          profitPct: trade.profitPct,
          closeTime: new Date().toLocaleTimeString('fr-FR'),
          exitReason: 'manual_force_exit'
        });
        botState.profitTotal += trade.profit;
        botState.walletBalance += trade.profit;
        botState.openTradesCount = botState.activeTrades.length;
      }
    } else if (action === 'exit_all') {
      while (botState.activeTrades.length > 0) {
        const trade = botState.activeTrades.pop()!;
        botState.closedTrades.unshift({
          id: trade.id,
          pair: trade.pair,
          profit: trade.profit,
          profitPct: trade.profitPct,
          closeTime: new Date().toLocaleTimeString('fr-FR'),
          exitReason: 'panic_exit_all'
        });
        botState.profitTotal += trade.profit;
        botState.walletBalance += trade.profit;
      }
      botState.openTradesCount = 0;
    } else if (action === 'force_buy' && payload?.pair) {
      if (botState.activeTrades.length < botState.maxTrades) {
        const price = payload.price || 100;
        const stake = Number(payload.stake || botState.stakeAmount || 490);
        const amount = stake / price;
        const newTrade = {
          id: Math.floor(Math.random() * 9000) + 1000,
          pair: payload.pair,
          entryPrice: price,
          currentPrice: price,
          amount: parseFloat(amount.toFixed(4)),
          stake: stake,
          profit: 0.00,
          profitPct: 0.00,
          openTime: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          duration: 'À l\'instant',
          rsi: 38.0,
          macdHist: 0.8,
          stopLoss: price * (1 + (botState.stoploss / 100)),
          trailingStopActive: botState.trailingStop,
          indicators: { adx: 26, ema50: price * 0.99, ema200: price * 0.97 }
        };
        botState.activeTrades.push(newTrade);
        botState.openTradesCount = botState.activeTrades.length;
      }
    } else if (action === 'add_to_whitelist' && payload?.pair) {
      if (!botState.whitelist.includes(payload.pair)) {
        botState.whitelist.push(payload.pair);
        botState.dynamicPairlistStats.active = botState.whitelist.length;
      }
    } else if (action === 'remove_from_whitelist' && payload?.pair) {
      botState.whitelist = botState.whitelist.filter(p => p !== payload.pair);
      botState.dynamicPairlistStats.active = botState.whitelist.length;
    } else if (action === 'update_settings' && payload) {
      botState.dryRun = true;
      if (payload.maxTrades) botState.maxTrades = Number(payload.maxTrades);
      if (payload.stoploss) botState.stoploss = Number(payload.stoploss);
      if (payload.strategy && botState.availableStrategies.some(strategy => strategy.id === payload.strategy)) {
        botState.strategy = payload.strategy;
      }
      if (payload.trailingStop !== undefined) botState.trailingStop = payload.trailingStop;
      if (payload.trailingOffset) botState.trailingOffset = Number(payload.trailingOffset);
      if (payload.stakeAmount) botState.stakeAmount = Number(payload.stakeAmount);
    }

    botState.lastUpdated = new Date().toISOString();
    return res.status(200).json({ success: true, state: botState });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
