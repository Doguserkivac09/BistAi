/**
 * Fon precompute cron (FON-ANALIZ-PLAN F7 + FON-BACKFILL-PLAN FAZ 2).
 *
 * GET /api/cron/fund-scan?universe=TEFAS|BES&target=250
 *
 * ARTIMLI: eksik tarih = hedef − (tamamlanmış tarihler). Elde olan gün
 * **tekrar istenmez**. Bu yüzden tek kod yolu iki işi birden görür:
 *   - günlük koşu → eksik 1-2 gün, saniyeler içinde biter
 *   - backfill koşusu → süre bütçesini doldurur, `remaining` ile ilerleme bildirir
 * `remaining > 0` olduğu sürece tekrar çağır (idempotent, tekrar zararsız).
 *
 * Fon fiyatları akşam yayımlanır → gece/sabah koşusu.
 *
 * ⚠️ NAZİK OL: TEFAS 429 veriyor. `fund-data` 2,2 sn aralık + üstel geri çekilme
 * uyguluyor; runner SÜRE bütçesine göre kendini keser (timeout'ta yazmadan ölmez).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchPolicyRate, fetchTurkeyInflation } from '@/lib/turkey-macro';
import { runFundScan, DEFAULT_TARGET_DAYS } from '@/lib/fund-runner';
import type { FundUniverse } from '@/lib/fund-universe';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Yanıtı yazmaya yetecek pay bırak — runner bunun içinde kendini keser. */
const BUDGET_MS = 270_000;

const CRON_SECRET = process.env.CRON_SECRET;

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET) && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  // Fon fiyatları TEFAS takvimine bağlı; BIST tatil guard'ı burada UYGULANMAZ
  // (fon fiyatı borsa kapalıyken de yayımlanabiliyor). Boş gün zaten atlanır.
  const universe = (request.nextUrl.searchParams.get('universe') ?? 'TEFAS') as FundUniverse;
  if (universe !== 'TEFAS' && universe !== 'BES') {
    return NextResponse.json({ error: 'universe TEFAS veya BES olmalı' }, { status: 400 });
  }
  const targetDays = Math.max(
    5,
    Math.min(1300, Number(request.nextUrl.searchParams.get('target') ?? DEFAULT_TARGET_DAYS)),
  );

  const startedAt = Date.now();
  const sb = createAdmin();
  const [pr, inf] = await Promise.all([
    fetchPolicyRate().catch(() => null),
    fetchTurkeyInflation().catch(() => null),
  ]);

  try {
    const res = await runFundScan(sb, universe, {
      targetDays,
      budgetMs: BUDGET_MS,
      policyRate: pr?.value ?? null,
      inflation: inf?.value ?? null,
    });
    const durationMs = Date.now() - startedAt;
    console.log(
      `[cron/fund-scan] ${universe}: ${res.scored} fon skorlandı, ${res.skipped} atlandı, ` +
      `+${res.backfill.fetched} gün (kalan ${res.backfill.remaining}), ` +
      `kapsama ${res.coverage.completeDays}/${targetDays}, ${durationMs}ms`,
    );
    return NextResponse.json({
      ok: true,
      universe,
      targetDays,
      scored: res.scored,
      skipped: res.skipped,
      fetched: res.backfill.fetched,
      failedDays: res.backfill.failed,
      remaining: res.backfill.remaining,
      budgetExhausted: res.backfill.budgetExhausted,
      categoryRefreshed: res.categoryRefreshed,
      coverage: res.coverage,
      policyRate: pr?.value ?? null,
      inflation: inf?.value ?? null,
      durationMs,
      nextHint: res.backfill.remaining > 0
        ? `Geçmiş henüz tam değil — aynı ucu tekrar çağır (kalan ${res.backfill.remaining} gün).`
        : 'Hedef derinlik tamam.',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
