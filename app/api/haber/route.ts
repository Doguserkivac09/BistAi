/**
 * Hisse haberleri API
 * GET /api/haber?sembol=THYAO
 * Yahoo Finance search API — zaten OHLCV için kullanılıyor, engel yok.
 */

import { NextRequest, NextResponse } from 'next/server';

export interface HaberItem {
  baslik: string;
  link: string;
  tarih: string;
  kaynak: string;
}

interface YahooNewsItem {
  title?: string;
  link?: string;
  providerPublishTime?: number;
  publisher?: string;
  uuid?: string;
}

export async function GET(req: NextRequest) {
  const sembol = req.nextUrl.searchParams.get('sembol')?.toUpperCase() ?? '';
  if (!sembol) return NextResponse.json({ error: 'sembol gerekli' }, { status: 400 });

  const yahooSembol = `${sembol}.IS`;
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${yahooSembol}&newsCount=6&enableFuzzyQuery=false&enableNavLinks=false`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 1800 }, // 30 dk cache
    });

    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json = await res.json();

    const newsItems: YahooNewsItem[] = json?.news ?? [];
    const haberler: HaberItem[] = newsItems
      .filter((n) => n.title && n.link)
      .map((n) => ({
        baslik: n.title!,
        link:   n.link!,
        tarih:  n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000).toISOString()
          : '',
        kaynak: n.publisher ?? 'Yahoo Finance',
      }));

    return NextResponse.json({ sembol, haberler });
  } catch (err) {
    console.error('[haber] Yahoo haber hatası:', err);
    return NextResponse.json({ sembol, haberler: [] });
  }
}
