export const dynamic = 'force-dynamic'
/**
 * Akıllı Para + Teknik Sinyal API.
 *
 *  GET /api/smart-signal            → tüm liste (skor sıralı) + scoredAt
 *  GET /api/smart-signal?symbol=THYAO → tek sembol STRICT JSON (spec çıktısı)
 *
 * İstek-anı hesap YOK — yalnız ai_cache `smart-signal:BIST` okunur (cron precompute).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStoredSmartSignal } from '@/lib/smart-signal-runner'

function createAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request: NextRequest) {
  const sb = createAdmin()
  const store = await getStoredSmartSignal(sb)
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()

  if (!store) {
    return NextResponse.json(
      {
        ok: true,
        pending: true,
        message: 'Tarama henüz çalışmadı. Manuel: /api/cron/smart-signal',
        results: [],
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } },
    )
  }

  // Tek sembol → strict JSON
  if (symbol) {
    const r = store.rows.find((x) => x.symbol === symbol)
    if (!r) {
      return NextResponse.json({ ok: false, error: `Sembol bulunamadı: ${symbol}` }, { status: 404 })
    }
    return NextResponse.json(r, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    })
  }

  return NextResponse.json(
    { ok: true, scoredAt: store.scoredAt, count: store.rows.length, results: store.rows },
    { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } },
  )
}
