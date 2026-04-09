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

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const sector     = searchParams.get('sector')?.trim()     || null;
  const signalType = searchParams.get('signalType')?.trim() || null;
  const severity   = searchParams.get('severity')?.trim()   || null;
  const rsiMin     = parseFloat(searchParams.get('rsiMin') ?? '') || null;
  const rsiMax     = parseFloat(searchParams.get('rsiMax') ?? '') || null;
  const changeMin  = parseFloat(searchParams.get('changeMin') ?? '') || null;
  const changeMax  = parseFloat(searchParams.get('changeMax') ?? '') || null;
  const volumeMin  = parseFloat(searchParams.get('volumeMin') ?? '') || null;
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '200'), 300);

  const admin = createAdminClient();

  // scan_cache'den tüm alanları çek (signals_json filtreleme için gerekli)
  let query = admin
    .from('scan_cache')
    .select('sembol, signals_json, change_percent, rsi, last_volume, sector, scanned_at')
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

  const { data, error } = await query.limit(limit * 3); // sinyal filtresi için fazla çek

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
    sector: string | null;
    scanned_at: string;
  };

  let rows = (data ?? []) as CacheRow[];

  // Sinyal tipi / şiddeti filtresi — JS seviyesinde (JSONB içeriği)
  if (signalType || severity) {
    rows = rows.filter((row) => {
      const sigs = row.signals_json ?? [];
      if (sigs.length === 0) return false;
      return sigs.some((sig) => {
        const typeMatch  = !signalType || sig.type === signalType;
        const sevMatch   = !severity   || sig.severity === severity;
        return typeMatch && sevMatch;
      });
    });
  }

  // Limit uygula
  rows = rows.slice(0, limit);

  // Sektör display adını ekle
  const result = rows.map((row) => ({
    sembol:        row.sembol,
    signals:       row.signals_json ?? [],
    signalCount:   (row.signals_json ?? []).length,
    changePercent: row.change_percent,
    rsi:           row.rsi,
    lastVolume:    row.last_volume,
    sector:        row.sector,
    sectorName:    row.sector ? (SECTORS[row.sector as keyof typeof SECTORS]?.shortName ?? row.sector) : null,
    scannedAt:     row.scanned_at,
  }));

  return NextResponse.json(
    { ok: true, count: result.length, results: result },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  );
}
