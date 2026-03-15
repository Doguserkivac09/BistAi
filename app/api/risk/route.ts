import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getRiskScore } from '@/lib/macro-service';

/**
 * Risk Score API.
 *
 * GET /api/risk
 *   → Güncel piyasa risk skoru (0-100) + bileşenler + öneri
 *
 * Rate limit: 30 req/min per IP
 *
 * Phase 5.4
 */

const MAX_REQUESTS = 30;
const WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`${ip}:risk`, MAX_REQUESTS, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  try {
    const riskResult = await getRiskScore();
    return NextResponse.json(riskResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[api/risk] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
