/**
 * Bebek Hisseler — çalıştırıcı (FAZ 1)
 *
 * `computeBabyScore` motorunu (baby-score.ts) canlı veriye bağlar. Her sembol için:
 *   - Teknik katman: scan_cache mumlarından `computeMicrostructure` (Yahoo YOK)
 *   - Yapısal: tek `fetchYahooFundamentals` çağrısı (float/52H/beta/earningsGrowth)
 *   - Temel ateşleme: `growth-momentum:BIST` store'dan (yeniden hesaplama YOK)
 *   - Katalist: `news-catalyst:BIST` store'dan · Tema: bist-future-themes set'i
 *
 * Sembol başına TEK Yahoo çağrısı (long-term'in yarısı). Sonuç `ai_cache`'e TEK SATIR
 * (`baby-candidates:BIST`, MIGRATION YOK). Cron evreni ?part ile böler; her parça kendi
 * dilimini merge eder (long-term-runner deseni).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OHLCVCandle } from '@/types'
import { fetchYahooFundamentals, type YahooFundamentals } from './yahoo-fundamentals'
import { computeMicrostructure, type Microstructure } from './candle-microstructure'
import { computeBabyScore, type BabyScoreInputs, type CatalystState } from './baby-score'
import { getStoredGrowthMomentum, type GrowthRow } from './growth-momentum-runner'
import { getAllBistFutureSymbols } from './bist-future-themes'
import { getSectorId } from './sectors'

// news-catalyst store tipi (lib/news-impact.ts SymbolCatalyst ile uyumlu okuma)
interface StoredCatalyst {
  sentiment: 'pozitif' | 'negatif' | 'nötr'
  state: 'unpriced' | 'reacting' | 'priced' | 'tepkisiz' | 'none'
  materiality: string
}

// ── Saklanan satır ───────────────────────────────────────────────────────────

export interface BabyRow {
  sembol: string
  sector: string
  /** babyScore (0-100) — sayfa bununla sıralar */
  babyScore: number
  verdict: string
  components: { scarcity: number; accumulation: number; ignition: number | null; catalyst: number; timing: number }
  qualityMultiplier: number
  extendedMultiplier: number
  componentsUsed: number
  riskFlags: string[]
  // Şeffaflık (UI rozetleri + "neden bu hisse")
  freeFloat: number | null
  marketCap: number | null
  floatAdjCap: number | null
  advTL: number | null
  ipoMonths: number | null
  pos52: number
  rangeWidth: number
  rsi14: number
  r60: number
  obvTrend: number
  udvr: number
  vcpRatio: number
  growthScore: number | null
  growthVerdict: string | null
  catalystState: CatalystState | null
  themeMember: boolean
  lastClose: number | null
}

export interface BabyStore {
  scoredAt: string
  inflationYoy: number | null
  rows: BabyRow[]
}

export interface BabyCoverage {
  scored: number
  total: number
  skippedNoCandles: number
  skippedExcluded: number
  skippedLowScore: number
}

const CACHE_KEY = 'baby-candidates:BIST'
const TTL_MS = 8 * 24 * 60 * 60 * 1000 // 8 gün (haftalık koşu + marj)
const MAX_STORED = 300
const MIN_STORE_SCORE = 40 // §7.8 — çöpü ele; sayfa filtresi API'de
const MIN_CANDLES = 30 // mikro-yapı için yeterli geçmiş

/** SymbolCatalyst → babyScore CatalystState (taze pozitif > destekli > çelişen). */
function mapCatalystState(c: StoredCatalyst | undefined): CatalystState | null {
  if (!c) return null
  if (c.sentiment === 'negatif') return 'conflicting'
  if (c.sentiment === 'pozitif') {
    return c.state === 'unpriced' || c.state === 'reacting' ? 'fresh-positive' : 'supportive'
  }
  return 'none'
}

/** epsSeries: ilk dönem zarar → son dönem kâr = turnaround */
function isTurnaround(g: GrowthRow | undefined): boolean {
  const s = g?.epsSeries
  if (!s || s.length < 2) return false
  return s[0].value < 0 && s[s.length - 1].value > 0
}

/**
 * Per-sembol girdileri + şeffaflık türevlerini üretir (saf — I/O yok).
 * Hem runBabyScan hem doğrulama/test bunu kullanır → mapping drift olmaz.
 */
export function buildBabyInputs(
  f: YahooFundamentals,
  micro: Microstructure,
  g: GrowthRow | undefined,
  ctx: { catalystState: CatalystState | null; themeMember: boolean; inflationYoy: number | null },
): {
  inputs: BabyScoreInputs
  freeFloat: number | null
  floatAdjCap: number | null
  ipoMonths: number | null
  pos52: number
  rangeWidth: number
} {
  // 52H/52L: Yahoo öncelik, yoksa mum fallback
  const price = f.currentPrice ?? micro.lastClose ?? 0
  const high52 = f.week52High ?? micro.candleHigh
  const low52 = f.week52Low ?? micro.candleLow
  const pos52 =
    high52 && low52 && high52 > low52 ? Math.max(0, Math.min(1, (price - low52) / (high52 - low52))) : 0.5
  const rangeWidth = high52 && low52 && low52 > 0 ? high52 / low52 : 1.5

  const freeFloat =
    f.floatShares && f.sharesOutstanding && f.sharesOutstanding > 0
      ? f.floatShares / f.sharesOutstanding
      : null
  const floatAdjCap = freeFloat !== null && f.marketCap ? f.marketCap * freeFloat : null
  const ipoMonths = f.firstTradeMs !== null ? (Date.now() - f.firstTradeMs) / (30.44 * 86_400_000) : null

  const earningsGrowthReal =
    f.earningsGrowth !== null ? f.earningsGrowth * 100 - (ctx.inflationYoy ?? 0) : null

  const inputs: BabyScoreInputs = {
    freeFloat,
    marketCap: f.marketCap,
    advTL: micro.advTL,
    obvTrend: micro.obvTrend,
    priceSlope60: micro.priceSlope60,
    udvr: micro.udvr,
    vcpRatio: micro.vcpRatio,
    higherLowsCount: micro.higherLowsCount,
    closeBelowSMA50: micro.closeBelowSMA50,
    growthScore: g?.score ?? null,
    netIncomeCagrReal: g?.netIncomeCagr ?? null,
    earningsGrowthReal,
    turnaround: isTurnaround(g),
    growthVerdict: g?.verdict ?? null,
    isFinancial: false, // banka growth store'da yok → growthScore null zaten ignition'ı düşürür
    catalystState: ctx.catalystState,
    themeMember: ctx.themeMember,
    ipoMonths,
    pos52,
    rangeWidth,
    rsi14: micro.rsi14,
    r60: micro.r60,
    beneishFlag: (g?.quality.beneish as BabyScoreInputs['beneishFlag']) ?? null,
    piotroski: g?.quality.piotroski ?? null,
    altmanZone: null, // growth store'da yok; Beneish+Piotroski kalite kapısını taşır
    beta: f.beta,
    atrPctDaily: micro.atrPctDaily,
    recentVerticalSpike: micro.recentVerticalSpike,
  }

  return { inputs, freeFloat, floatAdjCap, ipoMonths, pos52, rangeWidth }
}

// ── Tarayıcı ──────────────────────────────────────────────────────────────────

export async function runBabyScan(
  sb: SupabaseClient,
  symbols: string[],
  opts: {
    /** scan_cache'ten okunan mumlar (cron ADV ile birlikte tek sorguda doldurur) */
    candlesMap: Map<string, OHLCVCandle[]>
    inflationYoy?: number | null
    batchSize?: number
    batchDelay?: number
    merge?: boolean
  },
): Promise<BabyCoverage> {
  const batchSize = opts.batchSize ?? 8
  const batchDelay = opts.batchDelay ?? 250
  const inflationYoy = opts.inflationYoy ?? null

  // Paylaşılan bağlam — TEK sorgu (sembol başına fan-out yok)
  const [growthStore, catalystItems] = await Promise.all([
    getStoredGrowthMomentum(sb, 'BIST').catch(() => null),
    readCatalystItems(sb).catch(() => null),
  ])
  const growthMap = new Map((growthStore?.rows ?? []).map((r) => [r.sembol, r]))
  const themeSet = new Set(getAllBistFutureSymbols())

  const rows: BabyRow[] = []
  let skippedNoCandles = 0
  let skippedExcluded = 0
  let skippedLowScore = 0

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (sembol) => {
        const candles = opts.candlesMap.get(sembol)
        if (!candles || candles.length < MIN_CANDLES) {
          skippedNoCandles++
          return
        }
        try {
          const micro = computeMicrostructure(candles)
          const f = await fetchYahooFundamentals(sembol)
          const g = growthMap.get(sembol)

          const { inputs, freeFloat, floatAdjCap, ipoMonths, pos52, rangeWidth } = buildBabyInputs(
            f,
            micro,
            g,
            {
              catalystState: mapCatalystState(catalystItems?.[sembol]),
              themeMember: themeSet.has(sembol),
              inflationYoy,
            },
          )

          const result = computeBabyScore(inputs)
          if (result.excluded) {
            skippedExcluded++
            return
          }
          if (result.score < MIN_STORE_SCORE) {
            skippedLowScore++
            return
          }

          rows.push({
            sembol,
            sector: getSectorId(sembol),
            babyScore: result.score,
            verdict: result.verdict,
            components: result.components,
            qualityMultiplier: result.qualityMultiplier,
            extendedMultiplier: result.extendedMultiplier,
            componentsUsed: result.componentsUsed,
            riskFlags: result.riskFlags,
            freeFloat: freeFloat !== null ? Math.round(freeFloat * 1000) / 10 : null,
            marketCap: f.marketCap,
            floatAdjCap: floatAdjCap !== null ? Math.round(floatAdjCap) : null,
            advTL: micro.advTL,
            ipoMonths: ipoMonths !== null ? Math.round(ipoMonths) : null,
            pos52: Math.round(pos52 * 100) / 100,
            rangeWidth: Math.round(rangeWidth * 100) / 100,
            rsi14: micro.rsi14,
            r60: micro.r60,
            obvTrend: micro.obvTrend,
            udvr: micro.udvr,
            vcpRatio: micro.vcpRatio,
            growthScore: g?.score ?? null,
            growthVerdict: g?.verdict ?? null,
            catalystState: inputs.catalystState,
            themeMember: inputs.themeMember,
            lastClose: micro.lastClose,
          })
        } catch {
          skippedNoCandles++
        }
      }),
    )
    if (i + batchSize < symbols.length) await new Promise((r) => setTimeout(r, batchDelay))
  }

  await storeBaby(sb, rows, { merge: opts.merge, inflationYoy })

  return {
    scored: rows.length,
    total: symbols.length,
    skippedNoCandles,
    skippedExcluded,
    skippedLowScore,
  }
}

// ── ai_cache store / read ──────────────────────────────────────────────────────

async function readCatalystItems(sb: SupabaseClient): Promise<Record<string, StoredCatalyst> | null> {
  const { data } = await sb
    .from('ai_cache')
    .select('explanation')
    .eq('cache_key', 'news-catalyst:BIST')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!data?.explanation) return null
  const parsed = JSON.parse(data.explanation as string)
  return (parsed?.items ?? null) as Record<string, StoredCatalyst> | null
}

export async function storeBaby(
  sb: SupabaseClient,
  rows: BabyRow[],
  opts: { merge?: boolean; inflationYoy?: number | null } = {},
): Promise<void> {
  let final = rows
  let inflationYoy = opts.inflationYoy ?? null

  if (opts.merge) {
    const existing = await getStoredBaby(sb)
    if (existing) {
      const map = new Map(existing.rows.map((r) => [r.sembol, r]))
      for (const r of rows) map.set(r.sembol, r)
      final = [...map.values()]
      if (inflationYoy === null) inflationYoy = existing.inflationYoy
    }
  }

  final.sort((a, b) => b.babyScore - a.babyScore)
  const payload: BabyStore = {
    scoredAt: new Date().toISOString(),
    inflationYoy,
    rows: final.slice(0, MAX_STORED),
  }

  await sb.from('ai_cache').upsert(
    {
      cache_key: CACHE_KEY,
      explanation: JSON.stringify(payload),
      version: 1,
      hit_count: 0,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    },
    { onConflict: 'cache_key' },
  )
}

export async function getStoredBaby(sb: SupabaseClient): Promise<BabyStore | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', CACHE_KEY)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!data?.explanation) return null
    return JSON.parse(data.explanation as string) as BabyStore
  } catch {
    return null
  }
}
