/**
 * KAP Duyuruları API.
 * KAP RSS feed'ini parse eder, duyuruları döner.
 *
 * GET /api/kap
 * Response: { duyurular: KapDuyuru[] }
 *
 * Cache: 15 dk CDN
 */

import { NextResponse } from 'next/server';
import type { KapDuyuru } from '@/lib/kap';

const KAP_RSS_URL = 'https://www.kap.org.tr/tr/api/disclosures/recent?returnType=json';

/** KAP API'sinden ham veri şeması (subset) */
interface KapApiItem {
  infoTypeDesc?: string;
  disclosureSummary?: string;
  memberDesc?: string;
  stockCodes?: string;
  publishedAt?: string;
  disclosureIndex?: string | number;
}

function buildUrl(id: string | number): string {
  return `https://www.kap.org.tr/tr/Bildirim/${id}`;
}

export async function GET() {
  try {
    const res = await fetch(KAP_RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BistAI/1.0)',
        Accept: 'application/json',
      },
      next: { revalidate: 900 }, // 15 dk cache
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'KAP verisi alınamadı.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const raw: KapApiItem[] = await res.json();

    const duyurular: KapDuyuru[] = (Array.isArray(raw) ? raw : [])
      .slice(0, 100)
      .map((item, i) => ({
        id: String(item.disclosureIndex ?? i),
        baslik: item.disclosureSummary ?? 'Bildirim',
        sirket: item.memberDesc ?? '',
        sembol: item.stockCodes?.split(',')[0]?.trim() ?? '',
        kategoriAdi: item.infoTypeDesc ?? 'Diğer',
        tarih: item.publishedAt ?? '',
        url: buildUrl(item.disclosureIndex ?? ''),
      }));

    return NextResponse.json(
      { duyurular },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
        },
      }
    );
  } catch (err) {
    console.error('[api/kap] Hata:', err);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
