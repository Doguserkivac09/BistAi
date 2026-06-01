export const dynamic = 'force-dynamic';
/**
 * GET /api/ai-portfolio
 * Canlı fiyat çekme + gerçek zamanlı portföy değeri
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { INITIAL_CAPITAL } from '@/lib/ai-portfolio-engine';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const admin = createAdmin();

  const [
    { data: positions },
    { data: history },
    { data: decisions },
  ] = await Promise.all([
    admin.from('ai_portfolio_positions').select('*').eq('is_open', true).order('entry_time', { ascending: false }),
    admin.from('ai_portfolio_history').select('*').order('year', { ascending: false }).order('week_number', { ascending: false }).limit(12),
    admin.from('ai_portfolio_decisions').select('*').order('year', { ascending: false }).order('week_number', { ascending: false }).limit(50),
  ]);

  // ── Canlı fiyat: scan_cache'den ────────────────────────────────────
  const symbols = (positions ?? []).map((p) => p.sembol);
  const { data: scanPrices } = symbols.length > 0
    ? await admin
        .from('scan_cache')
        .select('sembol, last_close, confluence_score, change_percent')
        .in('sembol', symbols)
    : { data: [] };

  const priceMap = new Map((scanPrices ?? []).map((r) => [r.sembol, r]));

  // Pozisyonlara canlı fiyat + gerçek P&L ekle
  const enrichedPositions = (positions ?? []).map((pos) => {
    const scan = priceMap.get(pos.sembol);
    const currentPrice = scan?.last_close ?? pos.current_price ?? pos.entry_price;
    const liveReturn   = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
    const livePnl      = (currentPrice - pos.entry_price) * pos.shares;
    // Stop'a mesafe %
    const stopDistance = pos.stop_loss
      ? ((currentPrice - pos.stop_loss) / currentPrice) * 100
      : null;
    // Trailing'e mesafe %
    const trailDistance = pos.trailing_stop
      ? ((currentPrice - pos.trailing_stop) / currentPrice) * 100
      : null;
    return {
      ...pos,
      current_price:    currentPrice,
      live_return_pct:  parseFloat(liveReturn.toFixed(2)),
      live_pnl:         parseFloat(livePnl.toFixed(2)),
      stop_distance_pct:   stopDistance ? parseFloat(stopDistance.toFixed(2)) : null,
      trail_distance_pct:  trailDistance ? parseFloat(trailDistance.toFixed(2)) : null,
      scan_confluence:  scan?.confluence_score ?? null,
      change_today:     scan?.change_percent   ?? null,
    };
  });

  // ── Gerçek zamanlı portföy değeri ──────────────────────────────────
  const latest    = history?.[0];
  const cash      = latest?.cash ?? INITIAL_CAPITAL;
  const livePositionsValue = enrichedPositions.reduce(
    (sum, p) => sum + (p.current_price ?? p.entry_price) * p.shares, 0
  );
  const liveTotalValue  = cash + livePositionsValue;
  const totalReturn     = ((liveTotalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  const weeklyReturn    = latest?.weekly_return ?? 0;
  const bist_return     = latest?.bist_return ?? 0;
  const maxDrawdown     = (history ?? []).reduce((m, h) => Math.min(m, h.max_drawdown ?? 0), 0);

  // En büyük pozisyon riski: stop'a en yakın olan
  const riskiestPos = enrichedPositions
    .filter((p) => p.stop_distance_pct != null)
    .sort((a, b) => (a.stop_distance_pct ?? 99) - (b.stop_distance_pct ?? 99))[0];

  return NextResponse.json(
    {
      ok: true,
      summary: {
        totalValue:      parseFloat(liveTotalValue.toFixed(2)),
        cash,
        positionsValue:  parseFloat(livePositionsValue.toFixed(2)),
        totalReturn:     parseFloat(totalReturn.toFixed(2)),
        initialCapital:  INITIAL_CAPITAL,
        maxDrawdown,
        positionCount:   enrichedPositions.length,
        weeklyReturn,
        alpha:           weeklyReturn - bist_return,
        // Risk özeti
        riskAlert:       riskiestPos?.stop_distance_pct != null && riskiestPos.stop_distance_pct < 3
          ? `${riskiestPos.sembol} stop'a çok yakın (-%${riskiestPos.stop_distance_pct.toFixed(1)})`
          : null,
        lastPriceUpdate: scanPrices && scanPrices.length > 0 ? 'scan_cache' : 'snapshot',
      },
      positions:  enrichedPositions,
      history:    (history ?? []).reverse(),
      decisions:  decisions ?? [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}
