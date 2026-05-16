/**
 * Uzun Vade Fırsatlar API
 *
 * GET /api/uzun-vade-firsatlar
 *
 * Yatırım Skoru yüksek + likidite yeterli hisseleri döndürür.
 * Kısa vadeli teknik sinyallerden bağımsız — temel veri odaklı.
 *
 * 3 Kategori:
 *  - cift_onay:     Teknik ≥65 + Temel ≥60 (her iki perspektif uyumlu)
 *  - deger_firsati: Teknik <50 + Temel ≥65 (ucuz, sağlam, sabır gerekir)
 *  - guclu_temel:   Temel ≥60, diğerleri (uzun vade seçenek)
 *
 * Cache: 6 saat (fundamentals nadir değişir)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchYahooFundamentals } from '@/lib/yahoo-fundamentals';
import { computeInvestableScore, DEFAULT_WEIGHTS } from '@/lib/investment-score';
import { fetchTurkeyInflation } from '@/lib/turkey-macro';
import { getSector, getSectorId } from '@/lib/sectors';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// In-memory cache (6 saat)
let cache: { data: LongTermResult[]; ts: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000;

export interface LongTermResult {
  sembol: string;
  sectorId: string;
  sectorName: string;
  investmentScore: number;
  investmentRating: string;
  investmentConfidence: string;
  /** Teknik skor — scan_cache'den, null ise veri yok */
  technicalScore: number | null;
  /** Son fiyat */
  lastPrice: number | null;
  /** P/E oranı */
  peRatio: number | null;
  /** Temettü verimi */
  dividendYield: number | null;
  /** Piyasa değeri */
  marketCap: number | null;
  /** Kategori */
  category: 'cift_onay' | 'deger_firsati' | 'guclu_temel';
}

export async function GET() {
  // Cache kontrolü
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(
      { ok: true, results: cache.data, cached: true },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } },
    );
  }

  const admin = createAdmin();

  // Top 70 likit hisse — scan_cache'den avg hacim bazlı
  const { data: cacheRows } = await admin
    .from('scan_cache')
    .select('sembol, confluence_score, rsi, last_close')
    .not('last_close', 'is', null)
    .order('scanned_at', { ascending: false })
    .limit(300);

  // Hacim filtresi yoksa likit bilinenler — sembol bazında al, tekrar olmasın
  const sembolMap = new Map<string, { confluenceScore: number | null; rsi: number | null; lastPrice: number | null }>();
  for (const row of cacheRows ?? []) {
    if (!sembolMap.has(row.sembol)) {
      sembolMap.set(row.sembol, {
        confluenceScore: row.confluence_score,
        rsi: row.rsi,
        lastPrice: row.last_close,
      });
    }
  }

  // Top 70 — tüm sembolleri al (likit olanlar zaten scan'de var)
  const symbols = Array.from(sembolMap.keys()).slice(0, 70);

  // Türkiye enflasyonu (investment score için)
  const inflation = await fetchTurkeyInflation().catch(() => null);
  const inflCtx = inflation && typeof inflation.value === 'number'
    ? { tufeYoy: inflation.value, source: 'tcmb' as const }
    : undefined;

  // Her sembol için investment score paralel çek (cache'li, hızlı)
  const BATCH = 10;
  const results: LongTermResult[] = [];

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(async (sembol) => {
        const fundamentals = await fetchYahooFundamentals(sembol);
        const inv = computeInvestableScore(fundamentals, DEFAULT_WEIGHTS, inflCtx);

        const scanData = sembolMap.get(sembol);
        const technicalScore = scanData?.confluenceScore ?? null;
        const sectorId = getSectorId(sembol);
        const sector = getSector(sectorId);

        // Kategori belirleme
        const teknikGuclu = technicalScore !== null && technicalScore >= 65;
        const temelGuclu  = inv.score >= 60;
        const temelCokGuclu = inv.score >= 65;
        const teknikZayif  = technicalScore === null || technicalScore < 50;

        let category: LongTermResult['category'];
        if (teknikGuclu && temelGuclu) {
          category = 'cift_onay';
        } else if (teknikZayif && temelCokGuclu) {
          category = 'deger_firsati';
        } else {
          category = 'guclu_temel';
        }

        return {
          sembol,
          sectorId,
          sectorName: sector.shortName,
          investmentScore: inv.score,
          investmentRating: inv.ratingLabel,
          investmentConfidence: inv.confidence,
          technicalScore,
          lastPrice: scanData?.lastPrice ?? null,
          peRatio: fundamentals.peRatio,
          dividendYield: fundamentals.dividendYield,
          marketCap: fundamentals.marketCap,
          category,
        } satisfies LongTermResult;
      }),
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value.investmentScore >= 55) {
        results.push(r.value);
      }
    }
  }

  // Sırala: Çift Onay > Değer Fırsatı > Güçlü Temel; her grupta skor desc
  const categoryOrder = { cift_onay: 0, deger_firsati: 1, guclu_temel: 2 };
  results.sort((a, b) => {
    const catDiff = categoryOrder[a.category] - categoryOrder[b.category];
    if (catDiff !== 0) return catDiff;
    return b.investmentScore - a.investmentScore;
  });

  cache = { data: results, ts: Date.now() };

  return NextResponse.json(
    { ok: true, results, cached: false },
    { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } },
  );
}
