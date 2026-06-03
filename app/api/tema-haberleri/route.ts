export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSymbolsByTheme, ALL_THEMES, ThemeId } from '@/lib/us-symbols';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface NewsItem {
  title: string;
  description: string;
  link: string;
  source: string;
  pubDate: string;
  symbol?: string;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const tema = request.nextUrl.searchParams.get('tema') as ThemeId | null;

    // Tema validation
    if (!tema || !ALL_THEMES.includes(tema)) {
      return NextResponse.json(
        { error: 'Invalid theme' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = `tema-news-${tema}`;
    const { data: cachedData } = await supabase
      .from('ai_cache')
      .select('response')
      .eq('key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cachedData) {
      return NextResponse.json(JSON.parse(cachedData.response));
    }

    // Get symbols for theme
    const symbols = getSymbolsByTheme(tema);
    if (symbols.length === 0) {
      return NextResponse.json(
        { error: `No symbols for theme: ${tema}` },
        { status: 404 }
      );
    }

    // Fetch news for top 5 symbols only (to avoid rate limits)
    const topSymbols = symbols.slice(0, 5);
    const allNews: NewsItem[] = [];

    for (const symbol of topSymbols) {
      try {
        // Yahoo Finance news endpoint (public)
        const response = await fetch(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=news`,
          {
            signal: AbortSignal.timeout(5000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            },
          }
        );

        const json = await response.json();
        const newsData = json?.quoteSummary?.result?.[0]?.news || [];
        for (const item of newsData) {
          allNews.push({
            title: item.title || '',
            description: item.summary || '',
            link: item.link || '',
            source: item.source || 'Yahoo Finance',
            pubDate: new Date(item.providerPublishTime * 1000).toISOString(),
            symbol,
          });
        }
      } catch (err) {
        console.error(`News fetch error for ${symbol}:`, err);
        // Continue with other symbols
      }
    }

    // Sort by date, take top 10
    const sortedNews = allNews
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 10);

    const responseData = {
      theme: tema,
      timestamp: new Date().toISOString(),
      newsCount: sortedNews.length,
      news: sortedNews,
    };

    // Cache for 1 hour
    await supabase.from('ai_cache').insert({
      key: cacheKey,
      response: JSON.stringify(responseData),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Tema haberleri API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
