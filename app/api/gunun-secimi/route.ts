/**
 * GET /api/gunun-secimi
 * Bugün için seçilmiş en güçlü teknik kurulumu ai_cache'den okur.
 * Cron tarafından güncellenir (/api/cron/gunun-secimi).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export interface GununSecimiData {
  sembol:          string;
  gerekce:         string;
  adjustedScore:   number;
  entryPrice:      number;
  stopLoss:        number | null;
  targetPrice:     number | null;
  riskRewardRatio: number | null;
  direction:       'yukari' | 'asagi';
  sinyaller:       string[];
  weeklyAligned:   boolean | null;
  sektorAdi:       string;
  relVol5:         number | null;
  generatedAt:     string;
}

export interface GununSecimiResponse {
  ok:   boolean;
  data: GununSecimiData | null;
}

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const today    = new Date().toISOString().slice(0, 10);
  const cacheKey = `gunun-secimi:${today}`;

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

    const parsed = JSON.parse(data.explanation) as GununSecimiData;
    return NextResponse.json(
      { ok: true, data: parsed },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300' } },
    );
  } catch {
    return NextResponse.json({ ok: true, data: null });
  }
}
