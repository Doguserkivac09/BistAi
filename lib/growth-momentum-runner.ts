/**
 * Büyüme Momentumu çalıştırıcısı — cron'lar ile sayfa arasındaki köprü.
 *
 * Sorumluluklar:
 *  - Sembol listesi için fetchFinancialStatements → computeGrowthMomentum
 *  - Banka/yetersiz-veri atlama + coverage raporu
 *  - Sonucu `ai_cache`'e TEK SATIR JSON olarak yazma (MIGRATION YOK — sector-medians
 *    ve news-catalyst ile aynı yaklaşım). Anahtar: `growth-momentum:BIST` / `:US`.
 *  - merge desteği: cron evreni ?part=1|2 ile bölebilir; her parça kendi dilimini
 *    mevcut cache'le birleştirir (619 sembol tek koşuda maxDuration=300'ü zorlar).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchFinancialStatements } from './financial-statements'
import { computeGrowthMomentum } from './growth-momentum'
import { getSectorId } from './sectors'

export interface GrowthRow {
  sembol: string
  sector: string
  score: number
  verdict: string
  revenueCagr: number | null // reel (BIST) / nominal (US)
  revenueCagrNominal: number | null
  netIncomeCagr: number | null // reel
  epsCagr: number | null // reel
  marginDeltaPP: number | null
  consistency: number // 0-1
  epsSeries: Array<{ year: number; value: number }>
  quality: { beneish: string | null; piotroski: number | null; rating: string | null }
  components: { revenue: number; netIncome: number; eps: number; margin: number; consistency: number }
}

export interface GrowthStore {
  scoredAt: string
  inflationYoy: number | null
  rows: GrowthRow[]
}

export interface GrowthCoverage {
  scored: number
  total: number
  financial: number // banka/finansal → atlandı
  insufficient: number // veri yetersiz → atlandı
}

const KEY = (market: string) => `growth-momentum:${market}`
const TTL_MS = 21 * 24 * 60 * 60 * 1000 // 21 gün (finansallar çeyreklik değişir)
const MAX_STORED = 250

function toRow(sembol: string, b: ReturnType<typeof computeGrowthMomentum>): GrowthRow {
  return {
    sembol,
    sector: getSectorId(sembol),
    score: b.score,
    verdict: b.verdict,
    revenueCagr: b.revenueCagrReal,
    revenueCagrNominal: b.revenueCagrNominal,
    netIncomeCagr: b.netIncomeCagrReal,
    epsCagr: b.epsCagr,
    marginDeltaPP: b.marginDeltaPP,
    consistency: Math.round(b.consistency01 * 100) / 100,
    epsSeries: b.epsSeries,
    quality: { beneish: b.quality.beneishFlag, piotroski: b.quality.piotroski, rating: b.quality.eqRating },
    components: b.components,
  }
}

export async function runGrowthMomentum(
  sb: SupabaseClient,
  symbols: string[],
  market: 'US' | 'BIST',
  opts: {
    inflationYoy?: number | null
    batchSize?: number
    batchDelay?: number
    merge?: boolean
  } = {},
): Promise<GrowthCoverage> {
  const bist = market === 'BIST'
  const batchSize = opts.batchSize ?? 8
  const batchDelay = opts.batchDelay ?? 250

  const results: GrowthRow[] = []
  let financial = 0
  let insufficient = 0

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (sym) => {
        try {
          const years = await fetchFinancialStatements(sym, { bist })
          if (years.length < 2) {
            insufficient++
            return
          }
          const b = computeGrowthMomentum(years, { inflationYoy: opts.inflationYoy ?? null })
          if (!b.applicable) {
            if (b.verdict === 'uygulanmaz') financial++
            else insufficient++
            return
          }
          results.push(toRow(sym, b))
        } catch {
          insufficient++
        }
      }),
    )
    if (i + batchSize < symbols.length) await new Promise((r) => setTimeout(r, batchDelay))
  }

  await storeGrowthMomentum(sb, market, results, {
    merge: opts.merge,
    inflationYoy: opts.inflationYoy ?? null,
  })

  return { scored: results.length, total: symbols.length, financial, insufficient }
}

/** Sonucu ai_cache'e yazar. merge=true ise mevcut cache'le dilim bazında birleştirir. */
export async function storeGrowthMomentum(
  sb: SupabaseClient,
  market: 'US' | 'BIST',
  rows: GrowthRow[],
  opts: { merge?: boolean; inflationYoy?: number | null } = {},
): Promise<void> {
  let final = rows
  let inflationYoy = opts.inflationYoy ?? null

  if (opts.merge) {
    const existing = await getStoredGrowthMomentum(sb, market)
    if (existing) {
      const map = new Map(existing.rows.map((r) => [r.sembol, r]))
      for (const r of rows) map.set(r.sembol, r)
      final = [...map.values()]
      if (inflationYoy === null) inflationYoy = existing.inflationYoy
    }
  }

  final.sort((a, b) => b.score - a.score)
  const payload: GrowthStore = {
    scoredAt: new Date().toISOString(),
    inflationYoy,
    rows: final.slice(0, MAX_STORED),
  }

  await sb.from('ai_cache').upsert(
    {
      cache_key: KEY(market),
      explanation: JSON.stringify(payload),
      version: 1,
      hit_count: 0,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    },
    { onConflict: 'cache_key' },
  )
}

/** Saklanan büyüme skorlarını okur. Yoksa/eskiyse null. */
export async function getStoredGrowthMomentum(
  sb: SupabaseClient,
  market: 'US' | 'BIST',
): Promise<GrowthStore | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', KEY(market))
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!data?.explanation) return null
    const parsed = JSON.parse(data.explanation as string)
    // Geriye dönük: düz dizi de kabul et
    if (Array.isArray(parsed)) return { scoredAt: '', inflationYoy: null, rows: parsed as GrowthRow[] }
    return parsed as GrowthStore
  } catch {
    return null
  }
}
