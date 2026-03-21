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

interface KapItem {
  disclosureIndex?: number;
  disclosureDate?: string;
  publishDate?: string;
  subject?: string;
  disclosureType?: string;
  disclosureTypeName?: string;
  isLate?: boolean;
  memberCode?: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const KAP_BASE = 'https://www.kap.org.tr';

// ── KAP bildirimleri ──────────────────────────────────────────────────────────
async function fetchKap(sembol: string): Promise<HaberItem[]> {
  // KAP üye kodu listesi — sembol → üye kodu eşleştirme
  const memberUrl = `${KAP_BASE}/tr/api/memberDisclosureQuery/index/${sembol}/`;
  const res = await fetch(memberUrl, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`KAP ${res.status}`);

  const items: KapItem[] = await res.json();
  if (!Array.isArray(items) || items.length === 0) throw new Error('KAP boş');

  return items.slice(0, 6).map((item) => ({
    baslik: item.subject ?? item.disclosureTypeName ?? 'KAP Bildirimi',
    link: item.disclosureIndex
      ? `${KAP_BASE}/tr/Bildirim/${item.disclosureIndex}`
      : `${KAP_BASE}/tr/Bildirim-Sorgulama`,
    tarih: item.publishDate ?? item.disclosureDate ?? '',
    kaynak: 'KAP',
  }));
}

// ── Ana handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sembol = req.nextUrl.searchParams.get('sembol')?.toUpperCase() ?? '';
  if (!sembol) return NextResponse.json({ error: 'sembol gerekli' }, { status: 400 });

  try {
    const haberler = await fetchKap(sembol);
    return NextResponse.json({ sembol, haberler, kaynak: 'KAP' });
  } catch (err) {
    console.error('[haber] KAP hatası:', err);
    return NextResponse.json({ sembol, haberler: [], kaynak: 'yok' });
  }
}
