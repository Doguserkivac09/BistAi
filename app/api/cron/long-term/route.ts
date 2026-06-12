/**
 * Uzun Vade Kompozit cron — BIST (FAZ 1)
 *
 * Tüm BIST evrenini (619) temel motorlarla skorlar ve ai_cache'e yazar
 * (long-term:BIST). /api/uzun-vade-firsatlar istek anında bu satırı okur —
 * Yahoo'ya gitmez.
 *
 * GET /api/cron/long-term[?part=1|2|3]
 *  - Vercel Cron: x-vercel-cron header
 *  - Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * ⚠️ TIMEOUT: sembol başına 2 Yahoo çağrısı (quoteSummary + fundamentalsTimeSeries)
 * — growth-momentum'un İKİ KATI iş. Evren ?part=1|2|3 ile ÜÇE bölünür (Pzt
 * 10:30/10:40/10:50 TRT); ADV ön filtresi (≥5M TL, scan_cache mumlarından)
 * likit olmayan sembolleri Yahoo'ya gitmeden eler. part'sız = tüm evren (manuel).
 *
 * Sıralama bağımlılığı (hepsi Pazartesi, bu cron en son):
 *  06:00/06:20 UTC growth-momentum → 07:00 UTC sector-medians → 07:30+ UTC bu cron.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bistGuard } from '@/lib/bist-guard'
import { BIST_SYMBOLS } from '@/types'
import type { OHLCVCandle } from '@/types'
import { fetchTurkeyInflation } from '@/lib/turkey-macro'
import { runLongTermScan } from '@/lib/long-term-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
/** 20g ortalama TL hacmi bunun altındaysa Yahoo'ya hiç gidilmez */
const MIN_ADV_TL = 5_000_000

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** scan_cache mumlarından 20g ortalama TL işlem hacmi */
function calcAdvTL(candles: OHLCVCandle[]): number | null {
  const last20 = candles.slice(-20).filter((c) => c.close > 0 && c.volume > 0)
  if (last20.length < 5) return null
  const sum = last20.reduce((a, c) => a + c.close * c.volume, 0)
  return Math.round(sum / last20.length)
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  const isManualAuth = CRON_SECRET && token === CRON_SECRET

  if (!isVercelCron && !isManualAuth) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    }
  }

  const guard = bistGuard()
  if (guard) return guard

  const startedAt = Date.now()

  try {
    // ── Evren dilimleme (3 parça — sembol başına 2 Yahoo çağrısı) ────────────
    const all = [...BIST_SYMBOLS]
    const partRaw = request.nextUrl.searchParams.get('part')
    const part = partRaw === '1' || partRaw === '2' || partRaw === '3' ? Number(partRaw) : null
    let symbols = all
    if (part) {
      const third = Math.ceil(all.length / 3)
      symbols = all.slice((part - 1) * third, part * third)
    }

    const sb = createAdminClient()

    // ── ADV ön filtresi — scan_cache mumlarından (Yahoo fan-out YOK) ─────────
    const advMap = new Map<string, number>()
    {
      const { data: scanRows } = await sb
        .from('scan_cache')
        .select('sembol, candles_json')
        .eq('market', 'BIST')
        .in('sembol', symbols)
      for (const row of (scanRows ?? []) as { sembol: string; candles_json: unknown }[]) {
        if (Array.isArray(row.candles_json)) {
          const adv = calcAdvTL(row.candles_json as OHLCVCandle[])
          if (adv !== null) advMap.set(row.sembol, adv)
        }
      }
    }
    const liquid = symbols.filter((s) => (advMap.get(s) ?? 0) >= MIN_ADV_TL)
    const skippedIlliquid = symbols.length - liquid.length

    const inflation = await fetchTurkeyInflation().catch(() => null)
    const inflationYoy = inflation?.value ?? null

    console.log(
      `[cron/long-term] part=${part ?? 'tümü'}: ${symbols.length} sembol → ${liquid.length} likit ` +
        `(${skippedIlliquid} ADV<5M elendi), TÜFE: ${inflationYoy !== null ? inflationYoy.toFixed(1) + '%' : 'yok'}`,
    )

    const coverage = await runLongTermScan(sb, liquid, {
      inflationYoy,
      advMap,
      batchSize: 6,
      batchDelay: 300,
      merge: part !== null,
    })

    const durationMs = Date.now() - startedAt
    console.log(
      `[cron/long-term] Tamamlandı: ${coverage.scored}/${coverage.total} skor, ` +
        `${coverage.skippedNoFundamentals} veri yok, ${coverage.skippedNoScore} skor altı, ${durationMs}ms`,
    )

    return NextResponse.json({
      ok: true,
      market: 'BIST',
      part: part ?? 'all',
      inflationYoy,
      skippedIlliquid,
      ...coverage,
      durationMs,
    })
  } catch (error) {
    console.error('[cron/long-term] Hata:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
