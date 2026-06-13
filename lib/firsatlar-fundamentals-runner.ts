/**
 * Fırsatlar temel-veri precompute çalıştırıcısı (FAZ 2)
 *
 * /api/firsatlar her İSTEKTE aktif sembol başına fetchYahooFundamentals çağırıyordu
 * (in-memory cache'e güvenerek — cold start'ta uçar, ilk ziyaretçi Yahoo fan-out
 * bedelini öder). Bu runner aynı işi günlük cron'da TEK SEFER yapıp ai_cache'e
 * yazar; route yalnızca cache okur (istek anında Yahoo YOK).
 *
 * Tek satırda iki şey:
 *  - Yatırım Skoru (sektör-profilli, enflasyon düzeltmeli)
 *  - Sonraki bilanço tarihi (binary event riski — decision-engine earningsRisk)
 *
 * ai_cache anahtarı: `firsatlar-fundamentals:BIST` (MIGRATION YOK).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchYahooFundamentals } from './yahoo-fundamentals'
import {
  computeInvestableScore,
  type InflationContext,
  type InvestableRating,
  type InvestableConfidence,
} from './investment-score'
import { getSectorValuationProfile } from './sector-valuation'

export interface FundamentalsEntry {
  score: number
  rating: InvestableRating
  confidence: InvestableConfidence
  inflationAdjusted: boolean
  /** Sonraki bilanço unix-saniye (yoksa null) */
  nextEarningsTs: number | null
}

export interface FundamentalsStore {
  scoredAt: string
  items: Record<string, FundamentalsEntry>
}

const CACHE_KEY = 'firsatlar-fundamentals:BIST'
const TTL_MS = 36 * 60 * 60 * 1000 // 36 saat (günlük koşu + hafta sonu marjı)

export async function runFirsatlarFundamentals(
  sb: SupabaseClient,
  symbols: string[],
  opts: {
    inflationYoy?: number | null
    batchSize?: number
    batchDelay?: number
    merge?: boolean
  } = {},
): Promise<{ scored: number; total: number; failed: number }> {
  const batchSize = opts.batchSize ?? 8
  const batchDelay = opts.batchDelay ?? 250
  const inflation: InflationContext | undefined =
    opts.inflationYoy != null && Number.isFinite(opts.inflationYoy)
      ? { tufeYoy: opts.inflationYoy, source: 'tcmb' }
      : undefined

  const items: Record<string, FundamentalsEntry> = {}
  let failed = 0

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (sym) => {
        try {
          const f = await fetchYahooFundamentals(sym)
          const profile = getSectorValuationProfile(sym)
          const inv = computeInvestableScore(f, undefined, inflation, profile)
          items[sym] = {
            score: inv.score,
            rating: inv.ratingLabel,
            confidence: inv.confidence,
            inflationAdjusted: inv.inflationAdjustment?.applied ?? false,
            nextEarningsTs: f.nextEarningsTimestamp,
          }
        } catch {
          failed++
        }
      }),
    )
    if (i + batchSize < symbols.length) await new Promise((r) => setTimeout(r, batchDelay))
  }

  await storeFundamentals(sb, items, opts.merge)
  return { scored: Object.keys(items).length, total: symbols.length, failed }
}

export async function storeFundamentals(
  sb: SupabaseClient,
  items: Record<string, FundamentalsEntry>,
  merge = false,
): Promise<void> {
  let final = items
  if (merge) {
    const existing = await getStoredFundamentals(sb)
    if (existing) final = { ...existing.items, ...items }
  }

  const payload: FundamentalsStore = { scoredAt: new Date().toISOString(), items: final }
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

export async function getStoredFundamentals(sb: SupabaseClient): Promise<FundamentalsStore | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', CACHE_KEY)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!data?.explanation) return null
    return JSON.parse(data.explanation as string) as FundamentalsStore
  } catch {
    return null
  }
}
