/**
 * Future Brightness Score cron — BIST.
 * 5 tematik alanın BIST sembollerini (.IS) temel veriden skorlar ve
 * future_scores tablosuna (market='BIST') yazar.
 *
 * GET /api/cron/future-scores-bist
 * - Vercel Cron: x-vercel-cron header
 * - Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * BIST'e özgü:
 *  - bistGuard() → tatil/hafta sonu çalışmaz
 *  - fetchTurkeyInflation() → TL bazlı revenueGrowth reel büyümeye çevrilir
 *  - EXPORT_BONUS → ihracatçı şirketlere döviz geliri bonusu
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bistGuard } from '@/lib/bist-guard';
import { getAllBistFutureSymbols, EXPORT_BONUS } from '@/lib/bist-future-themes';
import { fetchFundamentalsBistBatch } from '@/lib/yahoo-fundamentals';
import { fetchTurkeyInflation } from '@/lib/turkey-macro';
import { runFutureScores } from '@/lib/future-score-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro: 5 dk

const CRON_SECRET = process.env.CRON_SECRET;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const isManualAuth = CRON_SECRET && token === CRON_SECRET;

  if (!isVercelCron && !isManualAuth) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
    }
  }

  // BIST tatil/hafta sonu kontrolü
  const guard = bistGuard();
  if (guard) return guard;

  const startedAt = Date.now();

  try {
    const symbols = getAllBistFutureSymbols();

    // Enflasyon (reel büyüme düzeltmesi için)
    const inflation = await fetchTurkeyInflation();
    const inflationYoy = inflation?.value ?? null;

    console.log(
      `[future-scores:BIST] ${symbols.length} sembol skorlanıyor ` +
      `(TÜFE: ${inflationYoy !== null ? inflationYoy.toFixed(1) + '%' : 'yok'})`,
    );

    const fundamentals = await fetchFundamentalsBistBatch(symbols, 6, 700);

    const sb = createAdminClient();
    const coverage = await runFutureScores(sb, symbols, 'BIST', fundamentals, {
      inflationYoy,
      exportBonus: EXPORT_BONUS,
    });

    const durationMs = Date.now() - startedAt;
    console.log(
      `[future-scores:BIST] Tamamlandı: ${coverage.scored}/${coverage.total} skor, ` +
      `${coverage.insufficient} yetersiz, ${durationMs}ms`,
    );

    return NextResponse.json({
      ok: true,
      market: 'BIST',
      inflationYoy,
      scored: coverage.scored,
      total: coverage.total,
      insufficient: coverage.insufficient,
      nullFields: coverage.nullFields,
      durationMs,
    });
  } catch (error) {
    console.error('[future-scores:BIST] Hata:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
