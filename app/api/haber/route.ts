/**
 * Hisse haberleri API
 * GET /api/haber?sembol=THYAO
 *
 * Kaynaklar (öncelik sırasına göre):
 * 1. Yahoo Finance (yahoo-finance2 search) — hisse bazlı, doğru eşleşme
 * 2. Türkçe RSS akışları — genel ekonomi + keyword filtreleme
 *
 * Resmi devlet platformu, Vercel'den engellenmez, Türkçe, güvenilir.
 */

import { NextRequest, NextResponse } from 'next/server';

export interface HaberItem {
  baslik: string;
  link: string;
  tarih: string;      // ISO string
  kaynak: string;
  ozet?: string;      // haber özeti (Yahoo'dan gelirse)
  thumbnail?: string; // haber görseli URL
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FETCH_TIMEOUT_MS = 5_000;

// ── Yahoo Finance news ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require('yahoo-finance2').default;

interface YahooNewsItem {
  title?: string;
  link?: string;
  providerPublishTime?: number;
  publisher?: string;
  summary?: string;
  thumbnail?: { resolutions?: Array<{ url?: string }> };
}
interface YahooFinanceInstance {
  search(ticker: string, options: { newsCount: number; quotesCount: number }): Promise<{ news?: YahooNewsItem[] }>;
}
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] }) as YahooFinanceInstance;

async function fetchYahooNews(sembol: string): Promise<HaberItem[]> {
  try {
    const ticker = `${sembol.replace(/\.IS$/i, '').toUpperCase()}.IS`;
    const result = await yahooFinance.search(ticker, {
      newsCount: 8,
      quotesCount: 0,
    });

    const news: YahooNewsItem[] = result?.news ?? [];

    return news
      .filter((n) => n?.title && n?.link)
      .map((n) => ({
        baslik:    String(n.title ?? '').trim(),
        link:      String(n.link ?? '').trim(),
        tarih:     n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000).toISOString()
          : '',
        kaynak:    String(n.publisher ?? 'Yahoo Finance').trim(),
        ozet:      n.summary ? String(n.summary).trim() : undefined,
        thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? undefined,
      }));
  } catch {
    return [];
  }
}

// ── XML entity decode + HTML tag temizleme ──────────────────────────────────────
function decodeXMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<[^>]*>/g, '')
    .trim();
}

const SEMBOL_ANAHTAR: Record<string, string[]> = {
  THYAO: ['Türk Hava Yolları', 'THY', 'THYAO'],
  GARAN: ['Garanti', 'Garanti Bankası', 'GARAN'],
  ASELS: ['Aselsan', 'ASELS'],
  KCHOL: ['Koç Holding', 'KCHOL'],
  EREGL: ['Ereğli', 'Erdemir', 'EREGL'],
  BIMAS: ['BİM', 'BIMAS'],
  AKBNK: ['Akbank', 'AKBNK'],
  SISE:  ['Şişe Cam', 'Şişecam', 'SISE'],
  TUPRS: ['Tüpraş', 'TUPRS'],
  FROTO: ['Ford Otosan', 'FROTO'],
  TOASO: ['Tofaş', 'TOASO'],
  SAHOL: ['Sabancı', 'SAHOL'],
  YKBNK: ['Yapı Kredi', 'YKBNK'],
  HALKB: ['Halkbank', 'Halk Bankası', 'HALKB'],
  VAKBN: ['Vakıfbank', 'Vakıf Bankası', 'VAKBN'],
  TCELL: ['Turkcell', 'TCELL'],
  ARCLK: ['Arçelik', 'ARCLK'],
  EKGYO: ['Emlak Konut', 'EKGYO'],
  PGSUS: ['Pegasus', 'PGSUS'],
  TTKOM: ['Türk Telekom', 'TTKOM'],
  PETKM: ['Petkim', 'PETKM'],
  KOZAL: ['Koza Altın', 'KOZAL'],
  MGROS: ['Migros', 'MGROS'],
  ISCTR: ['İş Bankası', 'İşbank', 'ISCTR'],
  ENKAI: ['Enka', 'ENKAI'],
};

function parseRSS(xml: string): HaberItem[] {
  const items: HaberItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1] ?? '';
    const baslik = decodeXMLEntities(
      (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
       b.match(/<title>([\s\S]*?)<\/title>/))?.[1] ?? ''
    );
    const link =
      (b.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ??
      (b.match(/<guid[^>]*>(https?[^<]+)<\/guid>/))?.[1]?.trim() ?? '';
    const tarih = (() => {
      const raw = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? '';
      if (!raw) return '';
      try { return new Date(raw).toISOString(); } catch { return ''; }
    })();
    const kaynak =
      (b.match(/<source[^>]*>([\s\S]*?)<\/source>/) ??
       b.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/))?.[1]?.trim() ?? '';
    if (baslik && link) items.push({ baslik, link, tarih, kaynak });
  }
  return items;
}

function ilgiliMi(baslik: string, anahtarlar: string[]): boolean {
  const lower = baslik.toLowerCase();
  return anahtarlar.some((k) => lower.includes(k.toLowerCase()));
}

const RSS_SOURCES = [
  { url: 'https://www.ntv.com.tr/ekonomi.rss',                kaynak: 'NTV Ekonomi' },
  { url: 'https://www.sabah.com.tr/rss/ekonomi.xml',          kaynak: 'Sabah Ekonomi' },
  { url: 'https://www.hurriyet.com.tr/rss/ekonomi',           kaynak: 'Hürriyet Ekonomi' },
  { url: 'https://www.haberturk.com/rss/ekonomi.xml',         kaynak: 'Habertürk Ekonomi' },
  { url: 'https://ekonomi.haber7.com/rss.xml',                kaynak: 'Haber7 Ekonomi' },
];

async function fetchRSSNews(sembol: string): Promise<HaberItem[]> {
  const anahtarlar = SEMBOL_ANAHTAR[sembol] ?? [sembol];
  const specific: HaberItem[] = [];

  await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, kaynak }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          next: { revalidate: 1800 },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return;
        const xml = await res.text();
        parseRSS(xml)
          .filter((h) => ilgiliMi(h.baslik, anahtarlar))
          .forEach((h) => specific.push({ ...h, kaynak: h.kaynak || kaynak }));
      } catch {}
    })
  );

  return specific.sort(
    (a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0)
  );
}

async function fetchGenelHaberler(): Promise<HaberItem[]> {
  const results: HaberItem[] = [];

  await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, kaynak }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          next: { revalidate: 900 },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const items = parseRSS(xml).slice(0, 5).map((h) => ({ ...h, kaynak: h.kaynak || kaynak }));
        results.push(...items);
      } catch {}
    })
  );

  return results
    .sort((a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0))
    .filter((h, i, arr) => arr.findIndex((x) => x.baslik === h.baslik) === i)
    .slice(0, 20);
}

// ── Duplicate temizleme ────────────────────────────────────────────────────────
function dedupe(items: HaberItem[]): HaberItem[] {
  const seen = new Set<string>();
  return items.filter((h) => {
    const key = h.link || h.baslik;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Ana handler ────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sembol = req.nextUrl.searchParams.get('sembol')?.toUpperCase() ?? '';

  if (!sembol) {
    const haberler = await fetchGenelHaberler();
    return NextResponse.json({ haberler });
  }

  // Yahoo Finance + RSS paralel çek
  const [yahooNews, rssNews] = await Promise.all([
    fetchYahooNews(sembol),
    fetchRSSNews(sembol),
  ]);

  // Yahoo önce, RSS desteği
  const combined = dedupe([...yahooNews, ...rssNews])
    .sort((a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0))
    .slice(0, 8);

  // "Bugün" haber sayısı (son 24 saat)
  const bugun = combined.filter((h) => {
    if (!h.tarih) return false;
    return Date.now() - new Date(h.tarih).getTime() < 24 * 60 * 60 * 1000;
  }).length;

  return NextResponse.json(
    { sembol, haberler: combined, bugunSayi: bugun },
    { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300' } }
  );
}
