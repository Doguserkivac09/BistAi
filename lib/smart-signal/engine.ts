/**
 * Akıllı Para + Teknik Sinyal Motoru — birleştirme (STEP 3/5).
 *
 *  total = technical_score + smart_money_score (0-17)
 *  status: 0-4 NEGATIVE | 5-8 NEUTRAL | 9-12 POSITIVE | 13+ STRONG
 *  action: Avoid | Watch | Consider | Strong Watch
 *
 * Saf/deterministik; istek-anı I/O yok. Çalıştırıcı (smart-signal-runner) mum
 * haritasını verir; AI özet (varsa) sonradan summary'yi geçersiz kılar.
 */

import type { OHLCVCandle } from '@/types'
import { computeMicrostructure } from '../candle-microstructure'
import { computeTechnicalScore } from './technical-score'
import { computeSmartMoneyScore } from './smart-money-score'
import { deriveTechnicalInput, type ScanRowLite } from './derive-technical'
import { computeRisk } from './risk'
import { detectBonusFlags } from './phase'
import { buildSummary } from './summary'
import { ohlcvSmartMoneyProvider } from './provider-ohlcv'
import type { SmartMoneyProvider, SmartSignalResult, SignalStatus, SignalAction } from './types'

export interface EngineScanRow extends ScanRowLite {
  last_close?: number | null
  change_percent?: number | null
}

/** Mikro-yapı için gereken minimum mum sayısı */
export const MIN_CANDLES = 30

function classify(total: number): SignalStatus {
  if (total >= 13) return 'STRONG'
  if (total >= 9) return 'POSITIVE'
  if (total >= 5) return 'NEUTRAL'
  return 'NEGATIVE'
}

const ACTION: Record<SignalStatus, SignalAction> = {
  NEGATIVE: 'Avoid',
  NEUTRAL: 'Watch',
  POSITIVE: 'Consider',
  STRONG: 'Strong Watch',
}

/**
 * Tek sembol için sonucu üretir. Yetersiz mumda null (çalıştırıcı atlar).
 * provider varsayılan OHLCV proxy; gerçek takas gelince aynı imzayla geçilir.
 */
export function runSmartSignal(
  symbol: string,
  candles: OHLCVCandle[],
  scan?: EngineScanRow,
  provider: SmartMoneyProvider = ohlcvSmartMoneyProvider,
): SmartSignalResult | null {
  if (!candles || candles.length < MIN_CANDLES) return null

  const micro = computeMicrostructure(candles)
  const t = deriveTechnicalInput(candles, scan)
  const sm = provider.get(symbol, candles)

  const technical_score = computeTechnicalScore(t)
  const smart_money_score = computeSmartMoneyScore(sm)
  const total_score = technical_score + smart_money_score
  const status = classify(total_score)

  // 52H aralığındaki konum (60-mum yaklaşığı; aşırı-uzama/dağıtım için yeterli)
  const pos52 =
    micro.lastClose !== null && micro.candleHigh && micro.candleLow && micro.candleHigh > micro.candleLow
      ? (micro.lastClose - micro.candleLow) / (micro.candleHigh - micro.candleLow)
      : null

  const risk = computeRisk(t, sm, {
    atrPctDaily: micro.atrPctDaily,
    recentVerticalSpike: micro.recentVerticalSpike,
    pos52,
  })

  const flags = detectBonusFlags(t, sm, {
    obvTrend: micro.obvTrend,
    priceSlope60: micro.priceSlope60,
    pos52,
  })

  const summary = buildSummary({ status, technical: t, smartMoney: sm, flags })

  return {
    symbol,
    status,
    technical_score,
    smart_money_score,
    total_score,
    risk,
    action: ACTION[status],
    summary,
    flags,
    smart_money_source: sm.source,
    price: scan?.last_close ?? micro.lastClose,
    changePercent: scan?.change_percent ?? null,
  }
}
