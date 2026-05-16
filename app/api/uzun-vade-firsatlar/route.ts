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

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

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

// BIST sektör ortalama F/K referansları (2024-2025 BIST verileri)
const SECTOR_AVG_PE: Record<string, number> = {
  banka:                   6.5,
  enerji:                 12.0,
  holding:                 8.0,
  havacılık_savunma:      18.0,
  otomotiv:               10.0,
  perakende:              14.0,
  telekom_teknoloji:      13.0,
  demir_celik_madencilik:  8.0,
  cam_kimya:              11.0,
  insaat_gyo:              9.0,
  sanayi:                 12.0,
  saglik:                 16.0,
  default:                11.0,
};

function calcLongTermTarget(params: {
  currentPrice: number | null;
  eps: number | null;
  peRatio: number | null;
  bookValue: number | null;
  dividendYield: number | null;
  sectorId: string;
}): {
  target: number | null;
  upside: number | null;
  method: string;
} {
  const { currentPrice, eps, peRatio, bookValue, dividendYield, sectorId } = params;
  if (!currentPrice || currentPrice <= 0) return { target: null, upside: null, method: '' };

  const sectorPE = SECTOR_AVG_PE[sectorId] ?? SECTOR_AVG_PE.default;

  // Yöntem 1: F/K bazlı (EPS varsa ve makul F/K'dan düşükse)
  if (eps && eps > 0 && sectorPE > 0) {
    const target = eps * sectorPE;
    if (target > currentPrice * 0.5 && target < currentPrice * 5) {
      const upside = ((target - currentPrice) / currentPrice) * 100;
      return { target: parseFloat(target.toFixed(2)), upside: parseFloat(upside.toFixed(1)), method: 'F/K Bazlı' };
    }
  }

  // Yöntem 2: Mevcut F/K'dan sektör F/K'ya normalize
  if (peRatio && peRatio > 0 && peRatio < 100 && sectorPE > 0) {
    const normFactor = sectorPE / peRatio;
    // Sadece %50+ potansiyel varsa hedef göster (mantıklı yönde)
    if (normFactor > 1.1 && normFactor < 4) {
      const target = currentPrice * normFactor;
      const upside = ((target - currentPrice) / currentPrice) * 100;
      return { target: parseFloat(target.toFixed(2)), upside: parseFloat(upside.toFixed(1)), method: 'F/K Normalize' };
    }
  }

  // Yöntem 3: Temettü verimi bazlı (düzenli temettü ödeyen için)
  if (dividendYield && dividendYield > 0.03) {
    // Hedef verim = BIST tarihsel temettü verimi ortalaması ~%4.5
    const TARGET_YIELD = 0.045;
    const annualDiv = currentPrice * dividendYield;
    const target = annualDiv / TARGET_YIELD;
    if (target > currentPrice * 1.05) {
      const upside = ((target - currentPrice) / currentPrice) * 100;
      return { target: parseFloat(target.toFixed(2)), upside: parseFloat(upside.toFixed(1)), method: 'Temettü Verimi' };
    }
  }

  return { target: null, upside: null, method: '' };
}

export interface LongTermResult {
  sembol: string;
  sectorId: string;
  sectorName: string;
  investmentScore: number;
  investmentRating: string;
  investmentConfidence: string;
  technicalScore: number | null;
  lastPrice: number | null;
  peRatio: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  bookValue: number | null;
  eps: number | null;
  // Uzun vade hedef fiyat
  longTermTarget: number | null;
  longTermUpside: number | null;
  longTermTargetMethod: string;
  // Takas (yabancı sahiplik) — takasbank verisi
  foreignOwnership: number | null;
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

  // scan_cache'den teknik skorlar + son fiyat + takas
  const { data: cacheRows } = await admin
    .from('scan_cache')
    .select('sembol, confluence_score, rsi, last_close')
    .in('sembol', UNIQUE_SYMBOLS)
    .order('scanned_at', { ascending: false });

  // Her sembol için en güncel veriyi al
  const scanMap = new Map<string, { confluenceScore: number | null; rsi: number | null; lastPrice: number | null }>();
  for (const row of cacheRows ?? []) {
    if (!scanMap.has(row.sembol)) {
      scanMap.set(row.sembol, {
        confluenceScore: row.confluence_score,
        rsi: row.rsi,
        lastPrice: row.last_close,
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

          // Uzun vade hedef fiyat
          const { target, upside, method } = calcLongTermTarget({
            currentPrice:  price,
            eps:           fundamentals.eps,
            peRatio:       fundamentals.peRatio,
            bookValue:     fundamentals.bookValue,
            dividendYield: fundamentals.dividendYield,
            sectorId,
          });

          // Kurumsal/yabancı sahiplik — Yahoo fundamentals'tan (institutionsPercentHeld)
          const foreignOwnership = fundamentals.institutionsPercentHeld != null
            ? parseFloat((fundamentals.institutionsPercentHeld * 100).toFixed(1))
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
            longTermTarget:         target,
            longTermUpside:         upside,
            longTermTargetMethod:   method,
            foreignOwnership,
            category,
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
