/**
 * Bebek Hisseler — `babyScore` (0-100): "henüz yükselmemiş, yüksek potansiyel" kurulumu.
 *
 * Patlamanın SONUCUNU değil KURULUMUNU skorlar. 5 katman (additive, renormalize'li)
 * × 2 çarpan (kalite kapısı + aşırı-uzama kapısı). Saf, deterministik, test edilebilir.
 * Tüm eşik/formüller BEBEK-HISSELER-PROMPTU.md §7 (Model v2) ile birebir.
 *
 *   scarcity 0.22 · accumulation 0.20 · ignition 0.18 · catalyst 0.15 · timing 0.25
 *   × qualityGate(0.40-1.0, DİSİPLİNLİ) × extendedGate(0.50-1.0)
 *
 * Girdiler önceden hesaplanmış primitiflerdir (mum mikro-yapısı + Yahoo temel + store'lar);
 * çalıştırıcı (baby-runner) bunları toplar. Bu modül hiçbir I/O yapmaz.
 */

export type CatalystState = 'fresh-positive' | 'supportive' | 'none' | 'conflicting'

export interface BabyScoreInputs {
  // ── Yapısal kıtlık ──
  freeFloat: number | null // 0-1 (floatShares/sharesOutstanding); null → nötr + ❓
  marketCap: number | null // TL
  // ── Likidite ──
  advTL: number | null // 20g ortalama TL hacim; <~1M → DIŞLA
  // ── Birikim izi (mum mikro-yapı) ──
  obvTrend: number // ~[-1,1]
  priceSlope60: number // % (12 = +%12)
  udvr: number // 0-1
  vcpRatio: number // >1 = daralma
  higherLowsCount: number // 0-2
  closeBelowSMA50: boolean
  // ── Temel ateşleme ──
  growthScore: number | null // 0-100 (banka/veri yok → null → pillar düşer)
  netIncomeCagrReal: number | null // %
  earningsGrowthReal: number | null // % (Yahoo earningsGrowth×100 − enflasyon)
  turnaround: boolean // epsSeries: ilk<0 & son>0
  growthVerdict: string | null
  isFinancial: boolean
  // ── Katalist & hikâye ──
  catalystState: CatalystState | null
  themeMember: boolean
  ipoMonths: number | null
  // ── Timing ("henüz yükselmemiş") ──
  pos52: number // 0-1
  rangeWidth: number // 52H/52L
  rsi14: number
  r60: number // ratio (0.25 = +%25)
  // ── Kalite kapısı ──
  beneishFlag: 'temiz' | 'gri' | 'şüpheli' | null
  piotroski: number | null
  altmanZone: 'güvenli' | 'gri' | 'sıkıntı' | null
  beta: number | null
  atrPctDaily: number | null
  recentVerticalSpike: boolean
}

export interface BabyScoreBreakdown {
  excluded: boolean
  reason?: string
  score: number
  verdict: string
  components: {
    scarcity: number
    accumulation: number
    ignition: number | null
    catalyst: number
    timing: number
  }
  qualityMultiplier: number
  extendedMultiplier: number
  componentsUsed: number
  riskFlags: string[]
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}
/** lo değerinden hi değerine doğrusal: t∈[0,1] */
function lerp(lo: number, hi: number, t: number): number {
  return lo + (hi - lo) * clamp(t, 0, 1)
}
const log10 = (x: number) => Math.log(x) / Math.LN10

/** ~1M TL altı ölü tahta → tamamen dışla */
const MIN_ADV_TL = 1_000_000
const SOFT_ADV_TL = 2_000_000

// ── 7.1 scarcity ─────────────────────────────────────────────────────────────
function floatScore(ff: number | null): number {
  if (ff === null) return 50
  if (ff <= 0.05) return 80
  if (ff <= 0.15) return 100
  if (ff < 0.6) return 100 - ((ff - 0.15) / (0.6 - 0.15)) * 80 // 0.15→100, 0.60→20
  return 20
}
function capScore(mc: number | null): number {
  if (mc === null || mc <= 0) return 50
  return clamp(100 - ((log10(mc) - 9.176) / 1.523) * 85, 15, 100) // 1.5B→100, 50B→15
}
function floatAdjScore(fac: number): number {
  if (fac <= 0) return 50
  return clamp(100 - ((log10(fac) - 8.477) / 1.699) * 85, 15, 100) // 300M→100, 15B→15
}
function scarcityPillar(i: BabyScoreInputs): number {
  const fl = floatScore(i.freeFloat)
  const cp = capScore(i.marketCap)
  if (i.freeFloat !== null && i.marketCap !== null && i.marketCap > 0) {
    const fa = floatAdjScore(i.marketCap * i.freeFloat)
    return 0.4 * fl + 0.35 * cp + 0.25 * fa
  }
  // floatAdj yoksa float+cap üzerine renormalize (0.40+0.35=0.75)
  return (0.4 * fl + 0.35 * cp) / 0.75
}

// ── 7.2 accumulation ──────────────────────────────────────────────────────────
function accumulationPillar(i: BabyScoreInputs): number {
  const obvBase = clamp(50 + i.obvTrend * 50, 0, 100)
  const stealth =
    i.priceSlope60 >= -5 && i.priceSlope60 <= 20 ? 1.1 : i.priceSlope60 > 50 ? 0.7 : 1.0
  const obvScore = clamp(obvBase * stealth, 0, 100)

  const udvrScore = clamp(((i.udvr - 0.4) / 0.25) * 100, 0, 100) // 0.40→0, 0.65→100
  const vcpScore = clamp(50 + (i.vcpRatio - 1.0) * 62.5, 0, 100) // 1.0→50, 1.8→100

  let baseScore = i.higherLowsCount === 2 ? 100 : i.higherLowsCount === 1 ? 65 : 30
  if (i.closeBelowSMA50 && i.priceSlope60 < -15) baseScore *= 0.6

  return 0.35 * obvScore + 0.3 * udvrScore + 0.2 * vcpScore + 0.15 * baseScore
}

// ── 7.3 ignition (banka/veri yok → null) ──────────────────────────────────────
function ignitionPillar(i: BabyScoreInputs): number | null {
  if (i.isFinancial || i.growthScore === null) return null

  let accelSub: number
  if (i.earningsGrowthReal !== null) {
    const accel = i.earningsGrowthReal - (i.netIncomeCagrReal ?? 0)
    accelSub = clamp(50 + accel * 1.2, 0, 100)
  } else {
    const v = i.growthVerdict ?? ''
    accelSub = v.includes('güçlü')
      ? 70
      : v.includes('büyüyor')
        ? 60
        : v.includes('ılımlı')
          ? 50
          : v.includes('küçülüyor')
            ? 25
            : 45
  }
  if (i.turnaround) accelSub = Math.max(accelSub, 90)

  return 0.55 * i.growthScore + 0.45 * accelSub
}

// ── 7.4 catalyst ──────────────────────────────────────────────────────────────
function catalystPillar(i: BabyScoreInputs): number {
  const haber =
    i.catalystState === 'fresh-positive'
      ? 100
      : i.catalystState === 'supportive'
        ? 75
        : i.catalystState === 'conflicting'
          ? 15
          : 40
  const tema = i.themeMember ? 100 : 40
  const ipo =
    i.ipoMonths === null
      ? 40
      : i.ipoMonths <= 6
        ? 100
        : i.ipoMonths <= 18
          ? lerp(100, 60, (i.ipoMonths - 6) / 12)
          : i.ipoMonths <= 36
            ? lerp(60, 40, (i.ipoMonths - 18) / 18)
            : 30
  return 0.45 * haber + 0.25 * tema + 0.3 * ipo
}

// ── 7.5 timing ("henüz yükselmemiş") ──────────────────────────────────────────
function timingPillar(i: BabyScoreInputs): number {
  const pos = i.pos52
  const konum =
    pos < 0.15
      ? 60
      : pos <= 0.45
        ? 100
        : pos <= 0.7
          ? lerp(100, 55, (pos - 0.45) / 0.25)
          : pos <= 0.85
            ? lerp(55, 25, (pos - 0.7) / 0.15)
            : 15

  const rw = i.rangeWidth
  const kostuMu =
    rw < 1.8 ? 90 : rw <= 3.0 ? lerp(90, 55, (rw - 1.8) / 1.2) : pos < 0.4 ? 60 : 20

  const rsi = i.rsi14
  const rsiSub =
    rsi < 30
      ? 50
      : rsi < 40
        ? 75
        : rsi <= 58
          ? 100
          : rsi <= 70
            ? lerp(100, 50, (rsi - 58) / 12)
            : 30

  const r = i.r60 * 100 // %
  const sicrama =
    r < -30
      ? 50
      : r < 25
        ? 100
        : r <= 60
          ? lerp(100, 50, (r - 25) / 35)
          : r <= 120
            ? lerp(50, 20, (r - 60) / 60)
            : 10

  return 0.4 * konum + 0.3 * kostuMu + 0.15 * rsiSub + 0.15 * sicrama
}

// ── 7.6 + 7.9 kalite kapısı + risk rozetleri ──────────────────────────────────
function qualityAndFlags(
  i: BabyScoreInputs,
  ignition: number | null,
): { gate: number; antiPump: boolean; flags: string[] } {
  let gate = 1
  const weakFundamental = ignition === null || ignition < 50
  const antiPump = i.recentVerticalSpike && weakFundamental

  if (i.advTL !== null && i.advTL < SOFT_ADV_TL) gate *= 0.6 // 1M–2M (≥1M; <1M zaten dışlandı)
  if (i.beneishFlag === 'şüpheli') gate *= 0.65
  else if (i.beneishFlag === 'gri') gate *= 0.9
  if (i.piotroski !== null && i.piotroski < 3) gate *= 0.8
  if (i.altmanZone === 'sıkıntı') gate *= 0.85
  if (i.freeFloat !== null && i.freeFloat < 0.03) gate *= 0.8
  if (antiPump) gate *= 0.55
  gate = clamp(gate, 0.4, 1)

  const flags: string[] = []
  if (i.advTL !== null && i.advTL < 3_000_000) flags.push('🚩 düşük likidite')
  if ((i.atrPctDaily !== null && i.atrPctDaily > 6) || (i.beta !== null && i.beta > 1.5))
    flags.push('⚡ yüksek volatilite')
  if (antiPump) flags.push('🎭 olası operasyon')
  if (i.ipoMonths !== null && i.ipoMonths < 12) flags.push('🆕 yeni halka arz')
  if (i.pos52 < 0.2 && i.priceSlope60 < -20) flags.push('📉 düşen bıçak')
  if (i.freeFloat !== null && i.freeFloat < 0.05) flags.push('🔒 çok düşük float')
  // Sadece yapısal float açığı → flag (growthScore null yaygın/beklenen; ignition=null UI'da görünür)
  if (i.freeFloat === null) flags.push('❓ float verisi yok')

  return { gate: Math.round(gate * 100) / 100, antiPump, flags }
}

// ── 7.7 extendedGate ──────────────────────────────────────────────────────────
function extendedGate(i: BabyScoreInputs): number {
  if (i.pos52 > 0.9 && i.rangeWidth > 2.5) return 0.5
  if (i.pos52 > 0.85) return 0.75
  return 1
}

function verdictFor(s: number): string {
  if (s >= 75) return 'güçlü kurulum'
  if (s >= 60) return 'umut vadeden'
  if (s >= 45) return 'izlemede'
  return 'zayıf kurulum'
}

// ── 7.8 nihai birleştirme ──────────────────────────────────────────────────────
export function computeBabyScore(i: BabyScoreInputs): BabyScoreBreakdown {
  // Ölü tahta → skorlanmaz
  if (i.advTL !== null && i.advTL < MIN_ADV_TL) {
    return {
      excluded: true,
      reason: 'illikit (ADV < ~1M TL)',
      score: 0,
      verdict: 'elendi',
      components: { scarcity: 0, accumulation: 0, ignition: null, catalyst: 0, timing: 0 },
      qualityMultiplier: 0,
      extendedMultiplier: 0,
      componentsUsed: 0,
      riskFlags: ['🚩 düşük likidite'],
    }
  }

  const scarcity = scarcityPillar(i)
  const accumulation = accumulationPillar(i)
  const ignition = ignitionPillar(i)
  const catalyst = catalystPillar(i)
  const timing = timingPillar(i)

  const parts: Array<{ s: number | null; w: number }> = [
    { s: scarcity, w: 0.22 },
    { s: accumulation, w: 0.2 },
    { s: ignition, w: 0.18 },
    { s: catalyst, w: 0.15 },
    { s: timing, w: 0.25 },
  ]
  const present = parts.filter((p) => p.s !== null)
  const sumW = present.reduce((a, p) => a + p.w, 0)
  const add5 = present.reduce((a, p) => a + (p.s as number) * (p.w / sumW), 0)

  const { gate, flags } = qualityAndFlags(i, ignition)
  const ext = extendedGate(i)
  const score = Math.round(clamp(add5 * gate * ext, 0, 100))

  return {
    excluded: false,
    score,
    verdict: verdictFor(score),
    components: {
      scarcity: Math.round(scarcity),
      accumulation: Math.round(accumulation),
      ignition: ignition === null ? null : Math.round(ignition),
      catalyst: Math.round(catalyst),
      timing: Math.round(timing),
    },
    qualityMultiplier: gate,
    extendedMultiplier: ext,
    componentsUsed: present.length,
    riskFlags: flags,
  }
}
