/**
 * Hisse haberleri API
 * GET /api/haber?sembol=THYAO
 * Google News RSS üzerinden ücretsiz, API key gerekmez.
 */

import { NextRequest, NextResponse } from 'next/server';

export interface HaberItem {
  baslik: string;
  link: string;
  tarih: string;
  kaynak: string;
}

// Şirket adı eşleştirme — Google'da sembol yerine şirket adıyla arama daha iyi sonuç verir
const SEMBOL_AD_MAP: Record<string, string> = {
  THYAO: 'Türk Hava Yolları',
  GARAN: 'Garanti Bankası',
  ASELS: 'Aselsan',
  KCHOL: 'Koç Holding',
  EREGL: 'Ereğli Demir Çelik',
  BIMAS: 'BİM Mağazaları',
  AKBNK: 'Akbank',
  SISE:  'Şişe Cam',
  TUPRS: 'Tüpraş',
  FROTO: 'Ford Otosan',
  TOASO: 'Tofaş',
  SAHOL: 'Sabancı Holding',
  YKBNK: 'Yapı Kredi',
  HALKB: 'Halkbank',
  VAKBN: 'Vakıfbank',
  TCELL: 'Turkcell',
  ARCLK: 'Arçelik',
  EKGYO: 'Emlak Konut',
  PGSUS: 'Pegasus',
  TTKOM: 'Türk Telekom',
  PETKM: 'Petkim',
  DOHOL: 'Doğan Holding',
  KOZAL: 'Koza Altın',
  MGROS: 'Migros',
  SASA:  'SASA Polyester',
  ISCTR: 'İş Bankası',
  ENKAI: 'Enka İnşaat',
  BRISA: 'Brisa',
  AGHOL: 'AG Anadolu Grubu',
  OYAKC: 'Oyak Çimento',
};

function parseRSS(xml: string): HaberItem[] {
  const items: HaberItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] ?? '';

    const baslik = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ??
                    block.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? '';
    const link   = (block.match(/<link>(.*?)<\/link>/))?.[1]?.trim() ?? '';
    const tarih  = (block.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim() ?? '';
    const kaynak = (block.match(/<source[^>]*>(.*?)<\/source>/))?.[1]?.trim() ?? 'Google Haberler';

    if (baslik && link) {
      items.push({ baslik, link, tarih, kaynak });
    }
  }

  return items.slice(0, 6);
}

export async function GET(req: NextRequest) {
  const sembol = req.nextUrl.searchParams.get('sembol')?.toUpperCase() ?? '';
  if (!sembol) return NextResponse.json({ error: 'sembol gerekli' }, { status: 400 });

  const sirketAdi = SEMBOL_AD_MAP[sembol] ?? sembol;
  const query = encodeURIComponent(`${sirketAdi} hisse borsa`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=tr&gl=TR&ceid=TR:tr`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 1800 }, // 30 dk cache
    });

    if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
    const xml = await res.text();
    const haberler = parseRSS(xml);

    return NextResponse.json({ sembol, haberler });
  } catch (err) {
    console.error('[haber] RSS çekme hatası:', err);
    return NextResponse.json({ sembol, haberler: [] });
  }
}
