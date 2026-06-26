/**
 * STEP 2 — Akıllı Para Skoru (0-10), saf/deterministik.
 *
 *  consistent_buy_days: 1-3 → +1 | 4-10 → +2 | 10+ → +3
 *  net_flow_20d güçlü pozitif → +3
 *  new_buyer_detected → +2
 *  trend değişimi (selling → buying) → +3
 *
 * net_flow_20d NORMALİZE yoğunluktur (~[-1,1]); "güçlü pozitif" = eşik üstü.
 */

import type { SmartMoneyInput } from './types'

/** 20g normalize para-akışı yoğunluğu bunun üstündeyse "güçlü pozitif" */
export const STRONG_FLOW_THRESHOLD = 0.1

export function computeSmartMoneyScore(s: SmartMoneyInput): number {
  let score = 0

  const d = s.consistent_buy_days
  if (d > 10) score += 3
  else if (d >= 4) score += 2
  else if (d >= 1) score += 1

  if (s.net_flow_20d >= STRONG_FLOW_THRESHOLD) score += 3
  if (s.new_buyer_detected) score += 2
  if (s.previous_trend === 'selling' && s.current_trend === 'buying') score += 3

  return Math.min(10, score)
}
