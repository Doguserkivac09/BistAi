/**
 * Bebek Hisseler cron — BIST (FAZ 1)
 *
 * Tüm BIST evrenini babyScore ile tarar ve ai_cache'e yazar (baby-candidates:BIST).
 * /api/yukselis-adaylari istek anında bu satırı okur — Yahoo'ya gitmez.
 *
 * GET /api/cron/baby-candidates[?part=1|2]
 *  - Vercel Cron: x-vercel-cron header
 *  - Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * Sembol başına TEK Yahoo çağrısı (fetchYahooFundamentals); teknik katman scan_cache
 * mumlarından. long-term'in yarısı kadar yük ama evren büyük → ?part=1|2 ile İKİYE bölünür.
 * ADV ön filtresi (<1M TL ölü tahta) Yahoo'ya gitmeden eler. part'sız = tüm evren (manuel).
 *
 * Sıralama bağımlılığı (hepsi Pazartesi, bu cron en son): growth-momentum (06:00/06:20)
 * + news-catalyst (05:00) + scan-cache mumları dolu olmalı.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bistGuard } from '@/lib/bist-guard'
import { BIST_SYMBOLS } from '@/types'
import type { OHLCVCandle } from '@/types'
import { fetchTurkeyInflation } from '@/lib/turkey-macro'
import { runBabyScan } from '@/lib/baby-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
/** 20g ortalama TL hacmi bunun altındaysa ölü tahta — Yahoo'ya gidilmez (baby-score zaten elerdi) */
const MIN_ADV_TL = 1_000_000

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
    // ── Evren dilimleme (2 parça — sembol başına 1 Yahoo çağrısı) ────────────
    const all = [...BIST_SYMBOLS]
    const partRaw = request.nextUrl.searchParams.get('part')
    const part = partRaw === '1' || partRaw === '2' ? Number(partRaw) : null
    let symbols = all
    if (part) {
      const half = Math.ceil(all.length / 2)
      symbols = all.slice((part - 1) * half, part * half)
    }

    const sb = createAdminClient()

    // ── scan_cache TEK sorgu → hem ADV ön filtresi hem mum haritası ──────────
    const candlesMap = new Map<string, OHLCVCandle[]>()
    const advMap = new Map<string, number>()
    {
      const { data: scanRows } = await sb
        .from('scan_cache')
        .select('sembol, candles_json')
        .eq('market', 'BIST')
        .in('sembol', symbols)
      for (const row of (scanRows ?? []) as { sembol: string; candles_json: unknown }[]) {
        if (Array.isArray(row.candles_json)) {
          const candles = row.candles_json as OHLCVCandle[]
          candlesMap.set(row.sembol, candles)
          const adv = calcAdvTL(candles)
          if (adv !== null) advMap.set(row.sembol, adv)
        }
      }
    }
    const liquid = symbols.filter((s) => (advMap.get(s) ?? 0) >= MIN_ADV_TL)
    const skippedIlliquid = symbols.length - liquid.length

    const inflation = await fetchTurkeyInflation().catch(() => null)
    const inflationYoy = inflation?.value ?? null

    console.log(
      `[cron/baby-candidates] part=${part ?? 'tümü'}: ${symbols.length} sembol → ${liquid.length} likit ` +
        `(${skippedIlliquid} ADV<1M elendi), TÜFE: ${inflationYoy !== null ? inflationYoy.toFixed(1) + '%' : 'yok'}`,
    )

    const coverage = await runBabyScan(sb, liquid, {
      candlesMap,
      inflationYoy,
      batchSize: 8,
      batchDelay: 250,
      merge: part !== null,
    })

    const durationMs = Date.now() - startedAt
    console.log(
      `[cron/baby-candidates] Tamamlandı: ${coverage.scored}/${coverage.total} skor, ` +
        `${coverage.skippedNoCandles} mum yok, ${coverage.skippedExcluded} elendi, ` +
        `${coverage.skippedLowScore} skor altı, ${durationMs}ms`,
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
    console.error('[cron/baby-candidates] Hata:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
