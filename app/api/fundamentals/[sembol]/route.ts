/**
 * Temel Analiz API
 *
 * GET /api/fundamentals/[sembol]
 *
 * AlphaVantage'dan değerleme (OVERVIEW) + bilanço (BALANCE_SHEET) verisi çeker.
 * Her ikisi de 24 saat önbelleklenir (free tier: 25 istek/gün koruması).
 *
 * Auth: gerekmez (public)
 * Cache: 24 saat CDN + in-memory
 */

import { fetchFundamentals, fetchBalanceSheet } from '@/lib/alpha-vantage';

export async function GET(
  _: Request,
  { params }: { params: { sembol: string } }
) {
  const sembol = params.sembol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!sembol) {
    return Response.json({ error: 'Geçersiz sembol.' }, { status: 400 });
  }

  const [overviewResult, balanceResult] = await Promise.allSettled([
    fetchFundamentals(sembol),
    fetchBalanceSheet(sembol),
  ]);

  if (overviewResult.status === 'rejected') {
    const msg = overviewResult.reason instanceof Error
      ? overviewResult.reason.message
      : 'Veri alınamadı';
    return Response.json({ error: msg }, { status: 404 });
  }

  return Response.json(
    {
      overview: overviewResult.value,
      balance:  balanceResult.status === 'fulfilled' ? balanceResult.value : null,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
      },
    }
  );
}
