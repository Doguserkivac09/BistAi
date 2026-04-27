/**
 * Sektör Ağırlık API
 *
 * GET /api/sectors/weights
 *   → Her sektör için temsilci hisselerin Yahoo market cap toplamını döner.
 *     Frontend bu değerleri toplam üzerinden yüzdeye çevirip endeks
 *     ağırlığı yaklaşımı olarak gösterir.
 *
 * Cache: 1 saat — fundamentals nadir değişir.
 */

import { NextResponse } from 'next/server';
import { SECTOR_REPRESENTATIVES } from '@/lib/sectors';
import { fetchYahooFundamentals } from '@/lib/yahoo-fundamentals';
import type { SectorId } from '@/lib/sectors';

export async function GET() {
  try {
    const weights: Partial<Record<SectorId, number>> = {};

    const entries = Object.entries(SECTOR_REPRESENTATIVES) as Array<[SectorId, string[] | undefined]>;

    await Promise.all(
      entries.map(async ([sectorId, symbols]) => {
        if (!symbols || symbols.length === 0) {
          weights[sectorId] = 0;
          return;
        }
        const results = await Promise.allSettled(
          symbols.map((s) => fetchYahooFundamentals(s)),
        );
        let total = 0;
        for (const r of results) {
          if (r.status === 'fulfilled' && typeof r.value.marketCap === 'number') {
            total += r.value.marketCap;
          }
        }
        weights[sectorId] = total;
      }),
    );

    return NextResponse.json(
      { weights, calculatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[api/sectors/weights] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
