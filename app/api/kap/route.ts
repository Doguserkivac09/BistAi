/**
 * GET /api/kap          → Son KAP duyuruları (limit=50)
 * GET /api/kap?sembol=X → Şirkete özel KAP duyuruları
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { fetchKapDuyurular, fetchKapBySembol } from '@/lib/kap';

export const revalidate = 900; // 15 dakika Next.js route cache

export async function GET(request: NextRequest) {
  // Rate limit: 30 istek/dakika per IP
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`${ip}:kap`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek.', duyurular: [] },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }
  const sembol = request.nextUrl.searchParams.get('sembol')?.trim().toUpperCase();

  try {
    const duyurular = sembol
      ? await fetchKapBySembol(sembol, 30)
      : await fetchKapDuyurular(60);

    return NextResponse.json(
      { duyurular, ts: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message, duyurular: [] }, { status: 500 });
  }
}
