/**
 * Fon precompute cron (FON-ANALIZ-PLAN F7).
 *
 * GET /api/cron/fund-scan?universe=TEFAS|BES&days=N
 *  - Varsayılan `days=1`: yalnız son iş günü çekilir (~5 istek, ~15 sn) ve
 *    kayan ham pencereye eklenir → metrikler yeniden hesaplanır.
 *  - İlk doldurma için elle **`?days=5`** birkaç kez çağrılır (pencere merge'lenir,
 *    tekrar zararsız). `days` büyük verilmemeli: her koşu AYRICA kategori haritası için
 *    12 kategori × ≤4 sayfa çeker; `days=20` ölçülerek 300 sn'yi AŞTI.
 *
 * Fon fiyatları akşam yayımlanır → gece/sabah koşusu.
 *
 * ⚠️ NAZİK OL: TEFAS 429 veriyor. `fund-data` 2,2 sn aralık + üstel geri çekilme
 * uyguluyor; bu yüzden `days` büyüdükçe süre lineer artar (maxDuration'a dikkat).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchPolicyRate, fetchTurkeyInflation } from '@/lib/turkey-macro';
import { runFundScan } from '@/lib/fund-runner';
import type { FundUniverse } from '@/lib/fund-universe';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  const days = Math.max(1, Math.min(25, Number(request.nextUrl.searchParams.get('days') ?? 1)));

  const startedAt = Date.now();
  const sb = createAdmin();
  const [pr, inf] = await Promise.all([
    fetchPolicyRate().catch(() => null),
    fetchTurkeyInflation().catch(() => null),
  ]);

  try {
    const res = await runFundScan(sb, universe, {
      days,
      policyRate: pr?.value ?? null,
      inflation: inf?.value ?? null,
    });
    const durationMs = Date.now() - startedAt;
    console.log(
      `[cron/fund-scan] ${universe}: ${res.scored} fon skorlandı, ${res.skipped} atlandı, ${res.fetchedDays}/${days} gün, ${durationMs}ms`,
    );
    return NextResponse.json({
      ok: true,
      universe,
      days,
      fetchedDays: res.fetchedDays,
      scored: res.scored,
      skipped: res.skipped,
      policyRate: pr?.value ?? null,
      inflation: inf?.value ?? null,
      durationMs,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
