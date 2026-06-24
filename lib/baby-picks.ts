/**
 * Bebek Hisseler — İleriye Dönük Takip (FAZ 4) saf yardımcıları.
 *
 * - selectBabyPicks: haftalık snapshot için modelin EN TEMİZ adaylarını seçer
 *   (disiplinli: güçlü/umut + risksiz + likit). Honest cohort → dürüst hit-rate.
 * - computeBabyPicksPerformance: değerlendirilmiş pick'lerden ufuk bazlı hit-rate
 *   + ortalama getiri + BIST'i geçme oranı.
 *
 * Saf/deterministik — cron'lar ve testler aynı mantığı kullanır.
 */

import type { BabyRow } from './baby-runner'

export const HORIZONS = [
  { key: '4w', weeks: 4, label: '1 ay' },
  { key: '12w', weeks: 12, label: '3 ay' },
  { key: '26w', weeks: 26, label: '6 ay' },
] as const

export type HorizonKey = (typeof HORIZONS)[number]['key']

/** Snapshot'a girmeyi engelleyen "tehlike" rozetleri (disiplinli kohort) */
const DANGER_FLAGS = ['🎭 olası operasyon', '📉 düşen bıçak', '🔒 çok düşük float']

export interface BabyPickSnapshot {
  sembol: string
  sector_id: string
  baby_score: number
  verdict: string
  components: BabyRow['components']
  risk_flags: string[]
  free_float: number | null
  market_cap: number | null
  pos52: number
  range_width: number
  entry_price: number
}

/**
 * Haftalık takip kohortu — modelin en temiz, en yüksek-güvenli adayları.
 * Kriter: babyScore ≥ minScore + verdict güçlü/umut + tehlike rozeti YOK +
 * likit (ADV ≥ minAdv). Skora göre sıralı, en fazla maxPicks.
 */
export function selectBabyPicks(
  rows: BabyRow[],
  opts: { minScore?: number; minAdvTL?: number; maxPicks?: number } = {},
): BabyPickSnapshot[] {
  const minScore = opts.minScore ?? 65
  const minAdvTL = opts.minAdvTL ?? 3_000_000
  const maxPicks = opts.maxPicks ?? 25

  return rows
    .filter(
      (r) =>
        r.babyScore >= minScore &&
        (r.verdict === 'güçlü kurulum' || r.verdict === 'umut vadeden') &&
        !r.riskFlags.some((f) => DANGER_FLAGS.includes(f)) &&
        (r.advTL ?? 0) >= minAdvTL &&
        r.lastClose !== null &&
        r.lastClose > 0,
    )
    .sort((a, b) => b.babyScore - a.babyScore)
    .slice(0, maxPicks)
    .map((r) => ({
      sembol: r.sembol,
      sector_id: r.sector,
      baby_score: r.babyScore,
      verdict: r.verdict,
      components: r.components,
      risk_flags: r.riskFlags,
      free_float: r.freeFloat,
      market_cap: r.marketCap,
      pos52: r.pos52,
      range_width: r.rangeWidth,
      entry_price: r.lastClose as number,
    }))
}

// ── Performans özeti ──────────────────────────────────────────────────────────

export interface EvaluatedPick {
  ret_4w: number | null
  bist_ret_4w: number | null
  ret_12w: number | null
  bist_ret_12w: number | null
  ret_26w: number | null
  bist_ret_26w: number | null
}

export interface HorizonStat {
  key: HorizonKey
  label: string
  n: number // değerlendirilen pick sayısı
  winRate: number | null // getiri > 0 oranı (%)
  beatRate: number | null // BIST'i geçme oranı (%)
  avgReturn: number | null // ortalama getiri (%)
  avgBistReturn: number | null // ortalama BIST getirisi (%)
  alpha: number | null // avgReturn − avgBistReturn (puan)
}

export interface BabyPicksPerformance {
  totalPicks: number
  horizons: HorizonStat[]
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
const r1 = (x: number) => Math.round(x * 10) / 10

export function computeBabyPicksPerformance(rows: EvaluatedPick[]): BabyPicksPerformance {
  const horizons: HorizonStat[] = HORIZONS.map((h) => {
    const retKey = `ret_${h.key}` as keyof EvaluatedPick
    const bistKey = `bist_ret_${h.key}` as keyof EvaluatedPick
    const evaluated = rows.filter((r) => r[retKey] !== null)
    const rets = evaluated.map((r) => r[retKey] as number)
    const withBist = evaluated.filter((r) => r[bistKey] !== null)
    const n = evaluated.length

    return {
      key: h.key,
      label: h.label,
      n,
      winRate: n > 0 ? r1((rets.filter((x) => x > 0).length / n) * 100) : null,
      beatRate:
        withBist.length > 0
          ? r1(
              (withBist.filter((r) => (r[retKey] as number) > (r[bistKey] as number)).length /
                withBist.length) *
                100,
            )
          : null,
      avgReturn: n > 0 ? r1(mean(rets)) : null,
      avgBistReturn: withBist.length > 0 ? r1(mean(withBist.map((r) => r[bistKey] as number))) : null,
      alpha:
        n > 0 && withBist.length > 0
          ? r1(mean(rets) - mean(withBist.map((r) => r[bistKey] as number)))
          : null,
    }
  })

  return { totalPicks: rows.length, horizons }
}
