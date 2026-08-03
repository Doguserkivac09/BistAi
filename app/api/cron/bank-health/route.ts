/**
 * Banka Sağlık precompute cron (BANKA-MOTORU-PLAN FAZ K2-6).
 *
 * Tüm BIST bankaları için Kademe 2 değerlendirmesini (gelir kalitesi + marj proxy +
 * risk maliyeti + peer + reel ROE) hesaplayıp ai_cache'e yazar (`bank-health:BIST`).
 * /api/firsatlar ve /api/bank-health tek satır okur → istek anında İş Yatırım YOK.
 *
 * GET /api/cron/bank-health
 *  - Vercel Cron: x-vercel-cron header
 *  - Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * sector-medians (Pzt 10:00 TRT) SONRASINA zamanlanır — peer karşılaştırması onu okur.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bistGuard } from '@/lib/bist-guard';
import { fetchTurkeyInflation } from '@/lib/turkey-macro';
import { getStoredSectorMedians } from '@/lib/sector-medians';
import { runBankHealth, storeBankHealth } from '@/lib/bank-health-runner';
import { isBankSector } from '@/lib/bank-health';
import { getSectorId } from '@/lib/sectors';
import { BIST_SYMBOLS } from '@/types';

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
  if (!isVercelCron && !isManualAuth && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const guard = bistGuard();
  if (guard) return guard;

  const startedAt = Date.now();
  const sb = createAdminClient();

  const banks = (BIST_SYMBOLS as readonly string[]).filter((s) => isBankSector(getSectorId(s)));
  if (banks.length === 0) {
    return NextResponse.json({ ok: true, message: 'Banka sembolü yok', ok_count: 0 });
  }

  const [inflation, medians] = await Promise.all([
    fetchTurkeyInflation().catch(() => null),
    getStoredSectorMedians(sb).catch(() => null),
  ]);

  const result = await runBankHealth(banks, {
    inflationYoy: inflation?.value ?? null,
    medians,
  });

  await storeBankHealth(sb, result.map);

  const durationMs = Date.now() - startedAt;
  console.log(
    `[cron/bank-health] ${result.ok}/${banks.length} banka (${result.tier2} Kademe 2), ${result.skipped} atlandı, ${durationMs}ms`,
  );

  return NextResponse.json({
    ok: true,
    banks: banks.length,
    scored: result.ok,
    tier2: result.tier2,
    skipped: result.skipped,
    inflationYoy: inflation?.value ?? null,
    durationMs,
  });
}
