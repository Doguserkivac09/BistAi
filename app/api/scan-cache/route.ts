/**
 * Tarama cache okuma API'si.
 * scan_cache tablosundan sinyal sonuçlarını döner — tarama sayfası anında yükler.
 *
 * GET /api/scan-cache
 * Response: { results, scannedAt, fromCache, count, ageMinutes }
 *
 * Cache: 5 dk CDN + 10 dk stale-while-revalidate
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { OHLCVCandle, StockSignal } from '@/types';

interface ScanCacheRow {
  sembol: string;
  signals_json: StockSignal[];
  candles_json: OHLCVCandle[];
  change_percent: number | null;
  scanned_at: string;
}

function createReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = createReadClient();

    const { data, error } = await supabase
      .from('scan_cache')
      .select('sembol, signals_json, candles_json, change_percent, scanned_at')
      .order('scanned_at', { ascending: false });

    if (error) {
      console.error('[scan-cache] DB okuma hatası:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { results: [], fromCache: false, count: 0, scannedAt: null, ageMinutes: null },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // En son tarama zamanını bul (tüm satırlar aynı scan_cache_at'a sahip olabilir)
    const scannedAt = (data as ScanCacheRow[])[0]?.scanned_at ?? null;
    const ageMinutes = scannedAt
      ? Math.round((Date.now() - new Date(scannedAt).getTime()) / 60000)
      : null;

    // Sadece sinyali olan hisseleri döndür (boş signals_json olanları filtrele)
    const results = (data as ScanCacheRow[])
      .filter((row) => Array.isArray(row.signals_json) && row.signals_json.length > 0)
      .map((row) => ({
        sembol: row.sembol,
        signals: row.signals_json,
        candles: row.candles_json,
        changePercent: row.change_percent,
      }));

    // Tüm taranmış hisseler (sector momentum için — sinyali olmayanlar dahil)
    const allScanned = (data as ScanCacheRow[]).map((row) => ({
      sembol: row.sembol,
      candles: row.candles_json,
    }));

    return NextResponse.json(
      { results, allScanned, fromCache: true, count: results.length, scannedAt, ageMinutes },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (err) {
    console.error('[scan-cache] Hata:', err);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
