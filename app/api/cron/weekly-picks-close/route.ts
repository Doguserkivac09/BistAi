/**
 * Haftanın Seçimleri — Hafta Kapanışı Performans Güncellemesi
 *
 * GET /api/cron/weekly-picks-close
 * Schedule: Her Cuma 18:30 UTC (21:30 TRT) — BIST kapanış sonrası
 *
 * Açık seçimlerin kapanış fiyatlarını çeker ve return hesaplar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';

const CRON_SECRET = process.env.CRON_SECRET;

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdmin();

  // Açık (kapanmamış) seçimleri çek
  const { data: openPicks, error } = await admin
    .from('weekly_picks')
    .select('id, sembol, entry_price, bist_entry, week_number, year')
    .eq('is_closed', false);

  if (error || !openPicks?.length) {
    return NextResponse.json({ ok: true, message: 'Kapanacak seçim yok', updated: 0 });
  }

  const uniqueSymbols = [...new Set(openPicks.map((p) => p.sembol))];
  let bistClose: number | null = null;

  // BIST kapanış
  try {
    const { candles } = await fetchOHLCV('XU100', 3);
    bistClose = candles[candles.length - 1]?.close ?? null;
  } catch { /* opsiyonel */ }

  // Her sembol için kapanış fiyatı çek
  const priceMap = new Map<string, number>();
  await Promise.allSettled(
    uniqueSymbols.map(async (sembol) => {
      try {
        const { candles } = await fetchOHLCV(sembol, 3);
        const last = candles[candles.length - 1]?.close;
        if (last) priceMap.set(sembol, last);
      } catch { /* ignore */ }
    }),
  );

  // Her seçimi güncelle
  let updated = 0;
  for (const pick of openPicks) {
    const closePrice = priceMap.get(pick.sembol);
    if (!closePrice || !pick.entry_price) continue;

    const returnPct = ((closePrice - pick.entry_price) / pick.entry_price) * 100;
    const bistReturnPct = bistClose && pick.bist_entry
      ? ((bistClose - pick.bist_entry) / pick.bist_entry) * 100
      : null;

    const { error: updateErr } = await admin
      .from('weekly_picks')
      .update({
        close_price:     closePrice,
        return_pct:      parseFloat(returnPct.toFixed(2)),
        bist_close:      bistClose,
        bist_return_pct: bistReturnPct !== null ? parseFloat(bistReturnPct.toFixed(2)) : null,
        is_closed:       true,
        closed_at:       new Date().toISOString(),
      })
      .eq('id', pick.id);

    if (!updateErr) updated++;
  }

  return NextResponse.json({ ok: true, updated, totalOpen: openPicks.length });
}
