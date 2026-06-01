export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSymbolsByTheme, ThemeId, ALL_THEMES } from '@/lib/us-symbols';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface StockPerformance {
  symbol: string;
  current_price: number;
  pct_1d: number;
  pct_1w: number;
  pct_1m: number;
}

interface ThemePerformanceResponse {
  theme: string;
  timestamp: string;
  stocks: StockPerformance[];
  topGainers: StockPerformance[];
  topLosers: StockPerformance[];
  themeAverage: {
    avg_1d: number;
    avg_1w: number;
    avg_1m: number;
  };
  stockCount: number;
}

type Candle = { close: number };

/** candles_json içinden N işlem günü öncesine göre yüzde değişim hesapla */
function pctChangeNDaysAgo(candles: Candle[] | null, n: number): number {
  if (!candles || candles.length < n + 1) return 0;
  const last = candles[candles.length - 1]?.close;
  const past = candles[candles.length - 1 - n]?.close;
  if (!last || !past || past === 0) return 0;
  return parseFloat((((last - past) / past) * 100).toFixed(2));
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const tema = request.nextUrl.searchParams.get('tema') as ThemeId | null;

    // Tema validation
    if (!tema || !ALL_THEMES.includes(tema)) {
      return NextResponse.json(
        {
          error: 'Invalid theme. Valid themes: ' + ALL_THEMES.join(', '),
        },
        { status: 400 }
      );
    }

    // Get symbols for theme
    const symbols = getSymbolsByTheme(tema);
    if (symbols.length === 0) {
      return NextResponse.json(
        {
          error: `No symbols found for theme: ${tema}`,
        },
        { status: 404 }
      );
    }

    // Fetch latest scan_cache entries for US market and theme symbols
    // NOT: scan_cache kolon isimleri: sembol, last_close, change_percent,
    //      candles_json (son 60 günlük mum), scanned_at
    const { data: cacheData, error: cacheError } = await supabase
      .from('scan_cache')
      .select('sembol, last_close, change_percent, candles_json, scanned_at')
      .eq('market', 'US')
      .in('sembol', symbols)
      .order('scanned_at', { ascending: false });

    if (cacheError) {
      console.error('Cache query error:', cacheError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!cacheData || cacheData.length === 0) {
      return NextResponse.json(
        {
          error: `No cache data found for theme ${tema} symbols`,
        },
        { status: 404 }
      );
    }

    // Get latest entry per symbol (group by sembol)
    const latestBySymbol = new Map<string, (typeof cacheData)[number]>();
    for (const entry of cacheData) {
      if (!latestBySymbol.has(entry.sembol)) {
        latestBySymbol.set(entry.sembol, entry);
      }
    }

    // Convert to performance format
    // pct_1d → change_percent (zaten yüzde), pct_1w/pct_1m → candles_json'dan
    const stocks: StockPerformance[] = Array.from(latestBySymbol.values()).map(
      (entry) => {
        const candles = (entry.candles_json as Candle[] | null) ?? null;
        return {
          symbol: entry.sembol,
          current_price: entry.last_close ?? 0,
          pct_1d: typeof entry.change_percent === 'number'
            ? parseFloat(entry.change_percent.toFixed(2))
            : 0,
          pct_1w: pctChangeNDaysAgo(candles, 5),   // ~5 işlem günü = 1 hafta
          pct_1m: pctChangeNDaysAgo(candles, 21),  // ~21 işlem günü = 1 ay
        };
      }
    );

    // Sort by 1d performance
    stocks.sort((a, b) => b.pct_1d - a.pct_1d);

    // Top gainers (top 5)
    const topGainers = stocks.slice(0, 5);

    // Top losers (bottom 5)
    const topLosers = stocks.slice(-5).reverse();

    // Calculate theme average performance
    const validStocks = stocks.filter((s) => s.current_price > 0);
    const avg = (sel: (s: StockPerformance) => number) =>
      validStocks.length > 0
        ? parseFloat(
            (validStocks.reduce((sum, s) => sum + sel(s), 0) / validStocks.length).toFixed(2)
          )
        : 0;
    const themeAverage = {
      avg_1d: avg((s) => s.pct_1d),
      avg_1w: avg((s) => s.pct_1w),
      avg_1m: avg((s) => s.pct_1m),
    };

    const response: ThemePerformanceResponse = {
      theme: tema,
      timestamp: new Date().toISOString(),
      stocks,
      topGainers,
      topLosers,
      themeAverage,
      stockCount: stocks.length,
    };

    // Cache for 1 hour
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Tema performans API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
