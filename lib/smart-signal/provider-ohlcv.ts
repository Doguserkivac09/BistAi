/**
 * OHLCV Akıllı Para Sağlayıcısı — gerçek takas YOKKEN deterministik proxy.
 *
 * Money-Flow-Volume (Accumulation/Distribution) mantığı:
 *   mfMultiplier = ((close-low) - (high-close)) / (high-low)   ∈ [-1,1]
 *   mfv = mfMultiplier · volume
 *   net_flow(window) = Σ mfv / Σ volume   ∈ [-1,1]   (ölçek-bağımsız yoğunluk)
 *
 * Trend = OBV eğimi işareti (son 5 gün = current, 6-15 gün = previous).
 *
 * GELECEK (gerçek takas): aynı SmartMoneyInput'u dönen TakasbankSmartMoneyProvider
 * yazılır, SMART_MONEY_SOURCE ile değiştirilir — motor/skor/sayfa değişmez.
 */

import type { OHLCVCandle } from '@/types'
import { computeObvTrend } from '../candle-microstructure'
import type { SmartMoneyInput, SmartMoneyProvider, FlowTrend } from './types'

function mfMultiplier(c: OHLCVCandle): number {
  const range = c.high - c.low
  if (range <= 0) return 0
  return ((c.close - c.low) - (c.high - c.close)) / range
}

/** Pencere normalize para-akışı yoğunluğu: Σ mfv / Σ volume ∈ [-1,1] */
function netFlow(candles: OHLCVCandle[]): number {
  let mfv = 0
  let vol = 0
  for (const c of candles) {
    mfv += mfMultiplier(c) * c.volume
    vol += c.volume
  }
  return vol > 0 ? Math.round((mfv / vol) * 1000) / 1000 : 0
}

/** OBV eğimi → trend yönü (eşik ±0.05 nötr bandı) */
function trendOf(candles: OHLCVCandle[]): FlowTrend {
  if (candles.length < 3) return 'neutral'
  const t = computeObvTrend(candles)
  if (t > 0.05) return 'buying'
  if (t < -0.05) return 'selling'
  return 'neutral'
}

export class OhlcvSmartMoneyProvider implements SmartMoneyProvider {
  get(_symbol: string, candles: OHLCVCandle[]): SmartMoneyInput {
    const n = candles.length
    const last1 = candles.slice(-1)
    const last5 = candles.slice(-5)
    const last20 = candles.slice(-20)

    // Ardışık "alım günü" (mfMultiplier > 0) serisi — sondan geriye
    let consistent = 0
    for (let i = n - 1; i >= 0; i--) {
      if (mfMultiplier(candles[i]) > 0) consistent++
      else break
    }

    // Yeni alıcı proxy'si: up-close + hacim patlaması (rel5 ≥ 1.8) + 20g tepe kırılımı
    let newBuyer = false
    if (n >= 22) {
      const last = candles[n - 1]
      const prev = candles[n - 2]
      const prev5 = candles.slice(-6, -1)
      const avg5 = prev5.reduce((a, c) => a + c.volume, 0) / prev5.length
      const relVol = avg5 > 0 ? last.volume / avg5 : 0
      const prior20High = Math.max(...candles.slice(-21, -1).map((c) => c.high))
      newBuyer = last.close > prev.close && relVol >= 1.8 && last.close >= prior20High
    }

    return {
      net_flow_1d: netFlow(last1),
      net_flow_5d: netFlow(last5),
      net_flow_20d: netFlow(last20),
      consistent_buy_days: consistent,
      new_buyer_detected: newBuyer,
      current_trend: trendOf(candles.slice(-5)),
      previous_trend: trendOf(candles.slice(-15, -5)),
      source: 'ohlcv-proxy',
    }
  }
}

export const ohlcvSmartMoneyProvider = new OhlcvSmartMoneyProvider()
