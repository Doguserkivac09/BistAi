import type { OHLCVCandle } from '@/types';
import { calculateEMA } from '@/lib/signals';

export type MarketRegime = 'bull_trend' | 'bear_trend' | 'sideways';

/**
 * Pure function: classifies market regime from OHLCV candles using EMA50 vs EMA200.
 * No DB or fetch calls.
 */
export function getMarketRegime(candles: OHLCVCandle[]): MarketRegime {
  if (!Array.isArray(candles) || candles.length < 200) return 'sideways';

  const closes = candles.map((c) => c.close);
  const ema50Series = calculateEMA(closes, 50);
  const ema200Series = calculateEMA(closes, 200);

  const lastIdx = candles.length - 1;
  const ema50 = ema50Series[lastIdx];
  const ema200 = ema200Series[lastIdx];

  if (
    ema50 == null ||
    ema200 == null ||
    !Number.isFinite(ema50) ||
    !Number.isFinite(ema200) ||
    ema200 <= 0
  ) {
    return 'sideways';
  }

  if (ema50 > ema200 * 1.005) return 'bull_trend';
  if (ema50 < ema200 * 0.995) return 'bear_trend';
  return 'sideways';
}
