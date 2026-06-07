/**
 * Haber Etki / "Fiyatlandı mı?" API
 * GET /api/news-impact?symbol=ASELS
 *
 * Sembolün haberlerini materyaliteye göre süzer ve her önemli haber için
 * yayın zamanından bu yana anormal getiri (hisse − BIST100) + hacim z-skoru
 * tepkisini ölçerek "fiyatlandı / fiyatlanıyor / henüz fiyatlanmadı / tepkisiz" der.
 *
 * Veri: GÜNLÜK mum (90 gün) — 20-mum hacim taban penceresi + canlı son mum.
 *  (Intraday yerine günlük tercih nedeni: RSS pubDate gerçek bildirim saati değil
 *   → intraday hizalama sahte hassasiyet üretir; bkz. lib/news-impact.ts.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { sanitizeTicker } from '@/lib/sanitize';
import { isUSSymbol } from '@/lib/us-symbols';
import { fetchSymbolNews } from '@/lib/symbol-news';
import { fetchOHLCV } from '@/lib/yahoo';
import { rankNewsImpact } from '@/lib/news-impact';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ip = getClientIP(req.headers);
  const rl = checkRateLimit(`${ip}:news-impact`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });

  const symbol = sanitizeTicker(req.nextUrl.searchParams.get('symbol') ?? '');
  if (!symbol) return NextResponse.json({ error: 'Sembol gerekli.' }, { status: 400 });

  const isUS = isUSSymbol(symbol);
  const indexSymbol = isUS ? '^GSPC' : 'XU100.IS';

  try {
    const [news, stock, index] = await Promise.all([
      fetchSymbolNews(symbol),
      fetchOHLCV(symbol, 90),          // ~90 günlük günlük mum (20-mum hacim tabanı için yeterli)
      fetchOHLCV(indexSymbol, 90),
    ]);

    if (!stock.candles || stock.candles.length < 6) {
      return NextResponse.json({
        symbol,
        available: false,
        message: 'Yeterli fiyat verisi yok (etki hesaplanamıyor).',
      });
    }

    if (!news.length) {
      return NextResponse.json({
        symbol,
        available: true,
        index: isUS ? 'S&P 500' : 'BIST 100',
        important: [], noise: [], noiseCount: 0,
        importantCount: 0, unpricedCount: 0, last7dCount: 0,
      }, { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=900' } });
    }

    const result = rankNewsImpact(news, stock.candles, index.candles ?? []);

    return NextResponse.json({
      symbol,
      available: true,
      index: isUS ? 'S&P 500' : 'BIST 100',
      ...result,
    }, { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=900' } });
  } catch (e) {
    console.error('[news-impact]', e);
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
}
