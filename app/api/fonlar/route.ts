/**
 * Fon okuma API'si (FON-ANALIZ-PLAN F7).
 * GET /api/fonlar?universe=TEFAS|BES
 *
 * `ai_cache` tek satırını okur — istek anında TEFAS'a GİTMEZ (fan-out YOK).
 * Ham kayan pencere yanıta DAHİL EDİLMEZ: hem ağır, hem de lisans ilkesi gereği
 * ham veri seti yayınlanmaz — yalnız TÜRETİLMİŞ analiz servis edilir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getFundStore, MIN_INVESTORS, MIN_PEER } from '@/lib/fund-runner';
import type { FundUniverse } from '@/lib/fund-universe';

export const dynamic = 'force-dynamic';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req.headers);
  const rl = checkRateLimit(`${ip}:fonlar`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });

  const universe = (req.nextUrl.searchParams.get('universe') ?? 'TEFAS') as FundUniverse;
  if (universe !== 'TEFAS' && universe !== 'BES') {
    return NextResponse.json({ error: 'universe TEFAS veya BES olmalı' }, { status: 400 });
  }

  const store = await getFundStore(createAdmin(), universe);
  if (!store) {
    return NextResponse.json(
      { available: false, universe, message: 'Fon verisi henüz hazırlanmadı (günlük cron).' },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } },
    );
  }

  // `raw` KASITLI olarak dışarı verilmiyor (ağır + ham veri yayınlanmaz)
  return NextResponse.json(
    {
      available: true,
      universe,
      scannedAt: store.scannedAt,
      policyRate: store.policyRate,
      inflation: store.inflation,
      minInvestors: MIN_INVESTORS,
      minPeer: MIN_PEER,
      count: store.items.length,
      funds: store.items,
      note: store.note,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=1800' } },
  );
}
