/**
 * Kâr Kalitesi precompute cron (Bilanço B1 → Fırsatlar risk uyarısı).
 * GET /api/cron/earnings-quality?part=1|2
 *
 * Likit BIST evreni (scan_cache, ADV filtresi) için İş Yatırım kâr-kalitesini
 * hesaplar, konsolide ai_cache map'ine MERGE eder. Firsatlar tek okur.
 * Haftalık (mali tablolar çeyreklik değişir). İş Yatırım fan-out ağır → ?part böler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runEarningsQuality, storeEarningsFlags } from '@/lib/earnings-quality-runner';
import { fetchTurkeyInflation } from '@/lib/turkey-macro';
import { bistGuard } from '@/lib/bist-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const MIN_ADV_TL = 5_000_000; // illikit mikro-cap'te bilanço analizi gürültü

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET)) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }
  const guard = bistGuard();
  if (guard) return guard;

  const part = request.nextUrl.searchParams.get('part'); // '1' | '2' | null(hepsi)
  const startedAt = Date.now();

  try {
    const sb = admin();
    // Likit evren
    const { data } = await sb.from('scan_cache').select('sembol,last_close,last_volume').eq('market', 'BIST').limit(1000);
    let syms = (data ?? [])
      .filter((r) => r.sembol && (r.last_close ?? 0) * (r.last_volume ?? 0) >= MIN_ADV_TL)
      .map((r) => r.sembol as string)
      .sort();
    if (part === '1') syms = syms.filter((_, i) => i % 2 === 0);
    else if (part === '2') syms = syms.filter((_, i) => i % 2 === 1);

    let inflationRate: number | undefined;
    try { const infl = await fetchTurkeyInflation(); if (infl?.value) inflationRate = infl.value / 100; } catch { /* opsiyonel */ }

    const { map, ok, skipped } = await runEarningsQuality(syms, { inflationRate, concurrency: 4 });
    await storeEarningsFlags(sb, map);

    const durationMs = Date.now() - startedAt;
    const burden = Object.values(map).filter((e) => e.financeBurden).length;
    console.log(`[earnings-quality] part=${part ?? 'all'} ${ok} ok, ${skipped} atlandı, ${burden} finansman-yükü, ${durationMs}ms`);
    return NextResponse.json({ ok: true, part: part ?? 'all', scanned: syms.length, computed: ok, skipped, financeBurden: burden, durationMs });
  } catch (error) {
    console.error('[earnings-quality] Hata:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
