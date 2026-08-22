import type { NextApiRequest, NextApiResponse } from 'next';

export interface Candle {
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
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  bbUpper?: number;
  bbLower?: number;
}

// Calculate Exponential Moving Average
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  let ema = data[0] || 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema = data[i];
      emaArray.push(ema);
    } else if (i === period - 1) {
      const sum = data.slice(0, period).reduce((a, b) => a + b, 0);
      ema = sum / period;
      emaArray.push(ema);
    } else {
      ema = data[i] * k + ema * (1 - k);
      emaArray.push(ema);
    }
  }
  return emaArray;
}

// Calculate RSI
function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = (closes[i] || 0) - (closes[i - 1] || 0);
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi.push(100 - (100 / (1 + (avgGain / (avgLoss || 0.0001)))));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgGain / (avgLoss || 0.0001);
    rsi.push(Math.min(100, Math.max(0, 100 - (100 / (1 + rs)))));
  }

  while (rsi.length < closes.length) {
    rsi.unshift(50);
  }

  return rsi;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pair = (req.query.pair as string) || 'BTC/USDT';
  const interval = (req.query.interval as string) || '5m';
  const symbol = pair.replace('/', '').toUpperCase();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=60`;
    const response = await fetch(binanceUrl, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (response && response.ok) {
      const rawKlines = await response.json();
      if (Array.isArray(rawKlines) && rawKlines.length > 0) {
        const closes: number[] = [];

        const candles: Candle[] = rawKlines.map((k: any) => {
          const timestamp = k[0];
          const date = new Date(timestamp);
          const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          const close = parseFloat(k[4]);
          closes.push(close);

          return {
            time: timeStr,
            timestamp,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close,
            volume: parseFloat(k[5]),
          };
        });

        const ema20 = calculateEMA(closes, 20);
        const ema50 = calculateEMA(closes, 50);
        const ema200 = calculateEMA(closes, Math.min(closes.length, 100));
        const rsi = calculateRSI(closes, 14);

        candles.forEach((c, idx) => {
          c.ema20 = parseFloat((ema20[idx] || c.close).toFixed(2));
          c.ema50 = parseFloat((ema50[idx] || c.close).toFixed(2));
          c.ema200 = parseFloat((ema200[idx] || c.close).toFixed(2));
          c.rsi = parseFloat((rsi[idx] || 50).toFixed(1));
          c.bbUpper = parseFloat((c.ema20 * 1.015).toFixed(2));
          c.bbLower = parseFloat((c.ema20 * 0.985).toFixed(2));
          c.macdHist = parseFloat(((c.ema20 - c.ema50) * 0.5).toFixed(2));
        });

        return res.status(200).json({ success: true, source: 'binance-klines', pair, interval, candles });
      }
    }
  } catch (err) {}

  return res.status(503).json({ success: false, source: 'unavailable', pair, interval, candles: [], message: 'Bougies publiques indisponibles' });
}
