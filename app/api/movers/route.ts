/**
 * Bugünün Hareket Edenler API
 *
 * GET /api/movers
 *   → scan_cache'ten en çok artan/düşen 5 hisseyi döner.
 *     Sayfa üstündeki "Bugünün Liderleri" banner için.
 *
 * Cache: 5 dk — günlük tarama frekansı yeterli.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SECTORS } from '@/lib/sectors';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface Mover {
  sembol:        string;
  changePercent: number;
  lastClose:     number | null;
  sectorName:    string | null;
}

export async function GET() {
  try {
    const admin = createAdminClient();

    // Tek query — gainers + losers arası ayırma JS tarafında.
    const { data, error } = await admin
      .from('scan_cache')
      .select('sembol, change_percent, last_close, sector')
      .not('change_percent', 'is', null);

    if (error) {
      console.error('[api/movers] Supabase hatası:', error.message);
      return NextResponse.json({ error: 'Veri alınamadı.' }, { status: 500 });
    }

    type Row = {
      sembol: string;
      change_percent: number;
      last_close: number | null;
      sector: string | null;
    };

    const rows = (data ?? []) as Row[];

    const gainers: Mover[] = [...rows]
      .sort((a, b) => b.change_percent - a.change_percent)
      .slice(0, 5)
      .map((r) => ({
        sembol:        r.sembol,
        changePercent: r.change_percent,
        lastClose:     r.last_close,
        sectorName:    r.sector
          ? (SECTORS[r.sector as keyof typeof SECTORS]?.shortName ?? null)
          : null,
      }));

    const losers: Mover[] = [...rows]
      .sort((a, b) => a.change_percent - b.change_percent)
      .slice(0, 5)
      .map((r) => ({
        sembol:        r.sembol,
        changePercent: r.change_percent,
        lastClose:     r.last_close,
        sectorName:    r.sector
          ? (SECTORS[r.sector as keyof typeof SECTORS]?.shortName ?? null)
          : null,
      }));

    return NextResponse.json(
      {
        gainers,
        losers,
        totalSymbols: rows.length,
        calculatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[api/movers] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
