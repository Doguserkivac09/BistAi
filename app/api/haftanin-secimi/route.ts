/**
 * GET /api/haftanin-secimi
 * Bu hafta için seçilmiş en güçlü uzun vade fırsatını ai_cache'den okur.
 * Cron tarafından her Pazartesi güncellenir (/api/cron/haftanin-secimi-uzun).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export interface HaftaninSecimiData {
  sembol:          string;
  gerekce:         string;
  investmentScore: number;
  lastPrice:       number | null;
  peRatio:         number | null;
  returnOnEquity:  number | null;
  valUpside:       number | null;
  valTarget:       number | null;
  valStatus:       'undervalued' | 'fair' | 'overvalued' | null;
  category:        'cift_onay' | 'deger_firsati' | 'guclu_temel';
  sectorName:      string;
  beta:            number | null;
  dividendYield:   number | null;
  generatedAt:     string;
}

export interface HaftaninSecimiResponse {
  ok:   boolean;
  data: HaftaninSecimiData | null;
}

function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `haftanin-secimi-uzun:${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const cacheKey = getWeekKey(new Date());

  try {
    const db = createAdmin();
    const { data } = await db
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!data?.explanation) {
      return NextResponse.json({ ok: true, data: null });
    }

    const parsed = JSON.parse(data.explanation) as HaftaninSecimiData;
    return NextResponse.json(
      { ok: true, data: parsed },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } },
    );
  } catch {
    return NextResponse.json({ ok: true, data: null });
  }
}
