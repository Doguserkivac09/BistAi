/**
 * Bilanço Kalitesi Tarama API (Bilanço B1 → piyasa-geneli liste).
 * GET /api/earnings-scan
 *
 * earnings-quality cron'un doldurduğu konsolide ai_cache map'ini okur, sektör ekler,
 * skora göre sıralı dizi döner. İstek-anı hesap YOK (tek ai_cache okuma).
 *
 * ⚠️ Bu bir KALİTE/RİSK tarama aracı — getiri tahmini DEĞİL (doğrulama kararı).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEarningsFlags } from '@/lib/earnings-quality-runner';
import { getSector, getSectorId } from '@/lib/sectors';

export const dynamic = 'force-dynamic';

export interface EarningsScanRow {
  sembol: string;
  sektorAdi: string;
  sektorId: string;
  verdict: string;
  score: number;
  financeBurden: boolean;
  redFlag: string | null;
  operatingMargin: number | null;
  interestCoverage: number | null;
  netMargin: number | null;
  lastQuarter: string;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ rows: [], updatedAt: null });

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const map = await getEarningsFlags(sb);

  const rows: EarningsScanRow[] = Object.entries(map).map(([sembol, e]) => ({
    sembol,
    sektorAdi: getSector(sembol).shortName,
    sektorId: getSectorId(sembol),
    verdict: e.verdict,
    score: e.score,
    financeBurden: e.financeBurden,
    redFlag: e.redFlag ?? null,
    operatingMargin: e.operatingMargin ?? null,
    interestCoverage: e.interestCoverage ?? null,
    netMargin: e.netMargin ?? null,
    lastQuarter: e.lastQuarter,
  })).sort((a, b) => b.score - a.score);

  return NextResponse.json(
    { rows, count: rows.length },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
  );
}
