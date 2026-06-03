/**
 * Future Score ortak çalıştırıcı — US ve BIST cron'ları paylaşır.
 *
 * Sorumluluklar:
 *  - Veri kalitesi eşiği (kritik alanların >%60'ı null → skorlama, "veri yetersiz")
 *  - Kapsama (coverage) raporlama: null alan sayıları
 *  - computeFutureScore çağrısı (enflasyon + export bonus opsiyonları ile)
 *  - future_scores tablosuna batch upsert (onConflict: sembol,market)
 *
 * Fetching cron'da yapılır (US vs BIST fetcher farklı) → buraya hazır
 * fundamentals Map'i gelir.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFutureScore, type FutureScoreBreakdown } from './future-score'
import type { Fundamentals } from './yahoo-fundamentals'

// Skor için anlamlı kritik alanlar. Bunların >%60'ı null ise hisse skorlanmaz.
const CRITICAL_FIELDS: (keyof Fundamentals)[] = [
  'revenueGrowth',
  'targetUpside',
  'recommendationMean',
  'epsForward',
  'insiderBuySellRatio',
  'peRatio',
  'institutionalPct',
]

export interface Coverage {
  scored: number                    // DB'ye yazılan satır sayısı
  total: number                     // denenen sembol sayısı
  insufficient: number              // veri yetersiz / fetch boş → atlanan
  nullFields: Record<string, number> // kritik alan başına null sayısı
}

export interface RunOptions {
  /** BIST: yıllık TÜFE yüzdesi (reel büyüme düzeltmesi). */
  inflationYoy?: number | null
  /** BIST: sembol → ihracat bonusu (0-20). */
  exportBonus?: Record<string, number>
}

export async function runFutureScores(
  sb: SupabaseClient,
  symbols: string[],
  market: 'US' | 'BIST',
  fundamentals: Map<string, Fundamentals>,
  opts: RunOptions = {},
): Promise<Coverage> {
  const nullFields: Record<string, number> = {}
  for (const f of CRITICAL_FIELDS) nullFields[f as string] = 0

  const rows: Record<string, unknown>[] = []
  let insufficient = 0
  const now = new Date().toISOString()

  for (const symbol of symbols) {
    const fund = fundamentals.get(symbol)
    if (!fund) {
      insufficient++
      continue
    }

    let nullCount = 0
    for (const f of CRITICAL_FIELDS) {
      const v = fund[f]
      if (v === null || v === undefined) {
        nullFields[f as string]++
        nullCount++
      }
    }

    // Kritik alanların >%60'ı null → veri yetersiz
    if (nullCount / CRITICAL_FIELDS.length > 0.6) {
      insufficient++
      continue
    }

    const breakdown = computeFutureScore(fund, {
      inflationYoy: opts.inflationYoy ?? null,
      exportBonus: opts.exportBonus?.[symbol] ?? 0,
    })

    rows.push(toRow(symbol, market, breakdown, now))
  }

  let written = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await sb
      .from('future_scores')
      .upsert(batch, { onConflict: 'sembol,market' })
    if (error) {
      console.error(`[future-scores:${market}] upsert batch ${i / 100} hata:`, error.message)
    } else {
      written += batch.length
    }
  }

  return { scored: written, total: symbols.length, insufficient, nullFields }
}

// FutureScoreBreakdown → future_scores satırı.
// DB kolonları migration gerektirmemek için yeniden amaçlandırıldı:
//   news_score=consensus · partnership_score=eps · balance_score=peg
function toRow(
  sembol: string,
  market: string,
  b: FutureScoreBreakdown,
  scored_at: string,
): Record<string, unknown> {
  return {
    sembol,
    market,
    score: b.score,
    revenue_score: b.revenueScore,
    analyst_score: b.analystScore,
    news_score: b.consensusScore,
    partnership_score: b.epsScore,
    insider_score: b.insiderScore,
    balance_score: b.pegScore,
    institutional_score: b.institutionalScore,
    ai_summary: b.summary,
    scored_at,
  }
}
