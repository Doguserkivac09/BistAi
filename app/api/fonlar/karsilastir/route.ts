/**
 * Fon karşılaştırma API'si (FON-ANALIZ-PLAN F6-3).
 * GET /api/fonlar/karsilastir?kod=AFJ,AGM,BNB&universe=BES
 *
 * ⚠️ TEFAS'A İSTEK YOK — her şey tablodan ve sunum önbelleğinden.
 *
 * ⚠️ EN FAZLA `MAX_KARSILASTIRMA` fon: hem ekranda okunabilirlik hem de tek istekte
 * çok sayıda seri döndürmemek için. Ham seri döndüğü için hız sınırı dardır
 * (tek fon detayıyla aynı gerekçe — toplu veri çekimine dönüşmesin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getFundStore, MAX_KARSILASTIRMA } from '@/lib/fund-runner';
import { getFlowSeries, businessDaysBack } from '@/lib/fund-store';
import type { FundUniverse } from '@/lib/fund-universe';

export const dynamic = 'force-dynamic';

const SERI_GUN = 260;

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req.headers);
  const rl = checkRateLimit(`${ip}:fon-karsilastir`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });

  const universe = (req.nextUrl.searchParams.get('universe') ?? 'TEFAS') as FundUniverse;
  if (universe !== 'TEFAS' && universe !== 'BES') {
    return NextResponse.json({ error: 'universe TEFAS veya BES olmalı' }, { status: 400 });
  }

  const kodlar = (req.nextUrl.searchParams.get('kod') ?? '')
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter((k) => /^[A-Z0-9]{2,6}$/.test(k))
    .slice(0, MAX_KARSILASTIRMA);

  if (kodlar.length === 0) {
    return NextResponse.json({ error: 'En az bir fon kodu gerekli.' }, { status: 400 });
  }

  const sb = createAdmin();
  const store = await getFundStore(sb, universe);
  if (!store) {
    return NextResponse.json(
      { available: false, universe, message: 'Fon verisi henüz hazırlanmadı.' },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } },
    );
  }

  const funds = kodlar
    .map((k) => store.items.find((x) => x.code === k))
    .filter((x): x is NonNullable<typeof x> => x != null);

  // İstenip bulunamayanlar sessizce düşmez — ekran bunu söyleyebilmeli.
  const bulunamayan = kodlar.filter((k) => !funds.some((f) => f.code === k));

  const from = businessDaysBack(SERI_GUN)[SERI_GUN - 1]!;
  const seriMap = funds.length > 0
    ? await getFlowSeries(sb, universe, from, funds.map((f) => f.code))
    : new Map();

  const series: Record<string, Array<{ d: string; p: number }>> = {};
  for (const f of funds) {
    series[f.code] = (seriMap.get(f.code) ?? [])
      .filter((p: { price: number }) => Number.isFinite(p.price) && p.price > 0)
      .map((p: { date: string; price: number }) => ({ d: p.date, p: p.price }));
  }

  return NextResponse.json(
    {
      available: true,
      universe,
      scannedAt: store.scannedAt,
      policyRate: store.policyRate,
      inflation: store.inflation,
      funds,
      series,
      bulunamayan,
      maxFon: MAX_KARSILASTIRMA,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=1800' } },
  );
}
