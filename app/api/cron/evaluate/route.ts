import { NextRequest, NextResponse } from 'next/server';
import { runEvaluateEngine } from '@/lib/evaluate-engine';

/**
 * Cron endpoint: Sinyal performans değerlendirmesi.
 * GET /api/cron/evaluate
 *
 * Yetkilendirme (ikisi de kabul edilir):
 *   1. Vercel Cron otomatik header: x-vercel-cron: 1
 *   2. Manuel çağrı: Authorization: Bearer <CRON_SECRET>
 *
 * CRON_SECRET env var tanımlı değilse sadece Vercel Cron header'ı çalışır.
 */

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const CRON_SECRET = process.env.CRON_SECRET;
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '');
  const isManualAuth = CRON_SECRET && authToken === CRON_SECRET;

  if (!isVercelCron && !isManualAuth) {
    // Dev modunda auth'suz çalışmaya izin ver
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
    }
  }

  const result = await runEvaluateEngine();

  if (result.error) {
    console.error('[cron/evaluate] Hata:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    updated: result.updated,
    timestamp: new Date().toISOString(),
  });
}
