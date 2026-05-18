/**
 * Haftanın Seçimleri Cron — v2 (Dip Katılım Algoritması)
 *
 * GET /api/cron/weekly-picks
 * Schedule: Her Pazartesi 05:30 UTC (08:30 TRT)
 *
 * YENİ ALGORİTMA: 4 Piyasa Aşaması Sistemi
 *
 *  Aşama 1 — Dip (RSI 20-35): Erken giriş, küçük pozisyon
 *  Aşama 2 — Birikim (RSI 35-55): Optimal giriş ← en çok puan
 *  Aşama 3 — Rally (RSI 55-75): Momentum devam ediyor
 *  Aşama 4 — Aşırı Alım (RSI 75+): Dikkatli, küçük pozisyon
 *
 * "Dip Katılım Skoru" = dipten çıkmış + hacim birikiyor + henüz patlamadı
 *
 * Hedef: Her aşamadan seçim yaparak çeşitlendirilmiş ama yüksek kaliteli
 *        haftalık portföy oluşturmak.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { getSector } from '@/lib/sectors';
import { calcDipCatchScore, detectPhase } from '@/lib/market-phase';

const CRON_SECRET    = process.env.CRON_SECRET;
const PICK_COUNT     = 7;
const MIN_CONFLUENCE = 45;
const MIN_ADV_TL     = 8_000_000;  // 8M₺ (önceki 10M'den biraz gevşettik)
const MAX_PER_SECTOR = 2;
const SIGNAL_MAX_HOURS = 72;

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
  const weekNum = 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
  );
  return { week: weekNum, year: d.getFullYear() };
}

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdmin();
  const now = new Date();
  const { week: weekNumber, year } = getISOWeek(now);

  // Bu hafta zaten yapıldı mı?
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

  // ── Adım 1: scan_cache'den RSI + hacim + 52H verisini çek ─────────────
  const { data: cacheData } = await admin
    .from('scan_cache')
    .select('sembol, rsi, rel_vol5, pct_from_52w_high, pct_from_52w_low, signals_json, last_volume, confluence_score')
    .not('rsi', 'is', null)
    .gte('last_volume', MIN_ADV_TL / 50) // kabaca hacim filtresi
    .order('scanned_at', { ascending: false });

  const scanMap = new Map<string, {
    rsi: number;
    relVol5: number | null;
    pctFromHigh: number | null;
    pctFromLow: number | null;
    hasHigherLows: boolean;
    hasBollingerSqueeze: boolean;
    hasPreSignal: boolean;
    confluenceScore: number | null;
  }>();

  const PRE_SIGNAL_TYPES = ['Altın Çapraz Yaklaşıyor', 'Trend Olgunlaşıyor', 'Direnç Testi', 'MACD Daralıyor'];
  const SQUEEZE_TYPES = ['Bollinger Sıkışması'];
  const HL_TYPES = ['Higher Lows'];

  for (const row of cacheData ?? []) {
    if (!row.rsi) continue;
    const sigs = (row.signals_json ?? []) as Array<{ type: string }>;
    scanMap.set(row.sembol, {
      rsi: row.rsi,
      relVol5: row.rel_vol5 ?? null,
      pctFromHigh: row.pct_from_52w_high ?? null,
      pctFromLow: row.pct_from_52w_low ?? null,
      hasHigherLows: sigs.some((s) => HL_TYPES.includes(s.type)),
      hasBollingerSqueeze: sigs.some((s) => SQUEEZE_TYPES.includes(s.type)),
      hasPreSignal: sigs.some((s) => PRE_SIGNAL_TYPES.includes(s.type)),
      confluenceScore: row.confluence_score ?? null,
    });
  }

  // ── Adım 2: signal_performance'dan taze AL sinyallerini çek ───────────
  const cutoff = new Date(now.getTime() - SIGNAL_MAX_HOURS * 60 * 60 * 1000);

  const { data: signals } = await admin
    .from('signal_performance')
    .select('sembol, signal_type, direction, entry_price, entry_time, confluence_score, avg_daily_volume_tl, weekly_aligned')
    .eq('evaluated', false)
    .eq('direction', 'yukari')
    .gte('entry_time', cutoff.toISOString())
    .gte('confluence_score', MIN_CONFLUENCE)
    .gte('avg_daily_volume_tl', MIN_ADV_TL)
    .order('confluence_score', { ascending: false })
    .limit(150);

  if (!signals?.length) {
    return NextResponse.json({ ok: false, error: 'Uygun sinyal bulunamadı' }, { status: 500 });
  }

  // ── Adım 3: Geçmiş win rate'leri hesapla ──────────────────────────────
  const ninety = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const { data: perfData } = await admin
    .from('signal_performance')
    .select('sembol, return_7d')
    .eq('evaluated', true)
    .gte('entry_time', ninety.toISOString());

  const winRateMap = new Map<string, { wins: number; total: number }>();
  for (const r of perfData ?? []) {
    const cur = winRateMap.get(r.sembol) ?? { wins: 0, total: 0 };
    cur.total++;
    if ((r.return_7d ?? 0) > 0.004) cur.wins++;
    winRateMap.set(r.sembol, cur);
  }

  // ── Adım 3.5: KAP kritik olay filtresi (son 48s) ─────────────────────
  const kapBlacklist = new Set<string>();
  try {
    const { fetchKapDuyurular } = await import('@/lib/kap');
    const kapItems = await fetchKapDuyurular(100);
    const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;
    const KRITIK_KEYWORDS = ['iflas', 'konkord', 'temerrüt', 'icra', 'haciz', 'esas faaliyeti', 'delisted', 'fon çekimi', 'yönetim kurulu istifa'];
    for (const item of kapItems) {
      const ts = new Date(item.tarih).getTime();
      if (ts < cutoff48h) continue;
      const baslik = item.baslik?.toLowerCase() ?? '';
      if (KRITIK_KEYWORDS.some((k) => baslik.includes(k))) {
        if (item.sembol) kapBlacklist.add(item.sembol.toUpperCase());
      }
    }
  } catch { /* KAP verisi alınamazsa filtre atla */ }

  // ── Devre kesici: XU100 bugün %3'ten düştüyse confluence barını yükselt ─
  let effectiveMinConfluence = MIN_CONFLUENCE;
  try {
    const { fetchOHLCV } = await import('@/lib/yahoo');
    const { candles: xu100 } = await fetchOHLCV('XU100', 3);
    if (xu100.length >= 2) {
      const todayChg = ((xu100[xu100.length-1]!.close - xu100[xu100.length-2]!.close) / xu100[xu100.length-2]!.close) * 100;
      if (todayChg < -3.0) effectiveMinConfluence = 65; // kötü günde daha katı filtre
    }
  } catch { /* devam */ }

  // ── Adım 4: Sembol bazında en güçlüyü al + Dip Katılım Skoru hesapla ──
  const sembolMap = new Map<string, typeof signals[0]>();
  for (const sig of signals) {
    const ex = sembolMap.get(sig.sembol);
    if (!ex || (sig.confluence_score ?? 0) > (ex.confluence_score ?? 0)) {
      sembolMap.set(sig.sembol, sig);
    }
  }

  interface ScoredPick {
    sembol: string;
    signal_type: string;
    entry_price: number;
    entry_time: string;
    confluence_score: number;
    avg_daily_volume_tl: number | null;
    weekly_aligned: boolean | null;
    win_rate: number | null;
    dip_score: number;       // Dip Katılım Skoru
    phase: number;           // 1-4
    phase_label: string;
    sector_id: string;
    sector_name: string;
  }

  const scored: ScoredPick[] = [];

  for (const [sembol, sig] of sembolMap) {
    // KAP kara liste filtresi
    if (kapBlacklist.has(sembol)) continue;
    // Devre kesici durumunda confluence barını yükselt
    if ((sig.confluence_score ?? 0) < effectiveMinConfluence) continue;

    const scan = scanMap.get(sembol);
    const sec = getSector(sembol);
    const wr = winRateMap.get(sembol);
    const winRate = wr && wr.total >= 5 ? wr.wins / wr.total : null;
    const phaseResult = detectPhase(scan?.rsi ?? null);

    const dipScore = calcDipCatchScore({
      rsi:                  scan?.rsi ?? null,
      pctFrom52wLow:        scan?.pctFromLow ?? null,
      pctFrom52wHigh:       scan?.pctFromHigh ?? null,
      relVol5:              scan?.relVol5 ?? null,
      hasHigherLows:        scan?.hasHigherLows ?? false,
      hasBollingerSqueeze:  scan?.hasBollingerSqueeze ?? false,
      hasPreSignal:         scan?.hasPreSignal ?? false,
      weeklyAligned:        sig.weekly_aligned ?? null,
      confluenceScore:      sig.confluence_score ?? null,
      winRate,
    });

    scored.push({
      sembol,
      signal_type:         sig.signal_type ?? '',
      entry_price:         sig.entry_price ?? 0,
      entry_time:          sig.entry_time ?? now.toISOString(),
      confluence_score:    sig.confluence_score ?? 0,
      avg_daily_volume_tl: sig.avg_daily_volume_tl ?? null,
      weekly_aligned:      sig.weekly_aligned ?? null,
      win_rate:            winRate,
      dip_score:           dipScore,
      phase:               phaseResult?.phase ?? 2,
      phase_label:         phaseResult?.shortLabel ?? 'Birikim',
      sector_id:           sec.id,
      sector_name:         sec.shortName,
    });
  }

  // ── Adım 5: Dip Katılım Skoru'na göre sırala ──────────────────────────
  scored.sort((a, b) => b.dip_score - a.dip_score);

  // ── Adım 6: Sektör çeşitlendirmesi + HER AŞAMADAN seçim ──────────────
  const picks: ScoredPick[] = [];
  const sectorCount = new Map<string, number>();
  const phaseCount  = new Map<number, number>();

  // Her aşamadan en az 1 hisse dahil etmeye çalış (mümkünse)
  const MAX_PER_PHASE: Record<number, number> = { 1: 2, 2: 3, 3: 2, 4: 1 };

  for (const sig of scored) {
    if (picks.length >= PICK_COUNT) break;

    const sectorCnt = sectorCount.get(sig.sector_id) ?? 0;
    if (sectorCnt >= MAX_PER_SECTOR) continue;

    const phaseCnt = phaseCount.get(sig.phase) ?? 0;
    const maxPhase = MAX_PER_PHASE[sig.phase] ?? 2;
    if (phaseCnt >= maxPhase) continue;

    picks.push(sig);
    sectorCount.set(sig.sector_id, sectorCnt + 1);
    phaseCount.set(sig.phase, phaseCnt + 1);
  }

  // Eğer yeterli hisse dolmadıysa, kalan slotları en iyi skordan doldur
  if (picks.length < PICK_COUNT) {
    for (const sig of scored) {
      if (picks.length >= PICK_COUNT) break;
      if (picks.some((p) => p.sembol === sig.sembol)) continue;
      const sectorCnt = sectorCount.get(sig.sector_id) ?? 0;
      if (sectorCnt >= MAX_PER_SECTOR) continue;
      picks.push(sig);
      sectorCount.set(sig.sector_id, sectorCnt + 1);
    }
  }

  if (!picks.length) {
    return NextResponse.json({ ok: false, error: 'Seçim yapılamadı' }, { status: 500 });
  }

  // ── Adım 7: BIST referans fiyatı ──────────────────────────────────────
  let bistEntry: number | null = null;
  try {
    const { candles } = await fetchOHLCV('XU100', 3);
    bistEntry = candles[candles.length - 1]?.close ?? null;
  } catch { /* opsiyonel */ }

  // ── Adım 8: DB'ye yaz ─────────────────────────────────────────────────
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
    notes:           `Aşama ${p.phase} — ${p.phase_label} | Dip Skor: ${p.dip_score}`,
  }));

  const { error: insertErr } = await admin.from('weekly_picks').insert(rows);

  if (insertErr) {
    console.error('[weekly-picks] Insert hatası:', insertErr.message);
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  // Aşama dağılımı
  const phaseDist = picks.reduce((acc, p) => {
    acc[`Aşama${p.phase}`] = (acc[`Aşama${p.phase}`] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`[weekly-picks] Hafta ${weekNumber}/${year}: ${picks.length} hisse | ${JSON.stringify(phaseDist)}`);

  return NextResponse.json({
    ok: true,
    week: weekNumber,
    year,
    phaseDist,
    picks: picks.map((p) => ({
      sembol:    p.sembol,
      sector:    p.sector_name,
      phase:     p.phase,
      phaseLabel: p.phase_label,
      dipScore:  p.dip_score,
      confluence: p.confluence_score,
      winRate:   p.win_rate !== null ? `%${Math.round(p.win_rate * 100)}` : '—',
    })),
  });
}
