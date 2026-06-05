/**
 * Peer/Sektör Görece Değerleme API
 * GET /api/peer-valuation?symbol=GARAN
 *
 * Hissenin çarpanlarını (F/K, F/DD, EV/FAVÖK, ROE) sektör medyanıyla kıyaslar.
 * Medyanlar /api/cron/sector-medians tarafından ai_cache'e yazılır (BIST).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeTicker } from '@/lib/sanitize';
import { getSectorId, getSector } from '@/lib/sectors';
import { isUSSymbol } from '@/lib/us-symbols';
import { fetchYahooFundamentals } from '@/lib/yahoo-fundamentals';
import { getStoredSectorMedians } from '@/lib/sector-medians';
import { computePeerValuation } from '@/lib/peer-valuation';

export const dynamic = 'force-dynamic';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req.headers);
  const rl = checkRateLimit(`${ip}:peer`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });

  const symbol = sanitizeTicker(req.nextUrl.searchParams.get('symbol') ?? '');
  if (!symbol) return NextResponse.json({ error: 'Sembol gerekli.' }, { status: 400 });

  // Peer değerleme BIST sektör medyanlarına dayalı — US hisseleri kapsam dışı.
  if (isUSSymbol(symbol)) {
    return NextResponse.json({ symbol, available: false, message: 'US hisseleri için sektör medyanı yok.' });
  }

  try {
    const sector = getSectorId(symbol);
    const medians = await getStoredSectorMedians(createAdminClient());
    const median = medians?.[sector];

    if (!median) {
      return NextResponse.json({
        symbol, sector, available: false,
        message: 'Sektör medyanı henüz hesaplanmadı (haftalık cron).',
      }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
    }

    const f = await fetchYahooFundamentals(symbol);
    const peer = computePeerValuation(f, sector, median);

    return NextResponse.json({
      symbol,
      sector,
      sectorName: getSector(symbol).name,
      available: true,
      peer,
    }, { headers: { 'Cache-Control': 'public, s-maxage=10800, stale-while-revalidate=3600' } }); // 3 saat
  } catch (e) {
    console.error('[peer-valuation]', e);
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
}
