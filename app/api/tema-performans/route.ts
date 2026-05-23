import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSymbolsByTheme, ThemeId, ALL_THEMES } from '@/lib/us-symbols';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface StockPerformance {
  symbol: string;
  current_price: number;
  change_1d: number;
  change_1h: number;
  change_1m: number;
  pct_1d: number;
  pct_1h: number;
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
    avg_1h: number;
    avg_1m: number;
  };
  stockCount: number;
}

export async function GET(request: NextRequest) {
  try {
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
    const { data: cacheData, error: cacheError } = await supabase
      .from('scan_cache')
      .select('symbol, price, change_1d, change_1h, change_1m, cached_at')
      .eq('market', 'US')
      .in('symbol', symbols)
      .order('cached_at', { ascending: false });

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

    // Get latest entry per symbol (group by symbol)
    const latestBySymbol = new Map();
    for (const entry of cacheData) {
      if (!latestBySymbol.has(entry.symbol)) {
        latestBySymbol.set(entry.symbol, entry);
      }
    }

    // Convert to performance format
    const stocks: StockPerformance[] = Array.from(latestBySymbol.values()).map(
      (entry) => ({
        symbol: entry.symbol,
        current_price: entry.price || 0,
        change_1d: entry.change_1d || 0,
        change_1h: entry.change_1h || 0,
        change_1m: entry.change_1m || 0,
        pct_1d: entry.change_1d && entry.price ? ((entry.change_1d / (entry.price - entry.change_1d)) * 100) : 0,
        pct_1h: entry.change_1h && entry.price ? ((entry.change_1h / (entry.price - entry.change_1h)) * 100) : 0,
        pct_1m: entry.change_1m && entry.price ? ((entry.change_1m / (entry.price - entry.change_1m)) * 100) : 0,
      })
    );

    // Sort by 1d performance
    stocks.sort((a, b) => b.pct_1d - a.pct_1d);

    // Top gainers (top 5)
    const topGainers = stocks.slice(0, 5);

    // Top losers (bottom 5)
    const topLosers = stocks.slice(-5).reverse();

    // Calculate theme average performance
    const validStocks = stocks.filter((s) => s.current_price > 0);
    const themeAverage = {
      avg_1d: validStocks.length > 0 ? validStocks.reduce((sum, s) => sum + s.pct_1d, 0) / validStocks.length : 0,
      avg_1h: validStocks.length > 0 ? validStocks.reduce((sum, s) => sum + s.pct_1h, 0) / validStocks.length : 0,
      avg_1m: validStocks.length > 0 ? validStocks.reduce((sum, s) => sum + s.pct_1m, 0) / validStocks.length : 0,
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
