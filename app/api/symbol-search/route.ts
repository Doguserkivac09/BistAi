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
  // ⚠️ ÖNEK DEĞİL İÇEREN EŞLEŞME (design_handoff_bugun_v3 "bilinen açık iş"):
  // önek eşleşmesinde "SEL" yazan kullanıcı ASELS'i bulamıyordu. Artık sembolün
  // herhangi bir yerinde geçen eşleşir; sıralamada ÖNEK eşleşmeleri öne alınır ki
  // "TH" yazınca THYAO, "ATHEN" gibi içinde geçenlerin önünde kalsın.
  const { data, error } = await admin
    .from('scan_cache')
    .select('sembol, last_close, change_percent, sector')
    .or('market.eq.BIST,market.is.null')
    .like('sembol', `%${q}%`)
    .order('sembol', { ascending: true })
    .limit(40);

  if (error) {
    return NextResponse.json({ results: [], error: 'Arama başarısız.' }, { status: 500 });
  }

  const sirali = [...(data ?? [])]
    .sort((a, b) => {
      const ao = String(a.sembol).startsWith(q) ? 0 : 1;
      const bo = String(b.sembol).startsWith(q) ? 0 : 1;
      return ao - bo || String(a.sembol).localeCompare(String(b.sembol));
    })
    .slice(0, 8);

  const results = sirali.map((row) => ({
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
