/**
 * TechnicalInput türetici — candles (+ varsa scan_cache satırı) → STEP 1 girdileri.
 * Deterministik; mevcut indikatör araçlarını yeniden kullanır:
 *   - RSI: scan_cache.rsi (öncelik) / wilderRSI (candle-microstructure)
 *   - MACD: calculateEMA (lib/signals.ts) ile MACD(12,26,9)
 *   - MA50 kesişim: 50g SMA üstüne son ~3 günde yukarı geçiş
 *   - Hacim artışı: scan_cache.rel_vol5 (öncelik) / candles'tan rel-vol
 */

import type { OHLCVCandle } from '@/types'
import { calculateEMA } from '../signals'
import { wilderRSI } from '../candle-microstructure'
import type { TechnicalInput } from './types'

export interface ScanRowLite {
  rsi?: number | null
  rel_vol5?: number | null
}

const last = <T>(a: T[]): T | undefined => a[a.length - 1]

/** MACD(12,26,9): macdLine > signalLine → bullish */
function macdSignal(closes: number[]): TechnicalInput['macd_signal'] {
  if (closes.length < 35) return 'neutral'
  const ema12 = calculateEMA(closes, 12)
  const ema26 = calculateEMA(closes, 26)
  const macdLine = closes.map((_, i) => ema12[i] - ema26[i])
  const signalLine = calculateEMA(macdLine, 9)
  const m = last(macdLine)!
  const sig = last(signalLine)!
  const diff = m - sig
  const eps = Math.abs(m) * 0.02 // küçük gürültü bandı
  if (diff > eps) return 'bullish'
  if (diff < -eps) return 'bearish'
  return 'neutral'
}

/** 50g SMA üstüne son ~3 günde YUKARI kesişim */
function ma50CrossUp(closes: number[]): boolean {
  const period = 50
  if (closes.length < period + 1) return false
  const sma = (endIdx: number) =>
    closes.slice(endIdx - period + 1, endIdx + 1).reduce((a, b) => a + b, 0) / period
  const n = closes.length
  for (let j = n - 1; j >= Math.max(period, n - 3); j--) {
    const above = closes[j] > sma(j)
    const belowPrev = closes[j - 1] <= sma(j - 1)
    if (above && belowPrev) return true
  }
  return false
}

function relVol5FromCandles(candles: OHLCVCandle[]): number | null {
  if (candles.length < 6) return null
  const lastVol = candles[candles.length - 1].volume
  const prev5 = candles.slice(-6, -1)
  const avg = prev5.reduce((a, c) => a + c.volume, 0) / prev5.length
  return avg > 0 ? lastVol / avg : null
}

export function deriveTechnicalInput(candles: OHLCVCandle[], scan?: ScanRowLite): TechnicalInput {
  const closes = candles.map((c) => c.close)
  const rsi = scan?.rsi ?? (closes.length > 14 ? wilderRSI(closes, 14) : null)
  const relVol = scan?.rel_vol5 ?? relVol5FromCandles(candles)

  return {
    rsi,
    macd_signal: macdSignal(closes),
    ma50_cross: ma50CrossUp(closes),
    volume_increase: relVol !== null && relVol >= 1.3,
  }
}
