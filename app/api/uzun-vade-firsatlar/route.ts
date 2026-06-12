export const dynamic = 'force-dynamic';
/**
 * Uzun Vade Fırsatlar API — v3 (FAZ 1 yeniden inşası)
 *
 * v2 sorunları (çözüldü):
 *  - ~60 hisselik HARDCODED liste → evrenin %90'ı yapısal olarak görünmezdi.
 *    Artık TAM BIST evreni cron'da skorlanır (ai_cache long-term:BIST).
 *  - İstek anında ~60 sembol × Yahoo fan-out + güvenilmez in-memory cache
 *    (Vercel cold start'ta uçar) → artık istek anında Yahoo'ya GİDİLMEZ.
 *  - Skor yalnızca Yatırım Skoru'ydu → artık bileşik Uzun Vade Skoru:
 *    Yatırım Skoru + Finansal Sağlık (Piotroski/Altman/Beneish) +
 *    Sektöre Göre Değerleme (peer) + Büyüme Momentumu + GARP verdict.
 *
 * Veri katmanları:
 *  - Temel katman: ai_cache `long-term:BIST` (haftalık cron, Pzt 10:30-10:50 TRT)
 *  - Teknik katman: scan_cache (günlük taze — fiyat, confluence, sparkline)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSector } from '@/lib/sectors';
import { getStoredLongTerm, type LongTermRow } from '@/lib/long-term-runner';
import type { ValuationResult } from '@/lib/valuation';
import type { OHLCVCandle } from '@/types';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ValuationResult'u re-export (sayfa import ediyor)
export type { ValuationResult };

/** Sayfaya dönen min bileşik skor */
const MIN_SCORE = 50;
/** Max sonuç (payload kontrolü — sparkline mumları dahil) */
const MAX_RESULTS = 150;
/** Sparkline mum sayısı (payload küçük kalsın) */
const SPARKLINE_CANDLES = 30;

export interface LongTermResult {
  sembol: string;
  sectorId: string;
  sectorName: string;
  investmentScore: number;
  investmentRating: string;
  investmentConfidence: string;
  technicalScore: number | null;
  lastPrice: number | null;
  /** Son mumlar — sparkline için */
  candles: OHLCVCandle[] | null;
  peRatio: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  bookValue: number | null;
  eps: number | null;
  valuation: ValuationResult | null;
  foreignOwnership: number | null;
  insidersOwnership: number | null;
  shortRatio: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  freeCashflow: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  beta: number | null;
  category: 'cift_onay' | 'deger_firsati' | 'guclu_temel';
  // ── FAZ 1: bileşik skor + temel analiz yığını ──────────────────────
  /** Bileşik Uzun Vade Skoru (0-100) — sayfa bununla sıralar */
  longTermScore: number;
  /** Beneish/Altman kalite kısması (1 = kısma yok) */
  qualityMultiplier: number;
  healthScore: number | null;
  piotroski: number | null;        // 0-9 (banka → null)
  altmanZone: string | null;       // güvenli | gri | sıkıntı
  beneishFlag: string | null;      // temiz | gri | şüpheli
  earningsQualityRating: string | null;
  isFinancial: boolean;
  relativeScore: number | null;    // 0-100 (sektöre göre ucuzluk)
  peerLabel: string | null;
  peerReliable: boolean;
  growthScore: number | null;      // 0-100 büyüme momentumu
  growthVerdict: string | null;
  garpCell: string | null;         // firsat | tuzak | pahali-hakli | pahali-gerceksiz
  garpLabel: string | null;
  advTL: number | null;
}

function toResult(
  r: LongTermRow,
  scan: { confluenceScore: number | null; lastPrice: number | null; candles: OHLCVCandle[] | null } | undefined,
  withCandles: boolean,
): LongTermResult {
  const techScore = scan?.confluenceScore ?? null;

  // Kategori:
  //  - cift_onay: teknik VE temel birlikte güçlü
  //  - deger_firsati: teknik zayıf/yok ama temel çok güçlü YA DA
  //    sektöre göre belirgin ucuz + GARP "fırsat" (FAZ 1 genişletmesi)
  //  - guclu_temel: kalanlar
  const teknikGuclu = techScore !== null && techScore >= 65;
  const teknikZayif = techScore === null || techScore < 50;
  const temelGuclu = r.longTermScore >= 60;
  const temelCokGuclu = r.longTermScore >= 65;
  const peerUcuzFirsat = (r.relativeScore ?? 0) >= 60 && r.garpCell === 'firsat';

  let category: LongTermResult['category'];
  if (teknikGuclu && temelGuclu) category = 'cift_onay';
  else if (teknikZayif && (temelCokGuclu || peerUcuzFirsat)) category = 'deger_firsati';
  else category = 'guclu_temel';

  return {
    sembol: r.sembol,
    sectorId: r.sector,
    sectorName: getSector(r.sembol).shortName,
    investmentScore: r.investmentScore,
    investmentRating: r.investmentRating,
    investmentConfidence: r.investmentConfidence,
    technicalScore: techScore,
    lastPrice: scan?.lastPrice ?? null,
    candles: withCandles ? scan?.candles ?? null : null,
    peRatio: r.peRatio,
    dividendYield: r.dividendYield,
    marketCap: r.marketCap,
    bookValue: r.bookValue,
    eps: r.eps,
    valuation: r.valuation,
    foreignOwnership: r.foreignOwnership,
    insidersOwnership: r.insidersOwnership,
    shortRatio: r.shortRatio,
    returnOnEquity: r.returnOnEquity,
    debtToEquity: r.debtToEquity,
    freeCashflow: r.freeCashflow,
    revenueGrowth: r.revenueGrowth,
    earningsGrowth: r.earningsGrowth,
    beta: r.beta,
    category,
    longTermScore: r.longTermScore,
    qualityMultiplier: r.qualityMultiplier,
    healthScore: r.healthScore,
    piotroski: r.piotroski,
    altmanZone: r.altmanZone,
    beneishFlag: r.beneishFlag,
    earningsQualityRating: r.earningsQualityRating,
    isFinancial: r.isFinancial,
    relativeScore: r.relativeScore,
    peerLabel: r.peerLabel,
    peerReliable: r.peerReliable,
    growthScore: r.growthScore,
    growthVerdict: r.growthVerdict,
    garpCell: r.garpCell,
    garpLabel: r.garpLabel,
    advTL: r.advTL,
  };
}

export async function GET() {
  const admin = createAdmin();

  // 1) Temel katman — haftalık cron'un yazdığı tek satır
  const store = await getStoredLongTerm(admin);
  if (!store || store.rows.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        results: [] as LongTermResult[],
        pending: true,
        message: 'Uzun vade taraması henüz çalışmadı (Pzt sabahları koşar). Manuel: /api/cron/long-term?part=1|2|3',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  }

  const candidates = store.rows.filter((r) => r.longTermScore >= MIN_SCORE).slice(0, MAX_RESULTS);

  // 2) Teknik katman — scan_cache'ten taze fiyat + confluence + sparkline (Yahoo YOK)
  type ScanEntry = { confluenceScore: number | null; lastPrice: number | null; candles: OHLCVCandle[] | null };
  const scanMap = new Map<string, ScanEntry>();
  if (candidates.length > 0) {
    const { data: cacheRows } = await admin
      .from('scan_cache')
      .select('sembol, confluence_score, last_close, candles_json')
      .eq('market', 'BIST')
      .in('sembol', candidates.map((r) => r.sembol));
    for (const row of cacheRows ?? []) {
      scanMap.set(row.sembol, {
        confluenceScore: row.confluence_score,
        lastPrice: row.last_close,
        candles: Array.isArray(row.candles_json)
          ? (row.candles_json as OHLCVCandle[]).slice(-SPARKLINE_CANDLES)
          : null,
      });
    }
  }

  const results = candidates.map((r) => toResult(r, scanMap.get(r.sembol), true));

  // Kategori önceliği + bileşik skor sırası
  const catOrder = { cift_onay: 0, deger_firsati: 1, guclu_temel: 2 } as const;
  results.sort((a, b) => {
    const catDiff = catOrder[a.category] - catOrder[b.category];
    if (catDiff !== 0) return catDiff;
    return b.longTermScore - a.longTermScore;
  });

  return NextResponse.json(
    {
      ok: true,
      results,
      scoredAt: store.scoredAt,
      inflationYoy: store.inflationYoy,
      universeScored: store.rows.length,
      cached: false,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
  );
}
