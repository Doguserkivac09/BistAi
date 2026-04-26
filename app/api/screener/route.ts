/**
 * Özel Screener API
 *
 * GET /api/screener?sector=banka&signalType=RSI+Uyumsuzluğu&severity=güçlü
 *                 &rsiMin=20&rsiMax=40&changeMin=-5&changeMax=5
 *                 &volumeMin=1000000&limit=100
 *
 * scan_cache tablosunu filtreler — cron her sabah RSI/hacim/sektör'ü doldurur.
 * Auth: gerekmez (public)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SECTORS } from '@/lib/sectors';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// "0" ve "0.0" gibi sıfır değerleri korur — `parseFloat(x) || null` deseni 0'ı eziyordu (B1).
function parseNum(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const sector       = searchParams.get('sector')?.trim()     || null;
  const signalType   = searchParams.get('signalType')?.trim() || null;
  const severity     = searchParams.get('severity')?.trim()   || null;
  const direction    = searchParams.get('direction')?.trim()  || null; // 'yukari' | 'asagi'
  const mtfOnly      = searchParams.get('mtfOnly') === '1';
  const rsiMin       = parseNum(searchParams.get('rsiMin'));
  const rsiMax       = parseNum(searchParams.get('rsiMax'));
  const changeMin    = parseNum(searchParams.get('changeMin'));
  const changeMax    = parseNum(searchParams.get('changeMax'));
  const volumeMin    = parseNum(searchParams.get('volumeMin'));
  const confluenceMin = parseNum(searchParams.get('confluenceMin'));
  // 52H/dip yakınlığı: -3 → tepeye %3 (veya daha) yakın; +5 → diptan %5+ yukarıda
  const near52wHighMaxPctAway = parseNum(searchParams.get('near52wHigh')); // örn 3 = "tepeye %3 mesafe içinde"
  const near52wLowMaxPctAbove = parseNum(searchParams.get('near52wLow'));  // örn 10 = "diptan %10 mesafe içinde"
  const relVol5Min    = parseNum(searchParams.get('relVol5Min'));
  const limit         = Math.min(parseInt(searchParams.get('limit') ?? '200'), 300);

  const admin = createAdminClient();

  let query = admin
    .from('scan_cache')
    .select('sembol, signals_json, change_percent, rsi, last_volume, last_close, confluence_score, pct_from_52w_high, pct_from_52w_low, rel_vol5, sector, scanned_at')
    .order('scanned_at', { ascending: false });

  // Confluence filtresi — DB seviyesinde
  if (confluenceMin !== null) query = query.gte('confluence_score', confluenceMin);

  // 52H tepe yakınlığı: pct_from_52w_high negatif değer; "%3 yakın" = pct >= -3
  if (near52wHighMaxPctAway !== null) {
    query = query.gte('pct_from_52w_high', -Math.abs(near52wHighMaxPctAway));
  }
  // 52H dip yakınlığı: pct_from_52w_low pozitif; "diptan %10 içinde" = pct <= 10
  if (near52wLowMaxPctAbove !== null) {
    query = query.lte('pct_from_52w_low', Math.abs(near52wLowMaxPctAbove));
  }

  // Relative volume filtresi
  if (relVol5Min !== null) query = query.gte('rel_vol5', relVol5Min);

  // Sektör filtresi — DB seviyesinde
  if (sector) query = query.eq('sector', sector);

  // RSI filtresi — DB seviyesinde
  if (rsiMin !== null) query = query.gte('rsi', rsiMin);
  if (rsiMax !== null) query = query.lte('rsi', rsiMax);

  // Fiyat değişimi filtresi — DB seviyesinde
  if (changeMin !== null) query = query.gte('change_percent', changeMin);
  if (changeMax !== null) query = query.lte('change_percent', changeMax);

  // Hacim filtresi — DB seviyesinde
  if (volumeMin !== null) query = query.gte('last_volume', volumeMin);

  // Sinyal tipi/şiddeti filtresi sonrası sayım için fazla çek (max 300 = limit cap)
  const fetchCap = Math.min(300, Math.max(limit * 3, 200));
  const { data, error } = await query.limit(fetchCap);

  if (error) {
    console.error('[screener] Supabase hatası:', error.message);
    return NextResponse.json({ error: 'Veri alınamadı.' }, { status: 500 });
  }

  type CacheRow = {
    sembol: string;
    signals_json: Array<{
      type: string;
      direction: string;
      severity: string;
      candlesAgo?: number;
      weeklyAligned?: boolean;
    }>;
    change_percent: number | null;
    rsi: number | null;
    last_volume: number | null;
    last_close: number | null;
    confluence_score: number | null;
    pct_from_52w_high: number | null;
    pct_from_52w_low: number | null;
    rel_vol5: number | null;
    sector: string | null;
    scanned_at: string;
  };

  let rows = (data ?? []) as CacheRow[];

  // Sinyal-tabanlı filtreler — JS seviyesinde (JSONB içeriği)
  // Tip + şiddet + yön + MTF aynı sinyalde birlikte uyuşmalı.
  if (signalType || severity || direction || mtfOnly) {
    rows = rows.filter((row) => {
      const sigs = row.signals_json ?? [];
      if (sigs.length === 0) return false;
      return sigs.some((sig) => {
        if (signalType && sig.type !== signalType) return false;
        if (severity && sig.severity !== severity) return false;
        if (direction && sig.direction !== direction) return false;
        if (mtfOnly && sig.weeklyAligned !== true) return false;
        return true;
      });
    });
  }

  const totalMatched = rows.length;
  rows = rows.slice(0, limit);

  // En son scan zamanı — UI'da "veri X dk önce" göstermek için
  const latestScannedAt = rows[0]?.scanned_at ?? data?.[0]?.scanned_at ?? null;

  const result = rows.map((row) => {
    const sigs = row.signals_json ?? [];
    // Hisse-seviyesi yön: AL/SAT/Karışık — UI badge için
    const ups   = sigs.filter((s) => s.direction === 'yukari').length;
    const downs = sigs.filter((s) => s.direction === 'asagi').length;
    const dominantDir =
      ups > 0 && downs === 0 ? 'yukari' :
      downs > 0 && ups === 0 ? 'asagi'  :
      ups > downs            ? 'yukari' :
      downs > ups            ? 'asagi'  :
      ups === 0 && downs === 0 ? null   : 'karisik';
    const anyMtf = sigs.some((s) => s.weeklyAligned === true);

    return {
      sembol:           row.sembol,
      signals:          sigs,
      signalCount:      sigs.length,
      changePercent:    row.change_percent,
      rsi:              row.rsi,
      lastVolume:       row.last_volume,
      lastClose:        row.last_close,
      confluenceScore:  row.confluence_score,
      pctFrom52wHigh:   row.pct_from_52w_high,
      pctFrom52wLow:    row.pct_from_52w_low,
      relVol5:          row.rel_vol5,
      dominantDir,
      anyMtf,
      sector:           row.sector,
      sectorName:       row.sector ? (SECTORS[row.sector as keyof typeof SECTORS]?.shortName ?? row.sector) : null,
      scannedAt:        row.scanned_at,
    };
  });

  return NextResponse.json(
    {
      ok: true,
      count: result.length,
      totalMatched,         // limit'ten önce eşleşen toplam (UI: "200 / 245 gösteriliyor")
      capped: totalMatched > limit,
      latestScannedAt,
      results: result,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  );
}
