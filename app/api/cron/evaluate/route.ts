import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron endpoint: Sinyal performans değerlendirmesi tetikler.
 * Vercel Cron veya harici scheduler tarafından çağrılır.
 *
 * GET /api/cron/evaluate
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * İç olarak /api/evaluate-signals POST endpoint'ini çağırır.
 */

const CRON_SECRET = process.env.CRON_SECRET;
const INTERNAL_EVAL_TOKEN = process.env.INTERNAL_EVAL_TOKEN;

export async function GET(request: NextRequest) {
  // Cron secret doğrulama
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!CRON_SECRET || !token || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  if (!INTERNAL_EVAL_TOKEN) {
    return NextResponse.json(
      { error: 'INTERNAL_EVAL_TOKEN tanımlı değil.' },
      { status: 500 }
    );
  }

  try {
    // evaluate-signals endpoint'ini internal olarak çağır
    const baseUrl = request.nextUrl.origin;
    const res = await fetch(`${baseUrl}/api/evaluate-signals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': INTERNAL_EVAL_TOKEN,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? 'Değerlendirme başarısız.' },
        { status: res.status }
      );
    }

    return NextResponse.json({
      ok: true,
      updated: data.updated ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[cron/evaluate] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
