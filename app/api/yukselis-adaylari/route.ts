export const dynamic = 'force-dynamic';
/**
 * Yükseliş Adayları (Bebek Hisseler) API — FAZ 2
 *
 * "Henüz yükselmemiş, yüksek potansiyel" adayları. Patlamanın sonucunu değil
 * kurulumunu skorlar (babyScore). Veri katmanları:
 *  - Skor katmanı: ai_cache `baby-candidates:BIST` (haftalık cron, Pzt 11:30 TRT)
 *  - Teknik katman: scan_cache (günlük taze — fiyat, confluence, sparkline)
 *
 * İstek anında Yahoo'ya GİDİLMEZ (long-term-firsatlar deseni).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSector } from '@/lib/sectors';
import { getStoredBaby, type BabyRow } from '@/lib/baby-runner';
import type { OHLCVCandle } from '@/types';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Sayfaya dönen min babyScore */
const MIN_SCORE = 50;
const MAX_RESULTS = 120;
const SPARKLINE_CANDLES = 30;

export interface YukselisResult extends BabyRow {
  sectorName: string;
  lastPrice: number | null;
  technicalScore: number | null;
  candles: OHLCVCandle[] | null;
}

export async function GET() {
  const admin = createAdmin();

  // 1) Skor katmanı — haftalık cron'un yazdığı tek satır
  const store = await getStoredBaby(admin);
  if (!store || store.rows.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        results: [] as YukselisResult[],
        pending: true,
        message:
          'Bebek hisseler taraması henüz çalışmadı (Pzt sabahları koşar). Manuel: /api/cron/baby-candidates?part=1|2',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  }

  const candidates = store.rows.filter((r) => r.babyScore >= MIN_SCORE).slice(0, MAX_RESULTS);

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

  const results: YukselisResult[] = candidates.map((r) => {
    const scan = scanMap.get(r.sembol);
    return {
      ...r,
      sectorName: getSector(r.sembol).shortName,
      lastPrice: scan?.lastPrice ?? r.lastClose,
      technicalScore: scan?.confluenceScore ?? null,
      candles: scan?.candles ?? null,
    };
  });

  results.sort((a, b) => b.babyScore - a.babyScore);

  return NextResponse.json(
    {
      ok: true,
      results,
      scoredAt: store.scoredAt,
      inflationYoy: store.inflationYoy,
      universeScored: store.rows.length,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
  );
}
