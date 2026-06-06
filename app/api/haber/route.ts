/**
 * Hisse haberleri API
 * GET /api/haber?sembol=THYAO
 *
 * Kaynaklar (öncelik sırasına göre):
 * 1. Türkçe RSS akışları — sembol/şirket adı ile filtreleme
 * 2. Genel Türk ekonomi haberleri — sembol için haber bulunamazsa
 *
 * Neden Yahoo Finance yok: BIST hisseleri için alakasız İngilizce haberler döndürüyor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

export interface HaberItem {
  baslik: string;
  link: string;
  tarih: string;      // ISO string
  kaynak: string;
  ozet?: string;
  thumbnail?: string;
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

const UA = 'Mozilla/5.0 (compatible; BistAI/1.0; +https://bistai.com)';
const FETCH_TIMEOUT_MS = 8000;

const RSS_SOURCES = [
  { url: 'https://www.ntv.com.tr/ekonomi.rss',                kaynak: 'NTV Ekonomi' },
  { url: 'https://www.sabah.com.tr/rss/ekonomi.xml',          kaynak: 'Sabah Ekonomi' },
  { url: 'https://www.hurriyet.com.tr/rss/ekonomi',           kaynak: 'Hürriyet Ekonomi' },
  { url: 'https://www.haberturk.com/rss/ekonomi.xml',         kaynak: 'Habertürk Ekonomi' },
  { url: 'https://ekonomi.haber7.com/rss.xml',                kaynak: 'Haber7 Ekonomi' },
];

// ── ABD borsa haberleri — doğrudan piyasa odaklı RSS kaynakları ──────────────
// Yahoo headline RSS (büyük endeks/mega-cap sepeti) en güvenilir; diğerleri yedek.
const US_RSS_SOURCES = [
  {
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,DIA,AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA&region=US&lang=en-US',
    kaynak: 'Yahoo Finance',
  },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', kaynak: 'MarketWatch' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',      kaynak: 'CNBC Markets' },
  { url: 'https://www.investing.com/rss/news_25.rss',                  kaynak: 'Investing.com' },
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

async function fetchUSHaberler(): Promise<HaberItem[]> {
  const results: HaberItem[] = [];

  await Promise.allSettled(
    US_RSS_SOURCES.map(async ({ url, kaynak }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          next: { revalidate: 900 },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const items = parseRSS(xml).slice(0, 12).map((h) => ({ ...h, kaynak: h.kaynak || kaynak }));
        results.push(...items);
      } catch {}
    })
  );

  return results
    .sort((a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0))
    .filter((h, i, arr) => arr.findIndex((x) => x.baslik === h.baslik) === i)
    .slice(0, 24);
}

// ── Google News (sembol-bazlı — HER hisse için kapsamlı, küçükler dahil) ─────────
// Google News, Türk finans sitelerini (Mynet, Investing.com TR, Paratic, BloombergHT)
// indeksler; "{SEMBOL} hisse" sorgusu her BIST hissesine özgü Türkçe haber döndürür.
async function fetchGoogleNews(sembol: string): Promise<HaberItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(sembol + ' hisse')}&hl=tr&gl=TR&ceid=TR:tr`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml)
      // Feed başlık sarmalayıcısını ("..." - Google Haberler) ele
      .filter((h) => h.baslik && !/google haberler/i.test(h.baslik) && !/^".*"$/.test(h.baslik.trim()))
      .map((h) => {
        // Google başlık formatı: "Başlık - Kaynak" → kaynağı ayıkla
        const src = h.kaynak || '';
        let baslik = h.baslik;
        if (src && baslik.endsWith(` - ${src}`)) baslik = baslik.slice(0, -(src.length + 3)).trim();
        else {
          const m = baslik.match(/^(.+?)\s+-\s+([^-]{2,40})$/);
          if (m) return { ...h, baslik: m[1].trim(), kaynak: src || m[2].trim() };
        }
        return { ...h, baslik, kaynak: src || 'Google News' };
      });
  } catch {
    return [];
  }
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
  // Rate limit: 20 istek/dakika per IP (Yahoo scraping, harici istek)
  const ip = getClientIP(req.headers);
  const rl = checkRateLimit(`${ip}:haber`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek.', haberler: [], bugunSayi: 0 },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  const sembol = req.nextUrl.searchParams.get('sembol')?.toUpperCase() ?? '';
  const market = req.nextUrl.searchParams.get('market')?.toUpperCase() ?? 'BIST';

  // ABD borsa haberleri (sembolsüz)
  if (!sembol && market === 'US') {
    const haberler = await fetchUSHaberler();
    return NextResponse.json(
      { haberler },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300' } }
    );
  }

  if (!sembol) {
    const haberler = await fetchGenelHaberler();
    return NextResponse.json(
      { haberler },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300' } }
    );
  }

  // Google News (sembol-bazlı, her hisse için kapsamlı) + Türkçe RSS (mainstream isim eşleşmesi)
  const [googleNews, rssNews] = await Promise.all([
    fetchGoogleNews(sembol),
    fetchRSSNews(sembol),
  ]);
  // Google önce (sembole özgü ve güncel); RSS mainstream büyük-cap haberini ekler
  const symbolNews = dedupe([...googleNews, ...rssNews]);

  // Hiç sembol haberi yoksa (çok nadir) genel ekonomi haberine düş
  const haberler = symbolNews.length > 0 ? symbolNews : await fetchGenelHaberler();
  const combined = dedupe(haberler)
    .sort((a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0))
    .slice(0, 12);

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
