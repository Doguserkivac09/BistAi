/**
 * Veri arşivi cron'u — kendi point-in-time kaydımız (GİZLİ, ürün yüzeyinde yok).
 *
 * GET /api/cron/veri-arsivi                 → tüm evren (ölçüldü: 617 sembol / ~156 sn)
 * GET /api/cron/veri-arsivi?part=1|2|3      → elle bölmek gerekirse dilim
 * GET /api/cron/veri-arsivi?dryRun=1        → hesapla, YAZMA
 * GET /api/cron/veri-arsivi?symbols=GARAN,ASELS&dryRun=1 → alt evrenle hızlı test
 *
 * Bütçe dolunca durur ve `kalan` döndürür (scan-cache timeout dersi). Semboller
 * BAYATLIĞA göre sıralandığı için kesilen koşu bir sonrakinde telafi edilir —
 * hiçbir sembol kalıcı olarak atlanmaz.
 *
 * Gerekçe ve tasarım: lib/veri-arsivi.ts · tablo: 20260912_veri_arsivi.sql
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { BIST_SYMBOLS } from '@/types/index';
import { runVeriArsivi, type ArsivKaynak } from '@/lib/veri-arsivi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const PARCA_SAYISI = 3;

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

  const q = request.nextUrl.searchParams;
  const dryRun = q.get('dryRun') === '1';
  const acik = q.get('symbols')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const partRaw = Number(q.get('part'));
  const part = Number.isInteger(partRaw) && partRaw >= 1 && partRaw <= PARCA_SAYISI ? partRaw : null;
  const kaynaklar = q.get('kaynak')?.split(',').filter((k): k is ArsivKaynak => k === 'isyatirim-mali' || k === 'yahoo-temel');

  const tumu = (BIST_SYMBOLS as readonly string[]).map((s) => s.replace('.IS', '').toUpperCase());
  let symbols = acik ?? tumu;
  if (!acik && part) {
    const dilim = Math.ceil(tumu.length / PARCA_SAYISI);
    symbols = tumu.slice((part - 1) * dilim, part * dilim);
  }

  try {
    const res = await runVeriArsivi(createAdmin(), { symbols, budgetMs: 240_000, dryRun, kaynaklar });
    console.log(
      `[cron/veri-arsivi] part=${part ?? '-'} ${res.sembol}/${symbols.length} sembol · ` +
      `${res.yeni} YENİ (revizyon) · ${res.degismeyen} değişmeyen · ${res.atlanan} atlandı · ` +
      `${res.hata} hata · kalan ${res.kalan} · ${res.sureMs}ms${dryRun ? ' · DRY RUN' : ''}`,
    );
    return NextResponse.json({ part, evren: symbols.length, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
