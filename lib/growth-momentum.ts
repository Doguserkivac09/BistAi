/**
 * Temel Büyüme Momentumu — işi büyüyen, kârlılığı artan, EPS'i yükselen şirketleri
 * tek bir 0-100 skoruyla derecelendirir. Saf TypeScript, deterministik, test edilebilir.
 *
 * Girdi: fetchFinancialStatements() çıktısı (son 5 yıl, eskiden yeniye sıralı).
 * Hesaplama mantığı tamamen mevcut fundamental-health.ts üstüne kurulur (yeniden yazma yok):
 *   computeTrends      → revenueCagr / netIncomeCagr / netMarginTrend / seriler
 *   computeBeneish     → kazanç manipülasyonu kalite kapısı
 *   computePiotroski   → finansal sağlık kalite kapısı
 *   computeEarningsQuality → accruals / FCF dönüşümü
 *
 * KRİTİK: BIST'te nominal TL büyümesi enflasyonla REELLEŞTİRİLİR. Nominal %45 büyüyen
 * ama enflasyon %33 olan bir şirket reelde sadece ~%12 büyür; bunu skora yansıtmazsak
 * "büyüyor" sanılan ama reelde küçülen şirketleri yanlış yükseltiriz (future-score.ts'teki
 * FROTO/ASELS dersinin aynısı).
 *
 * Banka/finansal şirketler: gelir/marj yapısı farklı → applicable=false ("uygulanmaz").
 */

import type { FinancialYear } from './financial-statements'
import { isFinancialSector } from './financial-statements'
import {
  computeTrends,
  computePiotroski,
  computeBeneish,
  computeEarningsQuality,
} from './fundamental-health'

export interface GrowthMomentumBreakdown {
  applicable: boolean
  reason?: string
  score: number // 0-100 (uygulanamazsa 0)
  verdict: string
  components: {
    revenue: number // 0-100
    netIncome: number
    eps: number
    margin: number
    consistency: number
  }
  // Ham metrikler (UI + şeffaflık)
  revenueCagrNominal: number | null // %
  revenueCagrReal: number | null // % (BIST'te enflasyon düşülmüş; US'te = nominal)
  netIncomeCagrNominal: number | null
  netIncomeCagrReal: number | null
  epsCagr: number | null // % (reel)
  marginDeltaPP: number | null // net marj değişimi (puan)
  consistency01: number // 0-1
  epsSeries: Array<{ year: number; value: number }>
  quality: {
    beneishFlag: string | null
    piotroski: number | null
    eqRating: 'iyi' | 'orta' | 'zayıf' | null
    multiplier: number // 0.5-1 kalite çarpanı
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** Reel = nominal − enflasyon. US'te (inflationYoy null) reel = nominal. */
function realize(nominal: number | null, inflationYoy: number | null): number | null {
  if (nominal === null) return null
  if (inflationYoy === null) return nominal
  return Math.round((nominal - inflationYoy) * 10) / 10
}

/** Yıllık reel büyüme % → 0-100. 0%≈40, +37.5%≈100, −25%≈0. */
function growthScore(realPct: number | null): number {
  if (realPct === null) return 40 // negatif/sıfır tabanda CAGR hesaplanamadı → nötr
  return clamp(40 + realPct * 1.6, 0, 100)
}

function verdictFor(score: number): string {
  if (score >= 75) return 'güçlü büyüme'
  if (score >= 60) return 'büyüyor'
  if (score >= 45) return 'ılımlı'
  if (score >= 30) return 'yavaş/yatay'
  return 'küçülüyor'
}

export function computeGrowthMomentum(
  years: FinancialYear[],
  opts: { inflationYoy?: number | null } = {},
): GrowthMomentumBreakdown {
  const inf = opts.inflationYoy ?? null

  const fail = (reason: string): GrowthMomentumBreakdown => ({
    applicable: false,
    reason,
    score: 0,
    verdict: 'uygulanmaz',
    components: { revenue: 0, netIncome: 0, eps: 0, margin: 0, consistency: 0 },
    revenueCagrNominal: null,
    revenueCagrReal: null,
    netIncomeCagrNominal: null,
    netIncomeCagrReal: null,
    epsCagr: null,
    marginDeltaPP: null,
    consistency01: 0,
    epsSeries: [],
    quality: { beneishFlag: null, piotroski: null, eqRating: null, multiplier: 1 },
  })

  if (isFinancialSector(years)) return fail('Banka/finansal — gelir/marj büyüme mantığı farklı')
  if (years.length < 2) return fail('Yetersiz geçmiş veri (<2 yıl)')

  const trends = computeTrends(years)
  if (trends.revenueSeries.length < 2 && trends.netIncomeSeries.length < 2) {
    return fail('Gelir/net kâr serisi yetersiz')
  }

  // ── EPS serisi: netIncome / shares ────────────────────────────────────────
  const epsSeries = years
    .filter((y) => y.netIncome !== null && y.shares !== null && y.shares !== 0)
    .map((y) => ({
      year: y.year,
      value: Math.round(((y.netIncome as number) / (y.shares as number)) * 100) / 100,
    }))

  let epsCagrNominal: number | null = null
  if (epsSeries.length >= 2) {
    const f = epsSeries[0].value
    const l = epsSeries[epsSeries.length - 1].value
    if (f > 0 && l > 0) {
      epsCagrNominal = Math.round((Math.pow(l / f, 1 / (epsSeries.length - 1)) - 1) * 1000) / 10
    }
  }

  const revReal = realize(trends.revenueCagr, inf)
  const niReal = realize(trends.netIncomeCagr, inf)
  const epsReal = realize(epsCagrNominal, inf)

  // ── Net marj genişlemesi (puan) ───────────────────────────────────────────
  const nm = trends.netMarginTrend
  const marginDeltaPP =
    nm.length >= 2 ? Math.round((nm[nm.length - 1].value - nm[0].value) * 10) / 10 : null

  // ── Tutarlılık: gelir (yoksa net kâr) YoY pozitif oranı ────────────────────
  const series = trends.revenueSeries.length >= 2 ? trends.revenueSeries : trends.netIncomeSeries
  let pos = 0
  let comp = 0
  for (let i = 1; i < series.length; i++) {
    comp++
    if (series[i].value > series[i - 1].value) pos++
  }
  const consistency01 = comp > 0 ? pos / comp : 0

  // ── Bileşen skorları ──────────────────────────────────────────────────────
  const cRev = growthScore(revReal)
  const cNi = growthScore(niReal)
  // EPS tabanı negatifse (epsReal null) net kâr yönünü hafif iskontoyla yedek al
  const cEps = epsReal !== null ? growthScore(epsReal) : niReal !== null ? growthScore(niReal) * 0.9 : 40
  const cMargin = marginDeltaPP !== null ? clamp(50 + marginDeltaPP * 8, 0, 100) : 50
  const cCons = consistency01 * 100

  // ── Kalite kapısı (çarpan) ────────────────────────────────────────────────
  const ben = computeBeneish(years)
  const pio = computePiotroski(years)
  const eq = computeEarningsQuality(years)
  let mult = 1
  if (ben.applicable && ben.flag === 'şüpheli') mult *= 0.7 // kazanç manipülasyonu şüphesi
  if (pio.applicable && pio.score !== null && pio.score < 3) mult *= 0.85 // zayıf finansal sağlık
  if (eq.rating === 'zayıf') mult *= 0.9 // düşük kazanç kalitesi
  mult = Math.max(0.5, Math.round(mult * 100) / 100)

  const raw = cRev * 0.25 + cNi * 0.25 + cEps * 0.2 + cMargin * 0.15 + cCons * 0.15
  const score = Math.round(clamp(raw * mult, 0, 100))

  return {
    applicable: true,
    score,
    verdict: verdictFor(score),
    components: {
      revenue: Math.round(cRev),
      netIncome: Math.round(cNi),
      eps: Math.round(cEps),
      margin: Math.round(cMargin),
      consistency: Math.round(cCons),
    },
    revenueCagrNominal: trends.revenueCagr,
    revenueCagrReal: revReal,
    netIncomeCagrNominal: trends.netIncomeCagr,
    netIncomeCagrReal: niReal,
    epsCagr: epsReal,
    marginDeltaPP,
    consistency01,
    epsSeries,
    quality: {
      beneishFlag: ben.flag,
      piotroski: pio.score,
      eqRating: eq.rating,
      multiplier: mult,
    },
  }
}
