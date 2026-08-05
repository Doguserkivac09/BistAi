/**
 * Fırsat Sicili — okuma API'si
 * GET /api/firsat-sicil?tier=onayli   (varsayılan: onayli)
 * GET /api/firsat-sicil?tier=tumu
 *
 * "Gösterdiğimiz kurulumlar gerçekte ne getirdi, BIST'i geçti mi?" — ürünün
 * en önemli iddiasının ölçümü. Veri `firsat_picks` (ileriye dönük snapshot).
 *
 * DÜRÜSTLÜK: örneklem MIN_SAMPLE altındaysa oran DÖNMEZ (null) — "n=2 ile %100"
 * gibi bir sayı üretilmez. Kayıt yeni başladıysa `collecting:true` döner ve
 * UI "veri birikiyor" der; boş sicil sahte rakamla doldurulmaz.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { computeTrackRecord, MIN_SAMPLE, type FirsatPickRow } from '@/lib/firsat-picks';

export const dynamic = 'force-dynamic';

function createAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req.headers);
  const rl = checkRateLimit(`${ip}:sicil`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });

  const tierParam = req.nextUrl.searchParams.get('tier') ?? 'onayli';
  const tier = tierParam === 'tumu' ? undefined : tierParam;

  const admin = createAdmin();
  const { data, error } = await admin
    .from('firsat_picks')
    .select('sembol, week_start, tier, direction, score, ret_1w, bist_ret_1w, ret_2w, bist_ret_2w, ret_4w, bist_ret_4w')
    .order('week_start', { ascending: false })
    .limit(2000);

  if (error) {
    // Tablo henüz oluşturulmadıysa (migration bekliyor) sessizce "veri yok" de.
    return NextResponse.json(
      { available: false, collecting: true, message: 'Sicil kaydı henüz başlamadı.' },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } },
    );
  }

  const rows = (data ?? []) as FirsatPickRow[];
  const record = computeTrackRecord(rows, tier);
  const olculen = record.horizons.some((h) => h.n >= MIN_SAMPLE);

  return NextResponse.json(
    {
      available: record.totalPicks > 0,
      /** Kayıt var ama hiçbir ufukta yeterli örneklem yok → "birikiyor" */
      collecting: !olculen,
      tier: tierParam,
      minSample: MIN_SAMPLE,
      ...record,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=1800' } },
  );
}
