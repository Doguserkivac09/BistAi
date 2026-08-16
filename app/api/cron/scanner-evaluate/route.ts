/**
 * Cron: Tarayıcı sinyallerinin sonucunu ölçer.
 * GET /api/cron/scanner-evaluate
 *
 * `scanner_signals` tablosundaki değerlendirilmemiş sinyalleri alır, sinyal
 * barından SONRAKİ mumlarla çift bariyer testi uygular (hedef mi stop mu önce)
 * ve sonuç kolonlarını doldurur. Sonrasında /api/scanner-stats sıralama üretir.
 *
 * Yetkilendirme (ikisi de kabul edilir):
 *   1. Vercel Cron otomatik header: x-vercel-cron: 1
 *   2. Manuel çağrı: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScannerEvaluate } from '@/lib/scanner-evaluate';

// Sembol başına Yahoo fetch + gecikme — varsayılan 15s yetmez.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const CRON_SECRET = process.env.CRON_SECRET;
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '');
  const isManualAuth = CRON_SECRET && authToken === CRON_SECRET;

  if (!isVercelCron && !isManualAuth) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
    }
  }

  const result = await runScannerEvaluate();

  if (result.error) {
    console.error('[cron/scanner-evaluate] Hata:', result.error);
    return NextResponse.json({ ok: false, ...result }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, ...result },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
