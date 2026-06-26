/**
 * Akıllı Para + Teknik Sinyal cron — BIST.
 *
 * GET /api/cron/smart-signal
 *  - Vercel Cron: x-vercel-cron header · Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * Saf hesap (scan_cache mumlarından, Yahoo YOK) → tüm evren tek geçişte → ai_cache
 * `smart-signal:BIST`. Part-split GEREKMEZ (CPU-only). Günlük, scan-cache'ten SONRA.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bistGuard } from '@/lib/bist-guard'
import type { OHLCVCandle } from '@/types'
import { runSmartSignalScan } from '@/lib/smart-signal-runner'
import type { EngineScanRow } from '@/lib/smart-signal/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  const isManualAuth = CRON_SECRET && token === CRON_SECRET
  if (!isVercelCron && !isManualAuth && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const guard = bistGuard()
  if (guard) return guard

  const startedAt = Date.now()
  try {
    const sb = createAdmin()

    // scan_cache TEK sorgu → mum + meta (rsi/rel_vol5/last_close)
    const { data: scanRows } = await sb
      .from('scan_cache')
      .select('sembol, candles_json, rsi, rel_vol5, last_close')
      .eq('market', 'BIST')
      .limit(1000)

    const candlesMap = new Map<string, OHLCVCandle[]>()
    const scanMap = new Map<string, EngineScanRow>()
    const symbols: string[] = []
    for (const row of (scanRows ?? []) as Array<{
      sembol: string
      candles_json: unknown
      rsi: number | null
      rel_vol5: number | null
      last_close: number | null
    }>) {
      if (!Array.isArray(row.candles_json)) continue
      candlesMap.set(row.sembol, row.candles_json as OHLCVCandle[])
      scanMap.set(row.sembol, { rsi: row.rsi, rel_vol5: row.rel_vol5, last_close: row.last_close })
      symbols.push(row.sembol)
    }

    const coverage = await runSmartSignalScan(sb, symbols, { candlesMap, scanMap, enrichAI: true })

    const durationMs = Date.now() - startedAt
    console.log(
      `[cron/smart-signal] ${coverage.scored}/${coverage.total} skor, ` +
        `${coverage.skippedNoCandles} mum yok, ${coverage.aiEnriched} AI özet, ${durationMs}ms`,
    )

    return NextResponse.json({ ok: true, market: 'BIST', ...coverage, durationMs })
  } catch (error) {
    console.error('[cron/smart-signal] Hata:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
