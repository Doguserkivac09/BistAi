/**
 * Hisse haberleri API
 * GET /api/haber?sembol=THYAO
 *
 * Kaynak: KAP (Kamuyu Aydınlatma Platformu) — resmi şirket bildirimleri
 * Resmi devlet platformu, Vercel'den engellenmez, Türkçe, güvenilir.
 */

import { NextRequest, NextResponse } from 'next/server';

export interface HaberItem {
  baslik: string;
  link: string;
  tarih: string;
  kaynak: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

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

// ── RSS parser ────────────────────────────────────────────────────────────────
function parseRSS(xml: string): HaberItem[] {
  const items: HaberItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1] ?? '';
    const baslik =
      (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
       b.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim().replace(/&amp;/g, '&').replace(/&quot;/g, '"') ?? '';
    const link =
      (b.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ??
      (b.match(/<guid[^>]*>(https?[^<]+)<\/guid>/))?.[1]?.trim() ?? '';
    const tarih = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? '';
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

// ── Türkçe haber RSS kaynakları ───────────────────────────────────────────────
const RSS_SOURCES = [
  { url: 'https://www.ntv.com.tr/ekonomi.rss',                kaynak: 'NTV Ekonomi' },
  { url: 'https://www.sabah.com.tr/rss/ekonomi.xml',          kaynak: 'Sabah Ekonomi' },
  { url: 'https://www.hurriyet.com.tr/rss/ekonomi',           kaynak: 'Hürriyet Ekonomi' },
  { url: 'https://www.haberturk.com/rss/ekonomi.xml',         kaynak: 'Habertürk Ekonomi' },
  { url: 'https://ekonomi.haber7.com/rss.xml',                kaynak: 'Haber7 Ekonomi' },
];

async function fetchTurkishNews(sembol: string): Promise<HaberItem[]> {
  const anahtarlar = SEMBOL_ANAHTAR[sembol] ?? [sembol];
  const results: HaberItem[] = [];

  await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, kaynak }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          next: { revalidate: 1800 },
        });
        if (!res.ok) return;
        const xml = await res.text();
        const items = parseRSS(xml)
          .filter((h) => ilgiliMi(h.baslik, anahtarlar))
          .map((h) => ({ ...h, kaynak: h.kaynak || kaynak }));
        results.push(...items);
      } catch {
        // sessizce geç
      }
    })
  );

  // Tarihe göre sırala, en fazla 6 haber
  return results
    .sort((a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0))
    .slice(0, 6);
}

// ── Ana handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sembol = req.nextUrl.searchParams.get('sembol')?.toUpperCase() ?? '';
  if (!sembol) return NextResponse.json({ error: 'sembol gerekli' }, { status: 400 });

  const haberler = await fetchTurkishNews(sembol);
  return NextResponse.json({ sembol, haberler });
}
