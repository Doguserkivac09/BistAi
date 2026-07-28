/**
 * Sinyal Birleşim (combo) istatistikleri cron.
 * Tüm evaluated BIST signal_performance satırlarından ikili/üçlü combo'ların
 * geçmiş isabet/net getirisini hesaplar, sağlamlık kapısını geçenleri ai_cache'e
 * yazar (migration yok). Fırsat/hisse kartlarındaki "onaylı kurulum" rozeti bunu okur.
 *
 * GET /api/cron/combo-stats
 * Schedule: haftalık (istatistik yavaş değişir, forward veriyle kendini düzeltir).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  computeComboStats,
  filterStrongCombos,
  storeStrongCombos,
  type ComboStatsInputRow,
} from '@/lib/combo-stats';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const PAGE = 1000;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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

  const startedAt = Date.now();
  try {
    const sb = createAdminClient();

    // Tüm evaluated BIST satırlarını sayfa sayfa çek (return_7d dolu)
    const rows: ComboStatsInputRow[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from('signal_performance')
        .select('sembol, entry_time, direction, signal_type, return_7d')
        .eq('evaluated', true)
        .or('market.eq.BIST,market.is.null')
        .not('return_7d', 'is', null)
        .range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) break;
      rows.push(...(data as ComboStatsInputRow[]));
      from += PAGE;
      if (data.length < PAGE) break;
    }

    const all = computeComboStats(rows);
    const strong = filterStrongCombos(all);
    await storeStrongCombos(sb, strong);

    const durationMs = Date.now() - startedAt;
    console.log(`[combo-stats] ${rows.length} satır, ${all.length} combo, ${strong.length} güçlü, ${durationMs}ms`);

    return NextResponse.json({
      ok: true,
      scannedRows: rows.length,
      totalCombos: all.length,
      strongCombos: strong.length,
      top: strong.slice(0, 12),
      durationMs,
    });
  } catch (error) {
    console.error('[combo-stats] Hata:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
