/**
 * Bebek Hisseler — Pick Değerlendirme (FAZ 4 forward-tracking)
 *
 * GET /api/cron/baby-picks-evaluate
 * Schedule: Pzt 09:30 UTC (12:30 TRT) — snapshot (09:00) SONRASI
 *
 * Ufuğu (4/12/26 hafta) dolmuş ama henüz doldurulmamış pick'lerin getirisini
 * scan_cache son fiyatından + BIST100'den hesaplar. İstek-anı Yahoo: yalnız XU100 (1 çağrı).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bistGuard } from '@/lib/bist-guard'
import { fetchOHLCV } from '@/lib/yahoo'
import { HORIZONS } from '@/lib/baby-picks'

const CRON_SECRET = process.env.CRON_SECRET

function createAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

interface PickRow {
  id: string
  sembol: string
  entry_price: number
  entry_time: string
  bist_entry: number | null
  ret_4w: number | null
  ret_12w: number | null
  ret_26w: number | null
}

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const guard = bistGuard()
  if (guard) return guard

  const admin = createAdmin()

  // Tam değerlendirilmemiş (26h getirisi hâlâ null) pick'ler
  const { data: picks, error } = await admin
    .from('baby_picks')
    .select('id, sembol, entry_price, entry_time, bist_entry, ret_4w, ret_12w, ret_26w')
    .is('ret_26w', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!picks?.length) return NextResponse.json({ ok: true, message: 'Değerlendirilecek pick yok', updated: 0 })

  const rows = picks as PickRow[]

  // Güncel fiyatlar — scan_cache last_close (Yahoo YOK)
  const symbols = [...new Set(rows.map((p) => p.sembol))]
  const priceMap = new Map<string, number>()
  const { data: scan } = await admin
    .from('scan_cache')
    .select('sembol, last_close')
    .eq('market', 'BIST')
    .in('sembol', symbols)
  for (const r of (scan ?? []) as { sembol: string; last_close: number | null }[]) {
    if (r.last_close && r.last_close > 0) priceMap.set(r.sembol, r.last_close)
  }

  // BIST100 güncel (1 Yahoo çağrısı)
  let bistNow: number | null = null
  try {
    const { candles } = await fetchOHLCV('XU100', 3)
    bistNow = candles[candles.length - 1]?.close ?? null
  } catch {
    /* benchmark opsiyonel */
  }

  const now = Date.now()
  let updated = 0

  for (const p of rows) {
    const price = priceMap.get(p.sembol)
    if (!price || !p.entry_price) continue
    const weeksElapsed = (now - new Date(p.entry_time).getTime()) / (7 * 86_400_000)

    const ret = (price / p.entry_price - 1) * 100
    const bistRet = bistNow && p.bist_entry ? (bistNow / p.bist_entry - 1) * 100 : null

    const update: Record<string, number | string | null> = {}
    for (const h of HORIZONS) {
      const retKey = `ret_${h.key}` as 'ret_4w' | 'ret_12w' | 'ret_26w'
      if (weeksElapsed >= h.weeks && p[retKey] === null) {
        update[`price_${h.key}`] = Math.round(price * 100) / 100
        update[retKey] = Math.round(ret * 10) / 10
        update[`bist_ret_${h.key}`] = bistRet !== null ? Math.round(bistRet * 10) / 10 : null
      }
    }

    if (Object.keys(update).length > 0) {
      update.last_evaluated_at = new Date().toISOString()
      const { error: upErr } = await admin.from('baby_picks').update(update).eq('id', p.id)
      if (!upErr) updated++
    }
  }

  return NextResponse.json({ ok: true, openPicks: rows.length, updated, bistNow })
}
