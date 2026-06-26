/**
 * Akıllı Para + Teknik Sinyal — çalıştırıcı.
 *
 * Saf hesap: scan_cache mumlarından (istek-anı/cron Yahoo YOK). Tüm BIST evrenini
 * tek geçişte skorlar (CPU-only, hızlı), POSITIVE/STRONG top-N'i AI ile zenginleştirir,
 * sonucu `ai_cache` `smart-signal:BIST` tek satıra yazar. MIGRATION YOK.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OHLCVCandle } from '@/types'
import { runSmartSignal, type EngineScanRow } from './smart-signal/engine'
import { enrichSummariesWithAI } from './smart-signal/ai-summary'
import type { SmartSignalResult } from './smart-signal/types'

export interface SmartSignalStore {
  scoredAt: string
  rows: SmartSignalResult[]
}

export interface SmartSignalCoverage {
  scored: number
  total: number
  skippedNoCandles: number
  aiEnriched: number
}

const CACHE_KEY = 'smart-signal:BIST'
const TTL_MS = 2 * 24 * 60 * 60 * 1000 // 2 gün (günlük koşu + marj)
const MAX_STORED = 700

export async function runSmartSignalScan(
  sb: SupabaseClient,
  symbols: string[],
  opts: {
    candlesMap: Map<string, OHLCVCandle[]>
    scanMap: Map<string, EngineScanRow>
    enrichAI?: boolean
  },
): Promise<SmartSignalCoverage> {
  const rows: SmartSignalResult[] = []
  let skippedNoCandles = 0

  for (const sembol of symbols) {
    const candles = opts.candlesMap.get(sembol)
    if (!candles || candles.length < 30) {
      skippedNoCandles++
      continue
    }
    const r = runSmartSignal(sembol, candles, opts.scanMap.get(sembol))
    if (r) rows.push(r)
    else skippedNoCandles++
  }

  rows.sort((a, b) => b.total_score - a.total_score)

  let aiEnriched = 0
  if (opts.enrichAI) {
    aiEnriched = await enrichSummariesWithAI(rows).catch(() => 0)
  }

  const payload: SmartSignalStore = { scoredAt: new Date().toISOString(), rows: rows.slice(0, MAX_STORED) }
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

  return { scored: rows.length, total: symbols.length, skippedNoCandles, aiEnriched }
}

export async function getStoredSmartSignal(sb: SupabaseClient): Promise<SmartSignalStore | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', CACHE_KEY)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!data?.explanation) return null
    return JSON.parse(data.explanation as string) as SmartSignalStore
  } catch {
    return null
  }
}
