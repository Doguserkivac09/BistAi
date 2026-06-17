export const dynamic = 'force-dynamic'
/**
 * Bebek Hisseler — Model Performansı (FAZ 4)
 *
 * baby_picks'teki değerlendirilmiş pick'lerden ufuk bazlı hit-rate + ortalama
 * getiri + BIST'i geçme oranını döndürür. /yukselis-adaylari sayfası tüketir.
 * Veri haftalarca birikir; başta boş olabilir (pending).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeBabyPicksPerformance, type EvaluatedPick } from '@/lib/baby-picks'

function createAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET() {
  const admin = createAdmin()

  const { data, error } = await admin
    .from('baby_picks')
    .select('ret_4w, bist_ret_4w, ret_12w, bist_ret_12w, ret_26w, bist_ret_26w')

  if (error) {
    // Tablo henüz yoksa (migration çalışmadı) → boş ama yapısal (kart "veri birikiyor" gösterir)
    return NextResponse.json(
      { ok: true, pending: true, performance: computeBabyPicksPerformance([]), message: 'baby_picks henüz yok' },
      { headers: { 'Cache-Control': 'public, s-maxage=600' } },
    )
  }

  const rows = (data ?? []) as EvaluatedPick[]
  const performance = computeBabyPicksPerformance(rows)
  const hasResults = performance.horizons.some((h) => h.n > 0)

  return NextResponse.json(
    { ok: true, pending: !hasResults, performance },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
  )
}
