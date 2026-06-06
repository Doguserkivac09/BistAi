/**
 * İleriye dönük görünüm — büyüme-düzeltilmiş ("GARP") değerleme verdict'i.
 *
 * Saf görece değerleme geriye dönüktür: yüksek çarpan, üstün büyüme + kalite +
 * analist desteğiyle HAKLI olabilir (örn. ASELS). Bu motor değerlemeyi
 * (Faz 2B relativeScore) büyüme-kalite-analist ekseniyle birleştirip 2×2 verdict üretir.
 */

import type { YahooFundamentals } from './yahoo-fundamentals'

export interface AnalystMomentum {
  recommendationMean: number | null
  recommendationLabel: string | null
  targetUpside: number | null // %
  numAnalysts: number | null
}

export interface GrowthQuality {
  score: number // 0-100
  realEarningsGrowth: number | null // ratio (BIST: enflasyona göre reel)
  revenueGrowth: number | null
  marginExpanding: boolean | null
  roeVsSectorPct: number | null // sektör medyanına göre ROE farkı (%)
  roe: number | null
}

export type VerdictCell = 'firsat' | 'tuzak' | 'pahali-hakli' | 'pahali-gerceksiz'
export interface ForwardVerdict {
  cell: VerdictCell
  label: string
  explanation: string
  valuationCheap: boolean
  growthStrong: boolean
}

export interface ForwardOutlook {
  analyst: AnalystMomentum
  growthQuality: GrowthQuality
  verdict: ForwardVerdict | null // sektör görece verisi yoksa null
  catalystCount: number
}

function normalize(v: number | null, min: number, max: number): number | null {
  if (v === null || !isFinite(v) || max === min) return null
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
}

function recLabel(mean: number | null): string | null {
  if (mean === null) return null
  if (mean <= 1.5) return 'Güçlü Al'
  if (mean <= 2.5) return 'Al'
  if (mean <= 3.5) return 'Tut'
  if (mean <= 4.5) return 'Sat'
  return 'Güçlü Sat'
}

export function computeAnalystMomentum(f: YahooFundamentals): AnalystMomentum {
  const targetUpside =
    f.targetMeanPrice !== null && f.currentPrice !== null && f.currentPrice > 0
      ? Math.round(((f.targetMeanPrice - f.currentPrice) / f.currentPrice) * 1000) / 10
      : null
  return {
    recommendationMean: f.recommendationMean,
    recommendationLabel: recLabel(f.recommendationMean),
    targetUpside,
    numAnalysts: f.numberOfAnalystOpinions,
  }
}

export function computeGrowthQuality(
  f: YahooFundamentals,
  opts: { inflationYoy?: number | null; roeVsSectorPct?: number | null } = {},
): GrowthQuality {
  const { inflationYoy = null, roeVsSectorPct = null } = opts

  // Reel net kâr büyümesi (BIST: enflasyona göre)
  let realEarnings = f.earningsGrowth
  if (realEarnings !== null && inflationYoy !== null && isFinite(inflationYoy)) {
    realEarnings = (1 + realEarnings) / (1 + inflationYoy / 100) - 1
  }

  const marginExpanding =
    f.earningsGrowth !== null && f.revenueGrowth !== null ? f.earningsGrowth > f.revenueGrowth : null

  // Bileşenler
  const earnScore = normalize(realEarnings, -0.10, 0.50) // -%10..+%50 reel
  // ROE: sektöre göre fark varsa onu, yoksa mutlak ROE
  const roeScore =
    roeVsSectorPct !== null
      ? normalize(roeVsSectorPct, -50, 50)
      : normalize(f.returnOnEquity, 0, 0.30)
  // Analist: konsensüs + hedef getiri
  const consensusScore = f.recommendationMean !== null && f.recommendationMean > 0
    ? Math.max(0, Math.min(100, ((5 - f.recommendationMean) / 4) * 100))
    : null
  const upside = f.targetMeanPrice !== null && f.currentPrice !== null && f.currentPrice > 0
    ? ((f.targetMeanPrice - f.currentPrice) / f.currentPrice) * 100
    : null
  const upsideScore = normalize(upside, -20, 30)
  const analystScore = consensusScore !== null && upsideScore !== null
    ? (consensusScore + upsideScore) / 2
    : consensusScore ?? upsideScore

  // Ağırlıklı (null bileşenler dışlanıp normalize)
  const parts: Array<{ s: number | null; w: number }> = [
    { s: earnScore, w: 0.40 },
    { s: roeScore, w: 0.30 },
    { s: analystScore, w: 0.30 },
  ]
  const present = parts.filter((p) => p.s !== null)
  const sumW = present.reduce((a, p) => a + p.w, 0)
  let score = present.length > 0 ? present.reduce((a, p) => a + (p.s as number) * (p.w / sumW), 0) : 50
  if (marginExpanding) score = Math.min(100, score + 8) // marj genişlemesi bonusu

  return {
    score: Math.round(score),
    realEarningsGrowth: realEarnings,
    revenueGrowth: f.revenueGrowth,
    marginExpanding,
    roeVsSectorPct,
    roe: f.returnOnEquity,
  }
}

export function computeVerdict(relativeScore: number, growthQualityScore: number): ForwardVerdict {
  const valuationCheap = relativeScore >= 50 // sektöre göre ucuz tarafta
  const growthStrong = growthQualityScore >= 55

  let cell: VerdictCell
  let label: string
  let explanation: string

  if (valuationCheap && growthStrong) {
    cell = 'firsat'
    label = '🟢 Fırsat — ucuz + güçlü büyüme/kalite'
    explanation = 'Sektöre göre ucuz ve büyüme/kalite güçlü. Klasik değer-büyüme tatlı noktası.'
  } else if (valuationCheap && !growthStrong) {
    cell = 'tuzak'
    label = '🟡 Dikkat — ucuz ama büyüme/kalite zayıf'
    explanation = 'Ucuz görünüyor ama büyüme/kalite zayıf — değer tuzağı olabilir, katalist arayın.'
  } else if (!valuationCheap && growthStrong) {
    cell = 'pahali-hakli'
    label = '🔵 Pahalı ama haklı — prim büyüme/kaliteyle destekleniyor'
    explanation = 'Çoklu çarpanda pahalı; ancak üstün büyüme, kârlılık ve analist desteği primi haklı çıkarıyor. Uzun vade yönü yukarı.'
  } else {
    cell = 'pahali-gerceksiz'
    label = '🔴 Gerçekten pahalı — prim gerekçesiz'
    explanation = 'Hem pahalı hem büyüme/kalite zayıf — prim için temel gerekçe sınırlı.'
  }

  return { cell, label, explanation, valuationCheap, growthStrong }
}
