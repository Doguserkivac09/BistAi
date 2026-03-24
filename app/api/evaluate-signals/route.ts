import { NextRequest, NextResponse } from 'next/server';
import { runEvaluateEngine } from '@/lib/evaluate-engine';

/**
 * Manuel sinyal değerlendirme endpoint.
 * POST /api/evaluate-signals
 * Header: x-internal-token: <INTERNAL_EVAL_TOKEN>  (opsiyonel — dev modunda gerekmez)
 */

const INTERNAL_TOKEN = process.env.INTERNAL_EVAL_TOKEN;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const headerToken = request.headers.get('x-internal-token');
  const isAuthed = !INTERNAL_TOKEN || headerToken === INTERNAL_TOKEN;

  if (!isAuthed && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz istek.' }, { status: 401 });
  }

  const result = await runEvaluateEngine();

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ updated: result.updated });
}
