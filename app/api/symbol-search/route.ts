/**
 * Hızlı Sembol Arama API — Bugün sayfası hızlı arama kutusu için.
 *
 * GET /api/symbol-search?q=TH
 * scan_cache'te sembol PREFIX eşleşmesi (TR locale büyük harf), en fazla 8 sonuç.
 * Dönen: sembol + son fiyat + günlük değişim% + sektör adı.
 * Auth: gerekmez (public — fiyat verisi zaten public sayfalarda görünüyor).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SECTORS } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';

export const dynamic = 'force-dynamic';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q') ?? '';
  // TR locale büyük harf: "thy" → "THY", "ıs/is" → "IS" (BIST sembolleri ASCII)
  const q = raw.trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/[^A-Z0-9]/g, '');
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('scan_cache')
    .select('sembol, last_close, change_percent, sector')
    .or('market.eq.BIST,market.is.null')
    .like('sembol', `${q}%`)
    .order('sembol', { ascending: true })
    .limit(8);

  if (error) {
    return NextResponse.json({ results: [], error: 'Arama başarısız.' }, { status: 500 });
  }

  const results = (data ?? []).map((row) => ({
    sym: row.sembol as string,
    price: row.last_close as number | null,
    changePercent: row.change_percent as number | null,
    sectorName: row.sector ? (SECTORS[row.sector as SectorId]?.name ?? null) : null,
  }));

  return NextResponse.json(
    { results },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  );
}
