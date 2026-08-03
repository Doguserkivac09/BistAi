/**
 * Banka Sağlık okuma API'si (BANKA-MOTORU-PLAN FAZ K2-6).
 * GET /api/bank-health            → tüm bankalar
 * GET /api/bank-health?symbol=X   → tek banka
 *
 * ai_cache `bank-health:BIST` tek satırını okur — fan-out YOK.
 * Store yoksa `available:false` döner (uydurma veri üretilmez).
 *
 * ⚠️ Yalnız TÜRETİLMİŞ oran/skor servis edilir; ham İş Yatırım tablosu dışa verilmez.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeTicker } from '@/lib/sanitize';
import { getBankHealthMap } from '@/lib/bank-health-runner';
import { isBankSector } from '@/lib/bank-health';
import { getSectorId } from '@/lib/sectors';

export const dynamic = 'force-dynamic';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req.headers);
  const rl = checkRateLimit(`${ip}:bank-health`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });

  const symbol = sanitizeTicker(req.nextUrl.searchParams.get('symbol') ?? '');

  const map = await getBankHealthMap(createAdminClient());
  if (!map) {
    return NextResponse.json(
      { available: false, message: 'Banka değerlendirmesi henüz hesaplanmadı (haftalık cron).' },
      { headers: { 'Cache-Control': 'public, s-maxage=120' } },
    );
  }

  if (symbol) {
    if (!isBankSector(getSectorId(symbol))) {
      return NextResponse.json({ symbol, available: false, message: 'Banka sektöründe değil.' });
    }
    const entry = map[symbol];
    if (!entry) {
      return NextResponse.json({ symbol, available: false, message: 'Bu banka için veri yok.' });
    }
    return NextResponse.json(
      { symbol, available: true, ...entry },
      { headers: { 'Cache-Control': 'public, s-maxage=1800' } },
    );
  }

  return NextResponse.json(
    { available: true, count: Object.keys(map).length, banks: map },
    { headers: { 'Cache-Control': 'public, s-maxage=1800' } },
  );
}
