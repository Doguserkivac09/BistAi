/**
 * Temel Analiz Sağlık Motoru — Piotroski F-Score, Altman Z'', kazanç kalitesi, trend.
 * Saf TypeScript, deterministik. Girdi: fetchFinancialStatements() çıktısı (5 yıl).
 *
 * Banka/finansal şirketlerde Piotroski (brüt marj, cari oran) ve Altman (işletme
 * sermayesi, EBIT) hesaplanamaz → applicable=false döner, UI "uygulanmaz" gösterir.
 */

import type { FinancialYear } from './financial-statements'
import { isFinancialSector } from './financial-statements'

// ── Piotroski F-Score (0-9) ────────────────────────────────────────────────

export interface PiotroskiCriterion {
  key: string
  label: string
  pass: boolean | null // null = hesaplanamadı
}
export interface PiotroskiResult {
  applicable: boolean
  reason?: string // applicable=false ise açıklama
  score: number | null // 0-9
  max: number
  criteria: PiotroskiCriterion[]
  rating: 'güçlü' | 'orta' | 'zayıf' | null
}

function safeDiv(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null
  return a / b
}

export function computePiotroski(years: FinancialYear[]): PiotroskiResult {
  const empty = (reason: string): PiotroskiResult => ({
    applicable: false, reason, score: null, max: 9, criteria: [], rating: null,
  })

  if (isFinancialSector(years)) return empty('Bankalar/finansal şirketler için uygulanmaz (brüt marj, cari oran raporlanmaz)')
  if (years.length < 2) return empty('Yetersiz geçmiş veri (en az 2 yıl gerekir)')

  const t = years[years.length - 1]
  const p = years[years.length - 2]

  const roaT = safeDiv(t.netIncome, t.totalAssets)
  const roaP = safeDiv(p.netIncome, p.totalAssets)
  const levT = safeDiv(t.longTermDebt, t.totalAssets)
  const levP = safeDiv(p.longTermDebt, p.totalAssets)
  const curT = safeDiv(t.currentAssets, t.currentLiabilities)
  const curP = safeDiv(p.currentAssets, p.currentLiabilities)
  const gmT = safeDiv(t.grossProfit, t.revenue)
  const gmP = safeDiv(p.grossProfit, p.revenue)
  const atT = safeDiv(t.revenue, t.totalAssets)
  const atP = safeDiv(p.revenue, p.totalAssets)

  const c = (key: string, label: string, pass: boolean | null): PiotroskiCriterion => ({ key, label, pass })

  const criteria: PiotroskiCriterion[] = [
    c('roa', 'Pozitif kârlılık (ROA > 0)', roaT === null ? null : roaT > 0),
    c('cfo', 'Pozitif faaliyet nakit akışı', t.operatingCashFlow === null ? null : t.operatingCashFlow > 0),
    c('droa', 'ROA artıyor (ΔROA > 0)', roaT === null || roaP === null ? null : roaT > roaP),
    c('accruals', 'Nakit akışı > net kâr (kazanç kalitesi)',
      t.operatingCashFlow === null || t.netIncome === null ? null : t.operatingCashFlow > t.netIncome),
    c('lev', 'Uzun vadeli borç/varlık azalıyor', levT === null || levP === null ? null : levT < levP),
    c('cur', 'Cari oran artıyor', curT === null || curP === null ? null : curT > curP),
    c('shares', 'Hisse seyrelmesi yok', t.shares === null || p.shares === null ? null : t.shares <= p.shares * 1.01),
    c('margin', 'Brüt marj artıyor', gmT === null || gmP === null ? null : gmT > gmP),
    c('turnover', 'Varlık devir hızı artıyor', atT === null || atP === null ? null : atT > atP),
  ]

  const computable = criteria.filter((x) => x.pass !== null)
  if (computable.length < 5) return empty('Yetersiz veri (kriterlerin çoğu hesaplanamadı)')

  const score = computable.reduce((s, x) => s + (x.pass ? 1 : 0), 0)
  const rating = score >= 7 ? 'güçlü' : score >= 4 ? 'orta' : 'zayıf'
  return { applicable: true, score, max: 9, criteria, rating }
}

// ── Altman Z''-Score (gelişmekte olan piyasa / üretim-dışı varyant) ─────────
// Z'' = 3.25 + 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4
//   X1 = işletme sermayesi / toplam varlık
//   X2 = dağıtılmamış kâr / toplam varlık
//   X3 = EBIT / toplam varlık
//   X4 = özsermaye / toplam yabancı kaynak
// Bölge: >2.6 güvenli · 1.1-2.6 gri · <1.1 sıkıntı

export interface AltmanResult {
  applicable: boolean
  reason?: string
  z: number | null
  zone: 'güvenli' | 'gri' | 'sıkıntı' | null
  components: { x1: number | null; x2: number | null; x3: number | null; x4: number | null }
  variant: string
}

export function computeAltman(years: FinancialYear[]): AltmanResult {
  const empty = (reason: string): AltmanResult => ({
    applicable: false, reason, z: null, zone: null,
    components: { x1: null, x2: null, x3: null, x4: null }, variant: "Z''",
  })

  if (isFinancialSector(years)) return empty('Bankalar/finansal şirketler için uygulanmaz (işletme sermayesi/EBIT yapısı farklı)')
  if (years.length === 0) return empty('Veri yok')

  const t = years[years.length - 1]
  const ta = t.totalAssets
  if (ta === null || ta === 0) return empty('Toplam varlık verisi yok')

  const wc = t.currentAssets !== null && t.currentLiabilities !== null
    ? t.currentAssets - t.currentLiabilities : null
  const x1 = safeDiv(wc, ta)
  const x2 = safeDiv(t.retainedEarnings, ta)
  const x3 = safeDiv(t.ebit, ta)
  const x4 = safeDiv(t.equity, t.totalLiabilities)

  if (x1 === null || x2 === null || x3 === null || x4 === null) {
    return empty('Yetersiz bilanço kalemi (işletme sermayesi/EBIT/dağıtılmamış kâr)')
  }

  const z = 3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
  const zone = z > 2.6 ? 'güvenli' : z >= 1.1 ? 'gri' : 'sıkıntı'
  return { applicable: true, z: Math.round(z * 100) / 100, zone, components: { x1, x2, x3, x4 }, variant: "Z''" }
}

// ── Kazanç kalitesi ─────────────────────────────────────────────────────────

export interface EarningsQuality {
  accrualsRatio: number | null  // (net kâr − faaliyet nakit akışı)/varlık — düşük/negatif = iyi
  fcfConversion: number | null  // serbest nakit akışı / net kâr — yüksek = iyi
  fcfPositiveYears: number      // son dönemlerde kaç yıl FCF pozitif
  totalYears: number
  rating: 'iyi' | 'orta' | 'zayıf' | null
}

export function computeEarningsQuality(years: FinancialYear[]): EarningsQuality {
  if (years.length === 0) {
    return { accrualsRatio: null, fcfConversion: null, fcfPositiveYears: 0, totalYears: 0, rating: null }
  }
  const t = years[years.length - 1]
  const accrualsRatio = t.netIncome !== null && t.operatingCashFlow !== null && t.totalAssets
    ? Math.round(((t.netIncome - t.operatingCashFlow) / t.totalAssets) * 1000) / 1000
    : null
  const fcfConversion = t.freeCashFlow !== null && t.netIncome !== null && t.netIncome > 0
    ? Math.round((t.freeCashFlow / t.netIncome) * 100) / 100
    : null
  const fcfYears = years.filter((y) => y.freeCashFlow !== null)
  const fcfPositiveYears = fcfYears.filter((y) => (y.freeCashFlow as number) > 0).length

  let rating: EarningsQuality['rating'] = null
  if (accrualsRatio !== null || fcfConversion !== null) {
    const goodAccruals = accrualsRatio === null || accrualsRatio < 0.05
    const goodFcf = fcfConversion === null || fcfConversion > 0.6
    rating = goodAccruals && goodFcf ? 'iyi' : goodAccruals || goodFcf ? 'orta' : 'zayıf'
  }
  return { accrualsRatio, fcfConversion, fcfPositiveYears, totalYears: fcfYears.length, rating }
}

// ── Trend / CAGR ──────────────────────────────────────────────────────────

export interface TrendResult {
  revenueCagr: number | null      // nominal yıllık bileşik büyüme (%)
  netIncomeCagr: number | null
  netMarginTrend: Array<{ year: number; value: number }>  // net marj % zaman serisi (enflasyondan bağımsız)
  grossMarginTrend: Array<{ year: number; value: number }>
  revenueSeries: Array<{ year: number; value: number }>
  netIncomeSeries: Array<{ year: number; value: number }>
  years: number
}

function cagr(first: number | null, last: number | null, periods: number): number | null {
  if (first === null || last === null || periods < 1) return null
  if (first <= 0 || last <= 0) return null // negatif/sıfır tabanda CAGR anlamsız
  return Math.round((Math.pow(last / first, 1 / periods) - 1) * 1000) / 10
}

export function computeTrends(years: FinancialYear[]): TrendResult {
  const n = years.length
  const revSeries = years.filter((y) => y.revenue !== null).map((y) => ({ year: y.year, value: y.revenue as number }))
  const niSeries = years.filter((y) => y.netIncome !== null).map((y) => ({ year: y.year, value: y.netIncome as number }))

  const netMarginTrend = years
    .filter((y) => y.netIncome !== null && y.revenue && y.revenue !== 0)
    .map((y) => ({ year: y.year, value: Math.round(((y.netIncome as number) / (y.revenue as number)) * 1000) / 10 }))
  const grossMarginTrend = years
    .filter((y) => y.grossProfit !== null && y.revenue && y.revenue !== 0)
    .map((y) => ({ year: y.year, value: Math.round(((y.grossProfit as number) / (y.revenue as number)) * 1000) / 10 }))

  const revFirst = revSeries[0]?.value ?? null
  const revLast = revSeries[revSeries.length - 1]?.value ?? null
  const niFirst = niSeries[0]?.value ?? null
  const niLast = niSeries[niSeries.length - 1]?.value ?? null

  return {
    revenueCagr: cagr(revFirst, revLast, Math.max(1, revSeries.length - 1)),
    netIncomeCagr: cagr(niFirst, niLast, Math.max(1, niSeries.length - 1)),
    netMarginTrend,
    grossMarginTrend,
    revenueSeries: revSeries,
    netIncomeSeries: niSeries,
    years: n,
  }
}

// ── Birleşik ────────────────────────────────────────────────────────────────

export interface FundamentalHealth {
  isFinancial: boolean
  piotroski: PiotroskiResult
  altman: AltmanResult
  earningsQuality: EarningsQuality
  trends: TrendResult
}

export function computeFundamentalHealth(years: FinancialYear[]): FundamentalHealth {
  return {
    isFinancial: isFinancialSector(years),
    piotroski: computePiotroski(years),
    altman: computeAltman(years),
    earningsQuality: computeEarningsQuality(years),
    trends: computeTrends(years),
  }
}
