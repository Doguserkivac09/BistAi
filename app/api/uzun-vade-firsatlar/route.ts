/**
 * Uzun Vade Fırsatlar API — v2
 *
 * GET /api/uzun-vade-firsatlar
 *
 * v2 değişiklikleri:
 *  - Sabit likit hisse listesi (scan_cache sıralamasına bağımlılık kaldırıldı)
 *    → ENKAI, TUPRS gibi büyük şirketler artık garanti dahil
 *  - Uzun Vade Hedef Fiyat (F/K bazlı teorik değerleme)
 *  - Takas verisi entegrasyonu (yabancı sahiplik oranı)
 *  - Daha düşük score eşiği (50 → güvenilir veri varsa)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchYahooFundamentals } from '@/lib/yahoo-fundamentals';
import { computeInvestableScore, DEFAULT_WEIGHTS } from '@/lib/investment-score';
import { fetchTurkeyInflation } from '@/lib/turkey-macro';
import { getSector, getSectorId } from '@/lib/sectors';
import { calcInstitutionalTarget, type ValuationResult } from '@/lib/valuation';
import type { OHLCVCandle } from '@/types';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ValuationResult'u re-export
export type { ValuationResult };

// ── Sabit Likit Hisse Listesi ─────────────────────────────────────────
// BIST'in en likit ve büyük hisseleri — scan_cache sıralamasından bağımsız.
// Bu liste ENKAI, TUPRS gibi büyük şirketleri garanti olarak kapsar.
const CORE_LIQUID_SYMBOLS = [
  // Bankacılık (en likit)
  'AKBNK','GARAN','ISCTR','VAKBN','YKBNK','HALKB','SKBNK',
  // Enerji & Petrokimya
  'TUPRS','AKSEN','ENJSA','PETKM','ODAS','AKENR',
  // Holding
  'KCHOL','SAHOL','DOHOL','TKFEN',
  // Havacılık & Savunma
  'THYAO','PGSUS','ASELS',
  // Otomotiv
  'FROTO','TOASO','OTKAR',
  // Perakende & Tüketici
  'BIMAS','MGROS','SOKM','ULKER','CCOLA',
  // Telekom & Teknoloji
  'TCELL','TTKOM','ASTOR',
  // Demir-Çelik
  'EREGL','KRDMD','KRDMA',
  // İnşaat & GYO
  'EKGYO','ENKAI','TKFEN',
  // Cam & Kimya
  'SISE','PETKM','GUBRF',
  // Sanayi & Üretim
  'ARCLK','VESTL','BRISA',
  // Gıda
  'ULKER','CCOLA','AEFES',
  // Sağlık
  'SELEC','DEVA',
  // Ek likit mid-cap
  'TAVHL','LOGO','MAVI','KCHOL','SASA','OYAKC','GESAN',
  'ALGYO','KLGYO','TRGYO','EKGYO',
  'KONTR','NATEN','AKSA',
];

const UNIQUE_SYMBOLS = [...new Set(CORE_LIQUID_SYMBOLS)];

// In-memory cache (6 saat)
let cache: { data: LongTermResult[]; ts: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000;
const MIN_SCORE = 50;

// ── Uzun Vade Hedef Fiyat Hesaplama ─────────────────────────────────────
// F/K bazlı teorik değerleme:
//   Adil F/K = sektör ortalaması veya tarihsel ortalama
//   Teorik Hedef = EPS × Adil F/K
//
// Alternatif — F/DD bazlı:
//   Teorik Hedef = Book Value × Sektör Ortalama F/DD
//
// Temettü bazlı:
//   Eğer şirket düzenli temettü ödüyorsa DDM yaklaşımı kullanılır.


export interface LongTermResult {
  sembol: string;
  sectorId: string;
  sectorName: string;
  investmentScore: number;
  investmentRating: string;
  investmentConfidence: string;
  technicalScore: number | null;
  lastPrice: number | null;
  /** Son 60 günlük mum verisi — sparkline için */
  candles: OHLCVCandle[] | null;
  peRatio: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  bookValue: number | null;
  eps: number | null;
  // Kurumsal değerleme (yeni — 5 yöntemli)
  valuation: ValuationResult | null;
  // Kurumsal sahiplik
  foreignOwnership: number | null;
  insidersOwnership: number | null;
  shortRatio: number | null;
  // Temel metrikler
  returnOnEquity: number | null;
  debtToEquity: number | null;
  freeCashflow: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  beta: number | null;
  category: 'cift_onay' | 'deger_firsati' | 'guclu_temel';
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(
      { ok: true, results: cache.data, cached: true },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } },
    );
  }

  const admin = createAdmin();

  // scan_cache'den teknik skorlar + son fiyat + sparkline mumları (BIST only)
  const { data: cacheRows } = await admin
    .from('scan_cache')
    .select('sembol, confluence_score, rsi, last_close, candles_json')
    .eq('market', 'BIST')
    .in('sembol', UNIQUE_SYMBOLS)
    .order('scanned_at', { ascending: false });

  // Her sembol için en güncel veriyi al
  type ScanEntry = { confluenceScore: number | null; rsi: number | null; lastPrice: number | null; candles: OHLCVCandle[] | null };
  const scanMap = new Map<string, ScanEntry>();
  for (const row of cacheRows ?? []) {
    if (!scanMap.has(row.sembol)) {
      scanMap.set(row.sembol, {
        confluenceScore: row.confluence_score,
        rsi: row.rsi,
        lastPrice: row.last_close,
        candles: Array.isArray(row.candles_json) ? (row.candles_json as OHLCVCandle[]) : null,
      });
    }
  }

  // Takas / sahiplik verisi Yahoo fundamentals'tan alınır (institutionalOwnershipPercent)
  // Ayrı DB sorgusu gerekmez — investment score fetch sırasında çekilir

  // Türkiye enflasyonu
  const inflation = await fetchTurkeyInflation().catch(() => null);
  const inflCtx = inflation && typeof inflation.value === 'number'
    ? { tufeYoy: inflation.value, source: 'tcmb' as const }
    : undefined;

  // Investment score paralel çek
  const BATCH = 8;
  const results: LongTermResult[] = [];

  for (let i = 0; i < UNIQUE_SYMBOLS.length; i += BATCH) {
    const batch = UNIQUE_SYMBOLS.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(async (sembol) => {
        try {
          const fundamentals = await fetchYahooFundamentals(sembol);
          const inv = computeInvestableScore(fundamentals, DEFAULT_WEIGHTS, inflCtx);
          if (inv.score < MIN_SCORE) return null;

          const scanData  = scanMap.get(sembol);
          const sectorId  = getSectorId(sembol);
          const sector    = getSector(sectorId);
          const techScore = scanData?.confluenceScore ?? null;
          const price     = scanData?.lastPrice ?? null;

          // Kurumsal değerleme — 5 yöntemli profesyonel model
          const valuation = price
            ? calcInstitutionalTarget(fundamentals, price, sectorId, inv.score)
            : null;

          // Sahiplik verileri
          const foreignOwnership = fundamentals.institutionsPercentHeld != null
            ? parseFloat((fundamentals.institutionsPercentHeld * 100).toFixed(1))
            : null;
          const insidersOwnership = fundamentals.insidersPercentHeld != null
            ? parseFloat((fundamentals.insidersPercentHeld * 100).toFixed(1))
            : null;

          // Kategori
          const teknikGuclu   = techScore !== null && techScore >= 65;
          const temelGuclu    = inv.score >= 60;
          const temelCokGuclu = inv.score >= 65;
          const teknikZayif   = techScore === null || techScore < 50;

          let category: LongTermResult['category'];
          if (teknikGuclu && temelGuclu)       category = 'cift_onay';
          else if (teknikZayif && temelCokGuclu) category = 'deger_firsati';
          else                                   category = 'guclu_temel';

          return {
            sembol,
            sectorId,
            sectorName:             sector.shortName,
            investmentScore:        inv.score,
            investmentRating:       inv.ratingLabel,
            investmentConfidence:   inv.confidence,
            technicalScore:         techScore,
            lastPrice:              price,
            peRatio:                fundamentals.peRatio,
            dividendYield:          fundamentals.dividendYield,
            marketCap:              fundamentals.marketCap,
            bookValue:              fundamentals.bookValue,
            eps:                    fundamentals.eps,
            valuation,
            foreignOwnership,
            insidersOwnership,
            shortRatio:       fundamentals.shortRatio,
            returnOnEquity:   fundamentals.returnOnEquity != null ? parseFloat((fundamentals.returnOnEquity * 100).toFixed(1)) : null,
            debtToEquity:     fundamentals.debtToEquity,
            freeCashflow:     fundamentals.freeCashflow,
            revenueGrowth:    fundamentals.revenueGrowth != null ? parseFloat((fundamentals.revenueGrowth * 100).toFixed(1)) : null,
            earningsGrowth:   fundamentals.earningsGrowth != null ? parseFloat((fundamentals.earningsGrowth * 100).toFixed(1)) : null,
            beta:             fundamentals.beta,
            category,
            candles:          scanData?.candles ?? null,
          } satisfies LongTermResult;
        } catch {
          return null;
        }
      }),
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value !== null) {
        results.push(r.value);
      }
    }
  }

  results.sort((a, b) => {
    const catOrder = { cift_onay: 0, deger_firsati: 1, guclu_temel: 2 };
    const catDiff = catOrder[a.category] - catOrder[b.category];
    if (catDiff !== 0) return catDiff;
    return b.investmentScore - a.investmentScore;
  });

  cache = { data: results, ts: Date.now() };

  return NextResponse.json(
    { ok: true, results, cached: false },
    { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } },
  );
}
