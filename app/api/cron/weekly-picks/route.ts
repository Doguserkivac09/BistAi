/**
 * Haftanın Seçimleri Cron
 *
 * GET /api/cron/weekly-picks
 * Schedule: Her Pazartesi 05:30 UTC (08:30 TRT) — piyasa açılmadan önce
 *
 * Seçim kriterleri (sıralı ağırlık):
 *  1. confluence_score ≥ 55 (sinyal kalitesi)
 *  2. avg_daily_volume_tl ≥ 10M₺ (likidite)
 *  3. weekly_aligned = true varsa bonus (MTF uyum)
 *  4. Son 90 günde win_rate ≥ 50% (geçmiş başarı)
 *  5. Sinyal 48 saatlik taze (geç kalma önleme)
 *  6. Sektör çeşitlendirme: aynı sektörden max 2 hisse
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { getSector } from '@/lib/sectors';

const CRON_SECRET = process.env.CRON_SECRET;
const PICK_COUNT  = 7;   // Seçilecek hisse sayısı
const MIN_CONFLUENCE = 50;
const MIN_ADV_TL     = 10_000_000; // 10M₺
const MAX_PER_SECTOR = 2;
const SIGNAL_MAX_HOURS = 72; // 3 günden eski sinyal alınmaz

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** ISO hafta numarasını hesapla */
function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { week: weekNum, year: d.getFullYear() };
}

export async function GET(req: NextRequest) {
  // Auth
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdmin();
  const now   = new Date();
  const { week: weekNumber, year } = getISOWeek(now);

  // Bu hafta zaten seçim yapılmış mı?
  const { data: existing } = await admin
    .from('weekly_picks')
    .select('id')
    .eq('week_number', weekNumber)
    .eq('year', year)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({
      ok: true,
      message: `Hafta ${weekNumber}/${year} için seçim zaten yapılmış`,
      skipped: true,
    });
  }

  // signal_performance'dan taze + güçlü sinyalleri çek
  const cutoff = new Date(now.getTime() - SIGNAL_MAX_HOURS * 60 * 60 * 1000);

  const { data: signals, error } = await admin
    .from('signal_performance')
    .select('sembol, signal_type, direction, entry_price, entry_time, confluence_score, avg_daily_volume_tl, weekly_aligned, regime')
    .eq('evaluated', false)
    .eq('direction', 'yukari')  // Sadece AL sinyalleri
    .gte('entry_time', cutoff.toISOString())
    .gte('confluence_score', MIN_CONFLUENCE)
    .gte('avg_daily_volume_tl', MIN_ADV_TL)
    .order('confluence_score', { ascending: false })
    .limit(100);

  if (error || !signals?.length) {
    return NextResponse.json({
      ok: false,
      error: error?.message ?? 'Uygun sinyal bulunamadı',
      week: weekNumber,
      year,
    }, { status: 500 });
  }

  // Geçmiş win rate'leri çek (son 90 gün)
  const ninety = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const { data: perfData } = await admin
    .from('signal_performance')
    .select('sembol, signal_type, return_7d')
    .eq('evaluated', true)
    .gte('entry_time', ninety.toISOString());

  // Sembol bazında win rate hesapla
  const winRateMap = new Map<string, { wins: number; total: number }>();
  for (const r of perfData ?? []) {
    const key = r.sembol;
    const cur = winRateMap.get(key) ?? { wins: 0, total: 0 };
    cur.total++;
    if ((r.return_7d ?? 0) > 0.004) cur.wins++; // komisyon üstü getiri
    winRateMap.set(key, cur);
  }

  // Her sembol için skor hesapla
  interface ScoredSignal {
    sembol: string;
    signal_type: string;
    entry_price: number;
    entry_time: string;
    confluence_score: number;
    avg_daily_volume_tl: number | null;
    weekly_aligned: boolean | null;
    win_rate: number | null;
    composite: number;
    sector_id: string;
    sector_name: string;
  }

  // Sembol başına en yüksek confluence'ı al (tekrar olmasın)
  const sembolMap = new Map<string, typeof signals[0]>();
  for (const sig of signals) {
    const existing = sembolMap.get(sig.sembol);
    if (!existing || (sig.confluence_score ?? 0) > (existing.confluence_score ?? 0)) {
      sembolMap.set(sig.sembol, sig);
    }
  }

  const scored: ScoredSignal[] = [];
  for (const [sembol, sig] of sembolMap) {
    const sec = getSector(sembol);
    const wr = winRateMap.get(sembol);
    const winRate = wr && wr.total >= 5 ? wr.wins / wr.total : null;

    // Composite skor
    let composite = sig.confluence_score ?? 0;
    if (sig.weekly_aligned) composite += 10;    // MTF bonus
    if (winRate !== null) composite += winRate * 20; // Win rate bonus (0-20 puan)
    const advBonus = Math.min((sig.avg_daily_volume_tl ?? 0) / 10_000_000, 5); // Likidite bonus (0-5)
    composite += advBonus;

    scored.push({
      sembol,
      signal_type: sig.signal_type ?? '',
      entry_price: sig.entry_price ?? 0,
      entry_time: sig.entry_time ?? now.toISOString(),
      confluence_score: sig.confluence_score ?? 0,
      avg_daily_volume_tl: sig.avg_daily_volume_tl ?? null,
      weekly_aligned: sig.weekly_aligned ?? null,
      win_rate: winRate,
      composite,
      sector_id: sec.id,
      sector_name: sec.shortName,
    });
  }

  // Skor sıralı
  scored.sort((a, b) => b.composite - a.composite);

  // Sektör çeşitlendirmesi: aynı sektörden max MAX_PER_SECTOR
  const picks: ScoredSignal[] = [];
  const sectorCount = new Map<string, number>();

  for (const sig of scored) {
    if (picks.length >= PICK_COUNT) break;
    const cnt = sectorCount.get(sig.sector_id) ?? 0;
    if (cnt >= MAX_PER_SECTOR) continue;
    picks.push(sig);
    sectorCount.set(sig.sector_id, cnt + 1);
  }

  if (picks.length === 0) {
    return NextResponse.json({ ok: false, error: 'Çeşitlendirme sonrası seçim kalmadı' }, { status: 500 });
  }

  // BIST referans fiyatı (XU100)
  let bistEntry: number | null = null;
  try {
    const { candles } = await fetchOHLCV('XU100', 3);
    bistEntry = candles[candles.length - 1]?.close ?? null;
  } catch { /* opsiyonel */ }

  // DB'ye yaz
  const rows = picks.map((p) => ({
    week_number:     weekNumber,
    year,
    sembol:          p.sembol,
    sector_id:       p.sector_id,
    sector_name:     p.sector_name,
    entry_price:     p.entry_price,
    entry_time:      p.entry_time,
    confluence_score: p.confluence_score,
    signal_types:    [p.signal_type].filter(Boolean),
    weekly_aligned:  p.weekly_aligned,
    bist_entry:      bistEntry,
    is_closed:       false,
  }));

  const { error: insertErr } = await admin
    .from('weekly_picks')
    .insert(rows);

  if (insertErr) {
    console.error('[weekly-picks] Insert hatası:', insertErr.message);
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  console.log(`[weekly-picks] Hafta ${weekNumber}/${year}: ${picks.length} hisse seçildi`);

  return NextResponse.json({
    ok: true,
    week: weekNumber,
    year,
    picks: picks.map((p) => ({
      sembol: p.sembol,
      sector: p.sector_name,
      confluence: p.confluence_score,
      winRate: p.win_rate !== null ? `%${Math.round(p.win_rate * 100)}` : 'Yetersiz veri',
      composite: Math.round(p.composite),
    })),
  });
}
