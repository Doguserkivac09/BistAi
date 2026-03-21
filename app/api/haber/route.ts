/**
 * Hisse haberleri API
 * GET /api/haber?sembol=THYAO
 *
 * Kaynak önceliği:
 * 1. Bigpara (Hürriyet) RSS — Türkçe, hisse bazlı
 * 2. Mynet Finans RSS — Türkçe, genel finans
 * 3. Yahoo Finance — İngilizce, fallback
 */

import { NextRequest, NextResponse } from 'next/server';

export interface HaberItem {
  baslik: string;
  link: string;
  tarih: string;
  kaynak: string;
}

const SEMBOL_AD_MAP: Record<string, string> = {
  THYAO: 'Türk Hava Yolları', GARAN: 'Garanti Bankası', ASELS: 'Aselsan',
  KCHOL: 'Koç Holding', EREGL: 'Ereğli Demir', BIMAS: 'BİM',
  AKBNK: 'Akbank', SISE: 'Şişe Cam', TUPRS: 'Tüpraş', FROTO: 'Ford Otosan',
  TOASO: 'Tofaş', SAHOL: 'Sabancı Holding', YKBNK: 'Yapı Kredi',
  HALKB: 'Halkbank', VAKBN: 'Vakıfbank', TCELL: 'Turkcell',
  ARCLK: 'Arçelik', EKGYO: 'Emlak Konut', PGSUS: 'Pegasus',
  TTKOM: 'Türk Telekom', PETKM: 'Petkim', DOHOL: 'Doğan Holding',
  KOZAL: 'Koza Altın', MGROS: 'Migros', SASA: 'SASA Polyester',
  ISCTR: 'İş Bankası', ENKAI: 'Enka İnşaat', BRISA: 'Brisa',
  AGHOL: 'AG Anadolu', OYAKC: 'Oyak Çimento',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── RSS parser ────────────────────────────────────────────────────────────────
function parseRSS(xml: string, maxItems = 6): HaberItem[] {
  const items: HaberItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < maxItems) {
    const b = m[1] ?? '';
    const baslik =
      (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
       b.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? '';
    const link =
      (b.match(/<link>([\s\S]*?)<\/link>/) ??
       b.match(/<guid[^>]*>([\s\S]*?)<\/guid>/))?.[1]?.trim() ?? '';
    const tarih = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? '';
    const kaynak =
      (b.match(/<source[^>]*>([\s\S]*?)<\/source>/) ??
       b.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/))?.[1]?.trim() ?? '';
    if (baslik && link) items.push({ baslik, link, tarih, kaynak });
  }
  return items;
}

// ── Kaynak 1: Bigpara RSS (hisse bazlı Türkçe) ────────────────────────────────
async function fetchBigpara(sembol: string): Promise<HaberItem[]> {
  const url = `https://bigpara.hurriyet.com.tr/feeds/rss/hissedetay/${sembol}/`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`Bigpara ${res.status}`);
  const xml = await res.text();
  return parseRSS(xml).map((h) => ({ ...h, kaynak: h.kaynak || 'Bigpara' }));
}

// ── Kaynak 2: Mynet Finans RSS (genel Türkçe) ─────────────────────────────────
async function fetchMynet(sirketAdi: string): Promise<HaberItem[]> {
  const q = encodeURIComponent(sirketAdi);
  const url = `https://finans.mynet.com/rss/?q=${q}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`Mynet ${res.status}`);
  const xml = await res.text();
  return parseRSS(xml).map((h) => ({ ...h, kaynak: h.kaynak || 'Mynet Finans' }));
}

// ── Kaynak 3: Yahoo Finance (İngilizce fallback) ──────────────────────────────
async function fetchYahoo(sembol: string): Promise<HaberItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${sembol}.IS&newsCount=6&enableFuzzyQuery=false`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const json = await res.json();
  return (json?.news ?? [])
    .filter((n: { title?: string; link?: string }) => n.title && n.link)
    .slice(0, 6)
    .map((n: { title: string; link: string; providerPublishTime?: number; publisher?: string }) => ({
      baslik: n.title,
      link: n.link,
      tarih: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : '',
      kaynak: n.publisher ?? 'Yahoo Finance',
    }));
}

// ── Ana handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sembol = req.nextUrl.searchParams.get('sembol')?.toUpperCase() ?? '';
  if (!sembol) return NextResponse.json({ error: 'sembol gerekli' }, { status: 400 });
  const sirketAdi = SEMBOL_AD_MAP[sembol] ?? sembol;

  // Kaynakları sırayla dene, ilk başarılıyı kullan
  const sources = [
    () => fetchBigpara(sembol),
    () => fetchMynet(sirketAdi),
    () => fetchYahoo(sembol),
  ];

  for (const source of sources) {
    try {
      const haberler = await source();
      if (haberler.length > 0) return NextResponse.json({ sembol, haberler });
    } catch {
      // sonraki kaynağa geç
    }
  }

  return NextResponse.json({ sembol, haberler: [] });
}
