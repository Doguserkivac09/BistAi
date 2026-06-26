/**
 * STEP 4 — Risk seviyesi (deterministik).
 *
 *  RSI < 30 + güçlü alım → MEDIUM (olası dönüş)
 *  Aşırı-uzama (RSI > 70 / dikey sıçrama / 52H'ye yapışık) → HIGH
 *  Aksi → ATR%/RSI'ye göre LOW/MEDIUM
 */

import type { TechnicalInput, SmartMoneyInput, RiskLevel } from './types'

export interface RiskContext {
  atrPctDaily: number | null
  recentVerticalSpike: boolean
  pos52: number | null // 0-1 (52H aralığındaki konum); null = bilinmiyor
}

export function isStrongBuying(sm: SmartMoneyInput): boolean {
  return sm.current_trend === 'buying' && (sm.consistent_buy_days >= 4 || sm.net_flow_5d >= 0.1)
}

export function computeRisk(t: TechnicalInput, sm: SmartMoneyInput, ctx: RiskContext): RiskLevel {
  const rsi = t.rsi

  // 1) Aşırı satım + güçlü alım = olası rebound → MEDIUM (öncelik)
  if (rsi !== null && rsi < 30 && isStrongBuying(sm)) return 'MEDIUM'

  // 2) Aşırı-uzama → HIGH
  const overextended =
    (rsi !== null && rsi > 70) ||
    ctx.recentVerticalSpike ||
    (ctx.pos52 !== null && ctx.pos52 > 0.9)
  if (overextended) return 'HIGH'

  // 3) Aksi → volatilite / düşen-bıçak
  if (ctx.atrPctDaily !== null && ctx.atrPctDaily > 5) return 'MEDIUM'
  if (rsi !== null && rsi < 35 && !isStrongBuying(sm)) return 'MEDIUM' // dipte ama alım yok
  return 'LOW'
}
