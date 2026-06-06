/**
 * İleriye Dönük Görünüm API
 * GET /api/forward-outlook?symbol=ASELS
 *
 * Büyüme-düzeltilmiş ("GARP") değerleme verdict'i: sektöre göre değerlemeyi
 * (Faz 2B) büyüme + kalite + analist + sözleşme haberiyle birleştirir.
 * "Pahalı ama haklı" ile "gerçekten pahalı"yı ayırır. BIST.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeTicker } from '@/lib/sanitize';
import { getSectorId } from '@/lib/sectors';
import { isUSSymbol } from '@/lib/us-symbols';
import { fetchYahooFundamentals } from '@/lib/yahoo-fundamentals';
import { getStoredSectorMedians } from '@/lib/sector-medians';
import { computePeerValuation } from '@/lib/peer-valuation';
import { fetchTurkeyInflation } from '@/lib/turkey-macro';
import { fetchContractCatalysts } from '@/lib/news-catalyst';
import { computeAnalystMomentum, computeGrowthQuality, computeVerdict } from '@/lib/forward-outlook';

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
  const rl = checkRateLimit(`${ip}:forward`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });

  const symbol = sanitizeTicker(req.nextUrl.searchParams.get('symbol') ?? '');
  if (!symbol) return NextResponse.json({ error: 'Sembol gerekli.' }, { status: 400 });
  if (isUSSymbol(symbol)) {
    return NextResponse.json({ symbol, available: false, message: 'US hisseleri kapsam dışı.' });
  }

  try {
    const [f, medians, tufe] = await Promise.all([
      fetchYahooFundamentals(symbol),
      getStoredSectorMedians(createAdminClient()),
      fetchTurkeyInflation(),
    ]);

    const catalysts = await fetchContractCatalysts(symbol, f.shortName).catch(() => []);

    const sector = getSectorId(symbol);
    const median = medians?.[sector];
    const peer = median ? computePeerValuation(f, sector, median) : null;

    const analyst = computeAnalystMomentum(f);
    const growthQuality = computeGrowthQuality(f, {
      inflationYoy: tufe?.value ?? null,
      roeVsSectorPct: peer?.roe.pctVsMedian ?? null,
    });
    const verdict = peer && peer.reliable
      ? computeVerdict(peer.relativeScore, growthQuality.score)
      : null;

    return NextResponse.json({
      symbol,
      available: true,
      relativeScore: peer?.relativeScore ?? null,
      peerReliable: peer?.reliable ?? false,
      analyst,
      growthQuality,
      verdict,
      catalysts,
    }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800' } });
  } catch (e) {
    console.error('[forward-outlook]', e);
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
}
