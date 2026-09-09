/**
 * Tek fon detayı (FON-FAZ6-PLAN 6C).
 * GET /api/fonlar/<kod>?universe=TEFAS|BES
 *
 * ⚠️ TEFAS'A İSTEK YOK — her şey tablodan. Store'daki hesaplanmış giriş
 * (skor/sıra/rozet/dönemler) + o fonun fiyat & yatırımcı serisi.
 *
 * ⚠️ LİSANS İLKESİ: `/api/fonlar` ham seriyi bilinçli olarak yayınlamaz.
 * Burada TEK fonun serisi dönüyor, çünkü ürünün çekirdek görseli (fiyat ile
 * yatırımcı sayısının ayrışması) veri noktaları olmadan çizilemez. Bu, evrenin
 * ham veri setini dağıtmak DEĞİLDİR: tek fon, tek grafik, günlük çözünürlük.
 * Toplu indirmeye dönüşmemesi için hız sınırı burada daha dardır.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getFundStore } from '@/lib/fund-runner';
import { getFlowSeries, businessDaysBack } from '@/lib/fund-store';
import type { FundUniverse } from '@/lib/fund-universe';

export const dynamic = 'force-dynamic';

/** Grafikte gösterilen geçmiş (iş günü) — elde 240 gün var. */
const SERI_GUN = 260;

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { kod: string } },
) {
  const ip = getClientIP(req.headers);
  // Tek fon serisi döndüğü için toplu çekimi caydıracak kadar dar.
  const rl = checkRateLimit(`${ip}:fon-detay`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });

  const universe = (req.nextUrl.searchParams.get('universe') ?? 'TEFAS') as FundUniverse;
  if (universe !== 'TEFAS' && universe !== 'BES') {
    return NextResponse.json({ error: 'universe TEFAS veya BES olmalı' }, { status: 400 });
  }

  const kod = params.kod?.toUpperCase().trim();
  if (!kod || !/^[A-Z0-9]{2,6}$/.test(kod)) {
    return NextResponse.json({ error: 'Geçersiz fon kodu.' }, { status: 400 });
  }

  const sb = createAdmin();
  const store = await getFundStore(sb, universe);
  const fund = store?.items.find((x) => x.code === kod) ?? null;

  if (!fund) {
    // Evren eşiğinin altındaki fon da buraya düşer — "yok" değil, "listelenmiyor".
    return NextResponse.json(
      {
        available: false,
        code: kod,
        universe,
        message: store
          ? 'Bu fon listede yok. Çok az yatırımcısı olduğu için taranmıyor olabilir.'
          : 'Fon verisi henüz hazırlanmadı.',
      },
      { status: 404, headers: { 'Cache-Control': 'public, s-maxage=300' } },
    );
  }

  const from = businessDaysBack(SERI_GUN)[SERI_GUN - 1]!;
  const seriMap = await getFlowSeries(sb, universe, from, [kod]);
  const seri = (seriMap.get(kod) ?? [])
    .filter((p) => Number.isFinite(p.price) && p.price > 0)
    .map((p) => ({ d: p.date, p: p.price, y: p.investors }));

  return NextResponse.json(
    {
      available: true,
      universe,
      scannedAt: store!.scannedAt,
      policyRate: store!.policyRate,
      inflation: store!.inflation,
      fund,
      /** Çift eksenli grafik için: tarih · fiyat · yatırımcı sayısı */
      series: seri,
      coverage: store!.coverage ?? null,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=1800' } },
  );
}
