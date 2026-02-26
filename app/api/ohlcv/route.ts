import { NextRequest, NextResponse } from 'next/server';
import { fetchOHLCV, fetchOHLCVByTimeframe, type YahooTimeframe } from '@/lib/yahoo';
import type { OHLCVCandle } from '@/types';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  const tfParam = request.nextUrl.searchParams.get('tf');
  const daysParam = request.nextUrl.searchParams.get('days');
  const days = daysParam ? Math.min(365, Math.max(1, parseInt(daysParam, 10))) : 90;

  if (!symbol || !symbol.trim()) {
    return NextResponse.json(
      { error: 'Sembol gerekli (örn: symbol=THYAO).' },
      { status: 400 }
    );
  }

  try {
    const trimmed = symbol.trim();

    if (tfParam) {
      const tf = tfParam.toUpperCase() as YahooTimeframe;
      const allowed: YahooTimeframe[] = ['1H', '1G', '1W', '1A', '3A', '1Y'];
      if (!allowed.includes(tf)) {
        return NextResponse.json(
          { error: 'Geçersiz timeframe parametresi.' },
          { status: 400 }
        );
      }
      const candles = await fetchOHLCVByTimeframe(trimmed, tf);
      return NextResponse.json({ candles } as { candles: OHLCVCandle[] });
    }

    const candles = await fetchOHLCV(trimmed, days);
    return NextResponse.json({ candles } as { candles: OHLCVCandle[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
