/**
 * Bebek Hisseler — Haftalık Snapshot (FAZ 4 forward-tracking)
 *
 * GET /api/cron/baby-picks-snapshot
 * Schedule: Pzt 09:00 UTC (12:00 TRT) — baby-candidates (08:30) SONRASI
 *
 * Modelin en temiz adaylarını (selectBabyPicks) fiyat + BIST100 snapshot'ıyla
 * baby_picks tablosuna yazar. İdempotent (week_start,sembol unique → tekrar yazmaz).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bistGuard } from '@/lib/bist-guard'
import { fetchOHLCV } from '@/lib/yahoo'
import { getStoredBaby } from '@/lib/baby-runner'
import { selectBabyPicks } from '@/lib/baby-picks'

const CRON_SECRET = process.env.CRON_SECRET

function createAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** İçinde bulunulan haftanın Pazartesi'si (YYYY-MM-DD, UTC) */
function mondayOf(d = new Date()): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = dt.getUTCDay() // 0=Pzr
  const diff = day === 0 ? -6 : 1 - day
  dt.setUTCDate(dt.getUTCDate() + diff)
  return dt.toISOString().slice(0, 10)
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

  const store = await getStoredBaby(admin)
  if (!store || store.rows.length === 0) {
    return NextResponse.json({ ok: true, message: 'baby-candidates store boş — önce o cron koşmalı', inserted: 0 })
  }

  const picks = selectBabyPicks(store.rows)
  if (picks.length === 0) {
    return NextResponse.json({ ok: true, message: 'Kriteri geçen temiz aday yok', inserted: 0 })
  }

  // BIST100 giriş değeri (benchmark)
  let bistEntry: number | null = null
  try {
    const { candles } = await fetchOHLCV('XU100', 3)
    bistEntry = candles[candles.length - 1]?.close ?? null
  } catch {
    /* benchmark opsiyonel */
  }

  const week_start = mondayOf()
  const nowIso = new Date().toISOString()
  const rows = picks.map((p) => ({
    week_start,
    sembol: p.sembol,
    sector_id: p.sector_id,
    baby_score: p.baby_score,
    verdict: p.verdict,
    entry_price: p.entry_price,
    entry_time: nowIso,
    components: p.components,
    risk_flags: p.risk_flags,
    free_float: p.free_float,
    market_cap: p.market_cap,
    pos52: p.pos52,
    range_width: p.range_width,
    bist_entry: bistEntry,
  }))

  // İdempotent: aynı hafta + sembol varsa dokunma (entry fiyatı korunur)
  const { error } = await admin
    .from('baby_picks')
    .upsert(rows, { onConflict: 'week_start,sembol', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, week_start, candidates: store.rows.length, inserted: rows.length, bistEntry })
}
