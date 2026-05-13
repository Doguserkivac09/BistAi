/**
 * Haftanın Seçimleri Public API
 *
 * GET /api/weekly-picks          → Bu hafta + son 8 hafta
 * GET /api/weekly-picks?week=N&year=Y → Belirli hafta
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { week: weekNum, year: d.getFullYear() };
}

export async function GET(req: NextRequest) {
  const admin = createAdmin();
  const { searchParams } = req.nextUrl;

  const { week: currentWeek, year: currentYear } = getISOWeek(new Date());

  // Son 8 hafta seçimlerini çek
  const { data: picks, error } = await admin
    .from('weekly_picks')
    .select('*')
    .order('year', { ascending: false })
    .order('week_number', { ascending: false })
    .limit(80); // 8 hafta × max 10 seçim

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allPicks = picks ?? [];

  // Bu haftanın seçimleri
  const thisWeek = allPicks.filter(
    (p) => p.week_number === currentWeek && p.year === currentYear,
  );

  // Canlı fiyat güncelle — sadece açık pozisyonlar
  const openPicks = thisWeek.filter((p) => !p.is_closed);
  if (openPicks.length > 0) {
    const uniqueSymbols = [...new Set(openPicks.map((p) => p.sembol as string))];
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

    // Canlı return hesapla
    for (const pick of openPicks) {
      const live = priceMap.get(pick.sembol);
      if (live && pick.entry_price) {
        (pick as Record<string, unknown>).live_price = live;
        (pick as Record<string, unknown>).live_return_pct = parseFloat(
          (((live - pick.entry_price) / pick.entry_price) * 100).toFixed(2),
        );
      }
    }
  }

  // Hafta bazında grupla
  const weekMap = new Map<string, { week: number; year: number; picks: typeof allPicks; summary: {
    avgReturn: number | null;
    bistReturn: number | null;
    closedCount: number;
    outperformed: boolean | null;
  } }>();

  for (const pick of allPicks) {
    const key = `${pick.year}-${pick.week_number}`;
    if (!weekMap.has(key)) {
      weekMap.set(key, { week: pick.week_number, year: pick.year, picks: [], summary: { avgReturn: null, bistReturn: null, closedCount: 0, outperformed: null } });
    }
    weekMap.get(key)!.picks.push(pick);
  }

  // Her hafta için özet hesapla (kapanmış haftalar)
  for (const [, wk] of weekMap) {
    const closed = wk.picks.filter((p) => p.is_closed && p.return_pct !== null);
    if (closed.length === 0) continue;
    const avgReturn = closed.reduce((s, p) => s + (p.return_pct ?? 0), 0) / closed.length;
    const bistReturn = closed[0]?.bist_return_pct ?? null;
    wk.summary = {
      avgReturn: parseFloat(avgReturn.toFixed(2)),
      bistReturn,
      closedCount: closed.length,
      outperformed: bistReturn !== null ? avgReturn > bistReturn : null,
    };
  }

  const weeks = [...weekMap.values()].slice(0, 8);

  // Toplam performans özeti (son 4 hafta kapalı olanlar)
  const closedWeeks = weeks.filter((w) => w.summary.closedCount > 0);
  const totalAvg = closedWeeks.length > 0
    ? closedWeeks.reduce((s, w) => s + (w.summary.avgReturn ?? 0), 0) / closedWeeks.length
    : null;
  const outperformedCount = closedWeeks.filter((w) => w.summary.outperformed === true).length;

  return NextResponse.json(
    {
      ok: true,
      currentWeek,
      currentYear,
      thisWeek,
      weeks,
      stats: {
        totalWeeks: closedWeeks.length,
        avgReturn: totalAvg !== null ? parseFloat(totalAvg.toFixed(2)) : null,
        outperformedCount,
        outperformedRate: closedWeeks.length > 0
          ? Math.round((outperformedCount / closedWeeks.length) * 100)
          : null,
      },
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}
