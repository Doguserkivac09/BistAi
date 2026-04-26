import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getMacroFull, formatMacroResponse } from '@/lib/macro-service';

/**
 * Makro veri API endpoint.
 *
 * GET /api/macro
 *   → Güncel makro skor + tüm göstergeler
 *
 * GET /api/macro?history=true
 *   → Tarihsel makro snapshot'lar (DB'den)
 *
 * Rate limit: 30 req/min per IP
 *
 * Phase 4.6
 */

// Rate limit: 30 istek/dakika
const MAX_REQUESTS = 30;
const WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  // Rate limit
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`${ip}:macro`, MAX_REQUESTS, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen bekleyin.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) },
      }
    );
  }

  const { searchParams } = request.nextUrl;
  const wantHistory = searchParams.get('history') === 'true';

  // Tarihsel veri istendi → DB'den çek
  if (wantHistory) {
    return handleHistoryRequest(request);
  }

  // Güncel makro skor
  return handleCurrentRequest();
}

async function handleCurrentRequest(): Promise<NextResponse> {
  try {
    const full = await getMacroFull();
    return NextResponse.json(formatMacroResponse(full));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[api/macro] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleHistoryRequest(request: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase config eksik.' }, { status: 500 });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { searchParams } = request.nextUrl;
    const days = parseInt(searchParams.get('days') ?? '30', 10);
    const limit = Math.min(Math.max(days, 7), 365);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - limit);

    const { data, error } = await supabase
      .from('macro_snapshots')
      .select(
        'snapshot_date, macro_score, wind, vix, dxy, us10y, usdtry, ' +
        'eem, brent, gold, silver, copper, bist100, ' +
        'cds_5y, policy_rate, inflation, tr_10y, fed_funds_rate'
      )
      .gte('snapshot_date', cutoff.toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      history: data ?? [],
      period: `${limit} gün`,
      count: data?.length ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[api/macro/history] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
