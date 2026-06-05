/**
 * Sektör medyan çarpanları — peer/görece değerleme için.
 *
 * Her sektör için F/K, F/DD, EV/FAVÖK, ROE, net marj medyanını hesaplar.
 * Migration gerektirmemek için sonuç JSON'u mevcut `ai_cache` tablosunda
 * (`sector-medians:BIST` anahtarı) saklanır. Cron haftalık hesaplar; okuma hızlı.
 *
 * Medyan (ortalama değil) kullanılır → aykırı değerlere dayanıklı.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SECTORS, getSymbolsBySector, type SectorId } from './sectors'
import { fetchYahooFundamentals, type YahooFundamentals } from './yahoo-fundamentals'

export interface SectorMedian {
  pe: number | null
  pb: number | null
  evEbitda: number | null
  roe: number | null          // ratio (0.23 = %23)
  profitMargin: number | null // ratio
  count: number               // medyana giren hisse sayısı
}
export type SectorMediansMap = Partial<Record<SectorId, SectorMedian>>

const CACHE_KEY = 'sector-medians:BIST'
const TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 gün

function median(xs: Array<number | null | undefined>, positiveOnly: boolean): number | null {
  const v = xs
    .filter((x): x is number => typeof x === 'number' && isFinite(x) && (!positiveOnly || x > 0))
    .sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * Tüm sektörlerin medyan çarpanlarını hesaplar (tüm BIST evreni fetch edilir).
 */
export async function computeAllSectorMedians(): Promise<{ medians: SectorMediansMap; fetched: number }> {
  const sectorIds = Object.keys(SECTORS) as SectorId[]

  // Tüm sembolleri topla (her sembol tek sektörde)
  const allSymbols = new Set<string>()
  for (const sid of sectorIds) for (const s of getSymbolsBySector(sid)) allSymbols.add(s)
  const symbols = [...allSymbols]

  // Batched fetch (yahoo-finance2 — 24h in-memory cache var ama cron taze instance)
  const fundsBySym = new Map<string, YahooFundamentals>()
  const batchSize = 6
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (sym) => {
        try { fundsBySym.set(sym, await fetchYahooFundamentals(sym)) } catch { /* atla */ }
      }),
    )
    if (i + batchSize < symbols.length) await new Promise((r) => setTimeout(r, 400))
  }

  const medians: SectorMediansMap = {}
  for (const sid of sectorIds) {
    const funds = getSymbolsBySector(sid)
      .map((s) => fundsBySym.get(s))
      .filter((f): f is YahooFundamentals => !!f)
    if (funds.length < 3) continue // anlamlı medyan için en az 3 hisse
    medians[sid] = {
      pe: median(funds.map((f) => f.peRatio), true),
      pb: median(funds.map((f) => f.priceToBook), true),
      evEbitda: median(funds.map((f) => f.enterpriseToEbitda), true),
      roe: median(funds.map((f) => f.returnOnEquity), false),
      profitMargin: median(funds.map((f) => f.profitMargin), false),
      count: funds.length,
    }
  }

  return { medians, fetched: fundsBySym.size }
}

/** Medyanları ai_cache'e yazar (migration yok). */
export async function storeSectorMedians(sb: SupabaseClient, medians: SectorMediansMap): Promise<void> {
  await sb.from('ai_cache').upsert({
    cache_key: CACHE_KEY,
    explanation: JSON.stringify(medians),
    version: 1,
    hit_count: 0,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  }, { onConflict: 'cache_key' })
}

/** Saklanan medyanları okur. Yoksa/eskiyse null. */
export async function getStoredSectorMedians(sb: SupabaseClient): Promise<SectorMediansMap | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', CACHE_KEY)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!data?.explanation) return null
    return JSON.parse(data.explanation) as SectorMediansMap
  } catch {
    return null
  }
}
