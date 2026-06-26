/**
 * STEP 1 — Teknik Skor (0-7), saf/deterministik.
 *
 *  RSI < 30 → +2 | RSI 30-40 → +1
 *  MACD bullish → +2
 *  MA50 yukarı kesişim → +2
 *  Hacim artışı → +1
 */

import type { TechnicalInput } from './types'

export function computeTechnicalScore(t: TechnicalInput): number {
  let s = 0
  if (t.rsi !== null) {
    if (t.rsi < 30) s += 2
    else if (t.rsi <= 40) s += 1
  }
  if (t.macd_signal === 'bullish') s += 2
  if (t.ma50_cross) s += 2
  if (t.volume_increase) s += 1
  return Math.min(7, s)
}
