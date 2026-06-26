/**
 * BONUS tespiti (deterministik) — spec bonus:
 *   smart_money_entered · accumulation · distribution
 *
 * lib/market-phase.ts detectPhase (Wyckoff/RSI) + OBV/para-akışı işareti.
 */

import { detectPhase } from '../market-phase'
import type { TechnicalInput, SmartMoneyInput, BonusFlag } from './types'

export interface PhaseContext {
  obvTrend: number // ~[-1,1]
  priceSlope60: number // % (yatay ≈ 0)
  pos52: number | null
}

export function detectBonusFlags(
  t: TechnicalInput,
  sm: SmartMoneyInput,
  ctx: PhaseContext,
): BonusFlag[] {
  const flags: BonusFlag[] = []
  const phase = detectPhase(t.rsi)

  // Akıllı para girişi: satıştan alıma dönüş + hacim teyidi
  if (sm.previous_trend === 'selling' && sm.current_trend === 'buying' && t.volume_increase) {
    flags.push('smart_money_entered')
  }

  // Birikim: dip/birikim fazı (RSI<55) + para giriyor + fiyat ~yatay
  if (
    phase !== null &&
    (phase.phase === 1 || phase.phase === 2) &&
    ctx.obvTrend > 0.05 &&
    Math.abs(ctx.priceSlope60) < 15
  ) {
    flags.push('accumulation')
  }

  // Dağıtım: rally/aşırı-alım (RSI≥55) + para çıkıyor + tepeye yakın
  if (
    phase !== null &&
    (phase.phase === 3 || phase.phase === 4) &&
    ctx.obvTrend < -0.05 &&
    (ctx.pos52 === null || ctx.pos52 > 0.7)
  ) {
    flags.push('distribution')
  }

  return flags
}
