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

  const sector     = searchParams.get('sector')?.trim()     || null;
  const signalType = searchParams.get('signalType')?.trim() || null;
  const severity   = searchParams.get('severity')?.trim()   || null;
  const rsiMin     = parseNum(searchParams.get('rsiMin'));
  const rsiMax     = parseNum(searchParams.get('rsiMax'));
  const changeMin  = parseNum(searchParams.get('changeMin'));
  const changeMax  = parseNum(searchParams.get('changeMax'));
  const volumeMin  = parseNum(searchParams.get('volumeMin'));
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '200'), 300);

  const admin = createAdminClient();

  let query = admin
    .from('scan_cache')
    .select('sembol, signals_json, change_percent, rsi, last_volume, last_close, sector, scanned_at')
    .order('scanned_at', { ascending: false });

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
    signals_json: Array<{ type: string; direction: string; severity: string; candlesAgo?: number }>;
    change_percent: number | null;
    rsi: number | null;
    last_volume: number | null;
    last_close: number | null;
    sector: string | null;
    scanned_at: string;
  };

  let rows = (data ?? []) as CacheRow[];

  // Sinyal tipi / şiddeti filtresi — JS seviyesinde (JSONB içeriği)
  // Aynı sinyalde tipi VE şiddeti birlikte uyuşmalı.
  if (signalType || severity) {
    rows = rows.filter((row) => {
      const sigs = row.signals_json ?? [];
      if (sigs.length === 0) return false;
      return sigs.some((sig) => {
        const typeMatch = !signalType || sig.type === signalType;
        const sevMatch  = !severity   || sig.severity === severity;
        return typeMatch && sevMatch;
      });
    });
  }

  const totalMatched = rows.length;
  rows = rows.slice(0, limit);

  // En son scan zamanı — UI'da "veri X dk önce" göstermek için
  const latestScannedAt = rows[0]?.scanned_at ?? data?.[0]?.scanned_at ?? null;

  const result = rows.map((row) => ({
    sembol:        row.sembol,
    signals:       row.signals_json ?? [],
    signalCount:   (row.signals_json ?? []).length,
    changePercent: row.change_percent,
    rsi:           row.rsi,
    lastVolume:    row.last_volume,
    lastClose:     row.last_close,
    sector:        row.sector,
    sectorName:    row.sector ? (SECTORS[row.sector as keyof typeof SECTORS]?.shortName ?? row.sector) : null,
    scannedAt:     row.scanned_at,
  }));

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
