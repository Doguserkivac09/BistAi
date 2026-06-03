/**
 * Future Brightness Score cron — US.
 * 13 tematik alanın US sembollerini temel veriden 0-100 skorlar ve
 * future_scores tablosuna (market='US') yazar.
 *
 * GET /api/cron/future-scores
 * - Vercel Cron: x-vercel-cron header
 * - Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * Sembol sayısı: SYMBOL_THEMES'te eşlenen benzersiz semboller (~130) —
 * tüm US evreni (530) DEĞİL. Batch 6 / 600ms ≈ 50s, 300s limiti içinde.
 *
 * NOT: NewsAPI/Claude çağrıları yok — skor tamamen Yahoo fundamentals'tan
 * deterministik hesaplanır.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSymbolsByTheme, ALL_THEMES } from '@/lib/us-symbols';
import { fetchFundamentalsBatch } from '@/lib/yahoo-fundamentals';
import { runFutureScores } from '@/lib/future-score-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro: 5 dk

const CRON_SECRET = process.env.CRON_SECRET;

// 13 temanın tamamı skorlanır.
const SCORED_THEMES = ALL_THEMES;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  // Yetki: Vercel Cron header VEYA manuel Bearer token
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const isManualAuth = CRON_SECRET && token === CRON_SECRET;

  if (!isVercelCron && !isManualAuth) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
    }
  }

  const startedAt = Date.now();

  try {
    // 13 temanın sembollerinin birleşimi (tekrarsız)
    const symbolSet = new Set<string>();
    for (const t of SCORED_THEMES) {
      for (const s of getSymbolsByTheme(t)) symbolSet.add(s);
    }
    const symbols = [...symbolSet];

    console.log(`[future-scores:US] ${symbols.length} sembol skorlanıyor (${SCORED_THEMES.length} tema)`);

    const fundamentals = await fetchFundamentalsBatch(symbols, 6, 600);

    const sb = createAdminClient();
    const coverage = await runFutureScores(sb, symbols, 'US', fundamentals);

    const durationMs = Date.now() - startedAt;
    console.log(
      `[future-scores:US] Tamamlandı: ${coverage.scored}/${coverage.total} skor, ` +
      `${coverage.insufficient} yetersiz, ${durationMs}ms`,
    );

    return NextResponse.json({
      ok: true,
      market: 'US',
      themes: SCORED_THEMES.length,
      scored: coverage.scored,
      total: coverage.total,
      insufficient: coverage.insufficient,
      nullFields: coverage.nullFields,
      durationMs,
    });
  } catch (error) {
    console.error('[future-scores:US] Hata:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
