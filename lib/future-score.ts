import { Fundamentals } from './yahoo-fundamentals'

/**
 * Future Brightness Score — 7 bileşen, toplam ağırlık %100.
 *
 *  | Bileşen              | Ağırlık | Kaynak                                   |
 *  |----------------------|---------|------------------------------------------|
 *  | Revenue Growth       | %22     | revenueGrowth (BIST: enflasyona göre reel)|
 *  | Analyst Upside       | %18     | targetUpside                             |
 *  | Analyst Consensus    | %15     | recommendationMean (1-5)                 |
 *  | EPS Growth Trend     | %15     | epsForward vs epsDiluted                 |
 *  | Insider Activity     | %15     | insiderBuySellRatio                      |
 *  | PEG / Valuation      | %10     | peRatio / revenueGrowth (+ BIST export)  |
 *  | Institutional        | %5      | institutionalPct                         |
 *
 * Eski "News Momentum" ve "Partnership" atıl ağırlıkları (her zaman 50)
 * gerçek metriklerle (Analyst Consensus, EPS Growth) değiştirildi.
 *
 * DB kolon eşlemesi (migration gerektirmemek için yeniden amaçlandırıldı):
 *   revenue_score=revenue · analyst_score=upside · news_score=consensus
 *   partnership_score=eps · insider_score=insider · balance_score=peg
 *   institutional_score=institutional
 */
export interface FutureScoreBreakdown {
  score: number // 0-100
  revenueScore: number
  analystScore: number       // analist hedef yükseliş potansiyeli
  consensusScore: number     // analist tavsiye konsensüsü (recommendationMean)
  epsScore: number           // EPS büyüme trendi (forward vs trailing)
  insiderScore: number
  pegScore: number           // PEG / değerleme kalitesi (+ BIST export bonus)
  institutionalScore: number
  realRevenueGrowth: number | null // BIST: enflasyondan arındırılmış büyüme (%), US: null
  summary: string
}

export interface FutureScoreOptions {
  /** BIST: yıllık TÜFE yüzdesi (örn 30.87). Verilirse revenueGrowth reel'e çevrilir. */
  inflationYoy?: number | null
  /** BIST: ihracat/döviz geliri bonusu (0-20). pegScore'a eklenir, 100 ile sınırlı. */
  exportBonus?: number
}

// Lineer normalizasyon → 0-100 (sınırlar dışında klip). null → nötr 50.
function normalize(value: number | null, min: number, max: number): number {
  if (value === null || value === undefined || !isFinite(value)) return 50
  if (max === min) return 50
  const pct = ((value - min) / (max - min)) * 100
  return Math.max(0, Math.min(100, pct))
}

// Fisher: reel = (1 + nominal) / (1 + enflasyon) - 1. Hepsi yüzde girilir/çıkar.
function toRealGrowthPct(nominalPct: number, inflationYoyPct: number): number {
  return ((1 + nominalPct / 100) / (1 + inflationYoyPct / 100) - 1) * 100
}

// recommendationMean (1=strongBuy .. 5=strongSell) → 0-100
function consensusFromMean(mean: number): number {
  // mean 1 → 100, 3 → 50, 5 → 0
  return Math.max(0, Math.min(100, ((5 - mean) / 4) * 100))
}

// recommendationKey string → 0-100 (mean yoksa yedek)
function consensusFromKey(key: string): number {
  switch (key.toLowerCase().replace(/[\s_-]/g, '')) {
    case 'strongbuy': return 100
    case 'buy':       return 75
    case 'hold':      return 50
    case 'sell':      return 25
    case 'strongsell':return 0
    default:          return 50
  }
}

// PEG bandı → 0-100. revenueGrowthPct yüzde (15 = %15). peRatio trailing P/E.
function pegScoreFrom(peRatio: number | null, revenueGrowthPct: number | null): number {
  if (peRatio === null) return 50               // bilinmiyor
  if (peRatio <= 0) return 40                    // negatif kazanç → büyüme şirketi, cezalandırma
  if (revenueGrowthPct === null) return 50
  if (revenueGrowthPct <= 0) return 30           // pozitif F/K + büyüme yok → pahalı
  const peg = peRatio / revenueGrowthPct
  if (peg < 0.5) return 100
  if (peg < 1) return 75
  if (peg < 2) return 50
  return 25
}

export function computeFutureScore(
  fundamentals: Fundamentals,
  opts: FutureScoreOptions = {},
): FutureScoreBreakdown {
  const { inflationYoy = null, exportBonus = 0 } = opts
  // Geçerli enflasyon (BIST) → reel düzeltme uygulanır. US'te null.
  const infl = (inflationYoy !== null && isFinite(inflationYoy)) ? inflationYoy : null

  // ── %22 Revenue Growth (BIST'te enflasyona göre reel) ──────────────────
  // Yüksek enflasyon ortamında reel gelir küçülmesi olağandır → BIST'te
  // band genişletilir (–30..40) ki nominal<enflasyon olan sağlam şirket
  // sıfıra ezilmesin. US'te dar band (–10..50).
  let revenueForScore = fundamentals.revenueGrowth
  let realRevenueGrowth: number | null = null
  if (revenueForScore !== null && infl !== null) {
    realRevenueGrowth = toRealGrowthPct(revenueForScore, infl)
    revenueForScore = realRevenueGrowth
  }
  const revenueScore = revenueForScore !== null
    ? normalize(revenueForScore, infl !== null ? -30 : -10, infl !== null ? 40 : 50)
    : 50

  // ── %18 Analyst Upside ─────────────────────────────────────────────────
  const analystScore = fundamentals.targetUpside !== null
    ? normalize(fundamentals.targetUpside, -20, 30)
    : 50

  // ── %15 Analyst Consensus ──────────────────────────────────────────────
  let consensusScore = 50
  if (fundamentals.recommendationMean !== null && fundamentals.recommendationMean > 0) {
    consensusScore = consensusFromMean(fundamentals.recommendationMean)
  } else if (fundamentals.recommendation) {
    consensusScore = consensusFromKey(fundamentals.recommendation)
  }

  // ── %15 Earnings/EPS Growth (net kâr büyümesi ÖNCELİKLİ) ───────────────
  // Birincil: earningsGrowth (YoY net kâr, BIST'te enflasyona göre reel).
  // Yedek: forward vs trailing EPS. İkisi de yoksa nötr 50.
  let epsScore = 50
  let earningsForScore = fundamentals.earningsGrowth   // ratio (0.86 = %86)
  if (earningsForScore !== null && infl !== null) {
    earningsForScore = (1 + earningsForScore) / (1 + infl / 100) - 1 // reel
  }
  if (earningsForScore !== null && isFinite(earningsForScore)) {
    epsScore = normalize(earningsForScore, -0.20, 0.60) // -%20 .. +%60 → 0..100
  } else if (
    fundamentals.epsForward !== null &&
    fundamentals.epsDiluted !== null &&
    fundamentals.epsDiluted !== 0
  ) {
    const ratio = (fundamentals.epsForward - fundamentals.epsDiluted) / Math.abs(fundamentals.epsDiluted)
    epsScore = normalize(ratio, -0.5, 1.0) // -%50 .. +%100
  }

  // ── %15 Insider Activity ───────────────────────────────────────────────
  const insiderScore = fundamentals.insiderBuySellRatio !== null
    ? ((fundamentals.insiderBuySellRatio + 1) / 2) * 100
    : 50

  // ── %10 PEG / Valuation (+ BIST export bonus) ──────────────────────────
  let pegScore = pegScoreFrom(fundamentals.peRatio, fundamentals.revenueGrowth)
  if (exportBonus) pegScore = Math.min(100, pegScore + exportBonus)

  // ── %5 Institutional Ownership ─────────────────────────────────────────
  const institutionalScore = fundamentals.institutionalPct !== null
    ? normalize(fundamentals.institutionalPct, 0, 50)
    : 50

  const totalScore =
    revenueScore * 0.22 +
    analystScore * 0.18 +
    consensusScore * 0.15 +
    epsScore * 0.15 +
    insiderScore * 0.15 +
    pegScore * 0.10 +
    institutionalScore * 0.05

  return {
    score: Math.round(Math.max(0, Math.min(100, totalScore))),
    revenueScore: Math.round(revenueScore),
    analystScore: Math.round(analystScore),
    consensusScore: Math.round(consensusScore),
    epsScore: Math.round(epsScore),
    insiderScore: Math.round(insiderScore),
    pegScore: Math.round(pegScore),
    institutionalScore: Math.round(institutionalScore),
    realRevenueGrowth: realRevenueGrowth !== null ? Math.round(realRevenueGrowth * 10) / 10 : null,
    summary: generateSummary({
      revenue: revenueForScore ?? 0,
      isReal: realRevenueGrowth !== null,
      earnings: earningsForScore,
      earningsIsReal: infl !== null,
      targetUpside: fundamentals.targetUpside ?? 0,
      consensus: consensusScore,
      insiderRatio: fundamentals.insiderBuySellRatio ?? 0,
      peRatio: fundamentals.peRatio,
      revenueGrowth: fundamentals.revenueGrowth,
    }),
  }
}

function generateSummary(data: {
  revenue: number
  isReal: boolean
  earnings: number | null
  earningsIsReal: boolean
  targetUpside: number
  consensus: number
  insiderRatio: number
  peRatio: number | null
  revenueGrowth: number | null
}): string {
  const strengths: string[] = []

  if (data.revenue > 15) {
    const r = data.revenue > 200 ? '>%200' : `${data.revenue.toFixed(1)}%`
    strengths.push(`${data.isReal ? 'reel ' : ''}${r} gelir büyümesi`)
  }
  if (data.earnings !== null && data.earnings > 0.20) {
    const e = data.earnings > 2 ? '>%200' : `+${(data.earnings * 100).toFixed(0)}%`
    strengths.push(`${data.earningsIsReal ? 'reel ' : ''}net kâr ${e}`)
  }
  if (data.targetUpside > 10) {
    strengths.push(`analist hedefi +${data.targetUpside.toFixed(1)}%`)
  }
  if (data.consensus >= 75) {
    strengths.push('güçlü analist konsensüsü')
  }
  if (data.insiderRatio > 0.3) {
    strengths.push('net insider alım')
  }
  if (data.peRatio !== null && data.peRatio > 0 && data.revenueGrowth && data.revenueGrowth > 0) {
    const peg = data.peRatio / data.revenueGrowth
    if (peg < 1) strengths.push(`cazip PEG (${peg.toFixed(2)})`)
  }

  if (strengths.length > 0) {
    return `Güçlü yönler: ${strengths.join(', ')}`
  }
  return 'Karışık sinyal — belirgin güçlü katalizör yok'
}

// CLI friendly score to color
export function scoreToColor(score: number): string {
  if (score >= 75) return '#10b981' // emerald
  if (score >= 60) return '#3b82f6' // blue
  if (score >= 45) return '#f59e0b' // amber
  return '#ef4444' // red
}

export function scoreToLabel(score: number): string {
  if (score >= 75) return 'Çok Parlak'
  if (score >= 60) return 'Parlak'
  if (score >= 45) return 'Nötr'
  return 'Karanlık'
}
