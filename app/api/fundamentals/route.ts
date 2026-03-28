/**
 * Temel Analiz API
 * GET /api/fundamentals?symbol=THYAO
 * AlphaVantage'dan P/E, EPS, Market Cap, Kar Marjı vb. çeker.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchFundamentals } from '@/lib/alpha-vantage';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol zorunlu.' }, { status: 400 });
  }

  try {
    const data = await fetchFundamentals(symbol.toUpperCase());
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (err) {
    // AlphaVantage API key yoksa veya sembol bulunamazsa boş dön
    const message = err instanceof Error ? err.message : 'Veri alınamadı.';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
