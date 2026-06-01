/**
 * Future Brightness Score cron.
 * Görüntülenen 4 temanın (AI, Quantum, Space, Cybersecurity) US sembolleri için
 * temel veri bazlı 0-100 skor hesaplar ve future_scores tablosuna yazar.
 *
 * GET /api/cron/future-scores
 * - Vercel Cron: x-vercel-cron header
 * - Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * NOT: NewsAPI ve Claude çağrıları KALDIRILDI:
 *  - 540 sembol × Claude = 300s timeout
 *  - NewsAPI ücretli/key gerektiriyor (ücretsiz kaynak tercihi)
 *  → Skor tamamen Yahoo fundamentals'tan deterministik hesaplanır,
 *    özet computeFutureScore.summary'den gelir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSymbolsByTheme, type ThemeId } from '@/lib/us-symbols';
import { fetchFundamentalsBatch } from '@/lib/yahoo-fundamentals';
import { computeFutureScore } from '@/lib/future-score';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro: 5 dk

const CRON_SECRET = process.env.CRON_SECRET;

// Sayfada gösterilen temalar — sadece bunların sembollerini skorla (hız + güvenilirlik)
const SCORED_THEMES: ThemeId[] = ['AI', 'Quantum', 'Space', 'Cybersecurity'];

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
    // 4 temanın sembollerinin birleşimi (tekrarsız)
    const symbolSet = new Set<string>();
    for (const t of SCORED_THEMES) {
      for (const s of getSymbolsByTheme(t)) symbolSet.add(s);
    }
    const symbols = [...symbolSet];

    console.log(`[future-scores] ${symbols.length} sembol skorlanıyor (${SCORED_THEMES.join(', ')})`);

    const fundamentals = await fetchFundamentalsBatch(symbols, 6, 600);

    const upsertData = [];
    for (const symbol of symbols) {
      const fund = fundamentals.get(symbol);
      if (!fund) continue;

      // News + partnership sinyalleri yok → nötr (50)
      const breakdown = computeFutureScore(fund, 0, 0, 0);

      upsertData.push({
        sembol: symbol,
        market: 'US',
        score: breakdown.score,
        revenue_score: breakdown.revenueScore,
        analyst_score: breakdown.analystScore,
        insider_score: breakdown.insiderScore,
        news_score: breakdown.newsScore,
        institutional_score: breakdown.institutionalScore,
        balance_score: breakdown.balanceScore,
        partnership_score: breakdown.partnershipScore,
        ai_summary: breakdown.summary,
        scored_at: new Date().toISOString(),
      });
    }

    const sb = createAdminClient();
    let written = 0;
    for (let i = 0; i < upsertData.length; i += 100) {
      const batch = upsertData.slice(i, i + 100);
      const { error } = await sb
        .from('future_scores')
        .upsert(batch, { onConflict: 'sembol,market' });
      if (error) {
        console.error(`[future-scores] Upsert batch ${i / 100} hatası:`, error.message);
      } else {
        written += batch.length;
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[future-scores] Tamamlandı: ${written}/${symbols.length} skor, ${durationMs}ms`);

    return NextResponse.json({
      ok: true,
      themes: SCORED_THEMES,
      scored: written,
      total: symbols.length,
      durationMs,
    });
  } catch (error) {
    console.error('[future-scores] Hata:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
