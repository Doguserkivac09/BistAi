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
  const specific: HaberItem[] = [];   // şirkete özel haberler
  const general: HaberItem[] = [];    // genel ekonomi haberleri (fallback)

  await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, kaynak }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          next: { revalidate: 1800 },
        });
        if (!res.ok) return;
        const xml = await res.text();
        const items = parseRSS(xml).map((h) => ({ ...h, kaynak: h.kaynak || kaynak }));

        // Şirkete özel haberler
        items.filter((h) => ilgiliMi(h.baslik, anahtarlar)).forEach((h) => specific.push(h));
        // Genel ekonomi haberleri
        items.slice(0, 4).forEach((h) => general.push(h));
      } catch {
        // sessizce geç
      }
    })
  );

  const sort = (arr: HaberItem[]) =>
    arr.sort((a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0));

  // Şirkete özel varsa onu göster, yoksa genel ekonomi haberleri
  if (specific.length >= 2) return sort(specific).slice(0, 6);

  // Şirkete özel + genel karıştır
  const combined = [...specific, ...general.filter((g) => !specific.find((s) => s.link === g.link))];
  return sort(combined).slice(0, 6);
}

// ── Genel ekonomi haberleri (haberler sayfası için) ───────────────────────────
async function fetchGenelHaberler(): Promise<HaberItem[]> {
  const results: HaberItem[] = [];

  await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, kaynak }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          next: { revalidate: 900 }, // 15 dk cache
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
    .filter((h, i, arr) => arr.findIndex((x) => x.baslik === h.baslik) === i) // duplicate önle
    .slice(0, 20);
}

// ── Ana handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sembol = req.nextUrl.searchParams.get('sembol')?.toUpperCase() ?? '';

  // Genel haberler sayfası
  if (!sembol) {
    const haberler = await fetchGenelHaberler();
    return NextResponse.json({ haberler });
  }

  // Hisse bazlı haberler — sadece şirkete özel, fallback YOK
  const anahtarlar = SEMBOL_ANAHTAR[sembol] ?? [sembol];
  const specific: HaberItem[] = [];

  await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, kaynak }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          next: { revalidate: 1800 },
        });
        if (!res.ok) return;
        const xml = await res.text();
        parseRSS(xml)
          .filter((h) => ilgiliMi(h.baslik, anahtarlar))
          .forEach((h) => specific.push({ ...h, kaynak: h.kaynak || kaynak }));
      } catch {}
    })
  );

  const haberler = specific
    .sort((a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0))
    .slice(0, 6);

  return NextResponse.json({ sembol, haberler });
}
