/**
 * Temel Analiz API
 *
 * GET /api/fundamentals/[sembol]
 *
 * Yahoo Finance (yahoo-finance2) üzerinden değerleme + bilanço verisi çeker.
 * AlphaVantage BIST'i desteklemediğinden yahoo-finance2 birincil kaynak olarak kullanılır.
 *
 * Auth: gerekmez (public)
 * Cache: 24 saat CDN + in-memory
 */

import { fetchYahooFundamentals } from '@/lib/yahoo-fundamentals';

export async function GET(
  _: Request,
  { params }: { params: { sembol: string } }
) {
  const sembol = params.sembol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!sembol) {
    return Response.json({ error: 'Geçersiz sembol.' }, { status: 400 });
  }

  try {
    const data = await fetchYahooFundamentals(sembol);
    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Veri alınamadı';
    console.error(`[fundamentals] ${sembol}:`, msg);
    return Response.json({ error: msg }, { status: 404 });
  }
}
