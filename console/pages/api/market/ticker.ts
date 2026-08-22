import type { NextApiRequest, NextApiResponse } from 'next';

interface TickerData {
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

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'AVAXUSDT', 'NEARUSDT', 'RENDERUSDT', 'LINKUSDT', 'SUIUSDT', 'DOGEUSDT'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (binanceRes && binanceRes.ok) {
      const data = await binanceRes.json();
      if (Array.isArray(data)) {
        const filtered: TickerData[] = data
          .filter((item: any) => DEFAULT_SYMBOLS.includes(item.symbol))
          .map((item: any) => {
            const pair = item.symbol.replace('USDT', '/USDT');
            const priceChange = parseFloat(item.priceChangePercent) || 0;
            return {
              symbol: item.symbol,
              pair,
              lastPrice: parseFloat(item.lastPrice) || 0,
              priceChangePercent: priceChange,
              highPrice: parseFloat(item.highPrice) || 0,
              lowPrice: parseFloat(item.lowPrice) || 0,
              volume: parseFloat(item.volume) || 0,
              quoteVolume: parseFloat(item.quoteVolume) || 0,
              trend: priceChange > 1.5 ? 'bullish' : priceChange < -1.5 ? 'bearish' : 'neutral'
            };
          });

        if (filtered.length > 0) {
          return res.status(200).json({ success: true, source: 'binance-live', tickers: filtered });
        }
      }
    }
  } catch (err) {}

  return res.status(503).json({ success: false, source: 'unavailable', tickers: [], message: 'Marché public indisponible' });
}
