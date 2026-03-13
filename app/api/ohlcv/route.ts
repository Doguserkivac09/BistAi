import { NextRequest, NextResponse } from 'next/server';
import { fetchOHLCV, fetchOHLCVByTimeframe, type YahooTimeframe } from '@/lib/yahoo';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import type { OHLCVCandle } from '@/types';

// IP başına dakikada 120 istek (tarama 101 sembol paralel yapıyor)
const RATE_LIMIT = 120;
const WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const { allowed, remaining, resetMs } = checkRateLimit(`ohlcv:${ip}`, RATE_LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(resetMs / 1000)), 'X-RateLimit-Remaining': '0' },
      }
    );
  }
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
    console.error('[ohlcv] Hata:', err instanceof Error ? err.message : err);
    return NextResponse.json({ candles: [] });
  }
}
