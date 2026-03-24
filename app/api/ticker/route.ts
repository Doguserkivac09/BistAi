import { NextResponse } from 'next/server';
import { fetchOHLCV } from '@/lib/yahoo';

export const runtime = 'nodejs';
export const revalidate = 300; // 5 dk cache

const TICKER_SYMBOLS = [
  'THYAO', 'AKBNK', 'SISE', 'EREGL', 'KCHOL',
  'BIMAS', 'ARCLK', 'TUPRS', 'GARAN', 'TOASO',
  'PGSUS', 'VESTL', 'HEKTS', 'EKGYO',
];

export async function GET() {
  try {
    const results = await Promise.allSettled(
      TICKER_SYMBOLS.map(async (sembol) => {
        const { candles, changePercent, currentPrice } = await fetchOHLCV(sembol, 5);
        const lastClose = candles[candles.length - 1]?.close;
        const prevClose = candles[candles.length - 2]?.close;
        const price = currentPrice ?? lastClose ?? null;
        // changePercent önce Yahoo meta'dan, yoksa son iki kapanıştan hesapla
        const change = changePercent != null
          ? changePercent
          : (lastClose && prevClose && prevClose > 0)
            ? Math.round(((lastClose - prevClose) / prevClose) * 10000) / 100
            : null;
        return { sembol, price, change };
      })
    );

    const data = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { sembol: TICKER_SYMBOLS[i]!, price: null, change: null };
    });

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
