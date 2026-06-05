/**
 * Sektör Medyan Çarpanları cron — peer/görece değerleme için.
 * Tüm BIST evreninin fundamentals'ını çekip her sektör için F/K, F/DD,
 * EV/FAVÖK, ROE, net marj medyanını hesaplar ve ai_cache'e yazar (migration yok).
 *
 * GET /api/cron/sector-medians
 * Schedule: haftalık (medyanlar yavaş değişir).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeAllSectorMedians, storeSectorMedians } from '@/lib/sector-medians';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

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
    const { medians, fetched } = await computeAllSectorMedians();
    const sectorCount = Object.keys(medians).length;

    const sb = createAdminClient();
    await storeSectorMedians(sb, medians);

    const durationMs = Date.now() - startedAt;
    console.log(`[sector-medians] ${sectorCount} sektör, ${fetched} sembol fetch, ${durationMs}ms`);

    return NextResponse.json({
      ok: true,
      sectors: sectorCount,
      fetched,
      medians,
      durationMs,
    });
  } catch (error) {
    console.error('[sector-medians] Hata:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
