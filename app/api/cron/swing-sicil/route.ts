/**
 * Swing kurulumu ileriye dönük sicil cron'u (GİZLİ — ürün yüzeyinde yok).
 *
 * GET /api/cron/swing-sicil            → kaydet
 * GET /api/cron/swing-sicil?dryRun=1   → hesapla, YAZMA (migration öncesi test için)
 * GET /api/cron/swing-sicil?symbols=AAPL,NVDA&dryRun=1 → alt evrenle hızlı test
 *
 * Schedule: 22:30 UTC Pzt-Cum — ABD kapanışından sonra (yaz 20:00, kış 21:00 UTC).
 * Kural ve gerekçe: lib/swing-setup.ts · çalıştırıcı: lib/swing-sicil-runner.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { usMarketGuard } from '@/lib/us-market-guard';
import { runSwingSicil } from '@/lib/swing-sicil-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET) && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const guard = usMarketGuard();
  if (guard) return guard;

  const q = request.nextUrl.searchParams;
  const dryRun = q.get('dryRun') === '1';
  const symbols = q.get('symbols')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  try {
    const res = await runSwingSicil(createAdmin(), { dryRun, symbols, budgetMs: 240_000 });
    console.log(`[cron/swing-sicil] ${res.fetched} sembol · ${res.updated} güncellendi (${res.closedNow} kapandı) · ${res.newSignals.length} sinyal · ${res.newControls} kontrol · ${res.durationMs}ms${dryRun ? ' · DRY RUN' : ''}`);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
