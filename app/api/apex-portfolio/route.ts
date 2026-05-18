/**
 * GET /api/apex-portfolio
 * Canlı fiyat çekme + gerçek zamanlı portföy değeri
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { APEX_INITIAL_CAPITAL } from '@/lib/apex-engine';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const db = admin();

  const [
    { data: positions },
    { data: history },
    { data: decisions },
  ] = await Promise.all([
    db.from('apex_portfolio_positions').select('*').eq('is_open', true).order('entry_date', { ascending: false }),
    db.from('apex_portfolio_history').select('*').order('snapshot_date', { ascending: false }).limit(30),
    db.from('apex_portfolio_decisions').select('*').order('decision_date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
  ]);

  // ── Canlı fiyat: scan_cache'den ────────────────────────────────────
  const symbols = (positions ?? []).map((p) => p.sembol);
  const { data: scanPrices } = symbols.length > 0
    ? await db
        .from('scan_cache')
        .select('sembol, last_close, confluence_score, change_percent, rel_vol5')
        .in('sembol', symbols)
    : { data: [] };

  const priceMap = new Map((scanPrices ?? []).map((r) => [r.sembol, r]));

  // Pozisyonlara canlı fiyat + P&L ekle
  const enrichedPositions = (positions ?? []).map((pos) => {
    const scan = priceMap.get(pos.sembol);
    const currentPrice   = scan?.last_close ?? pos.current_price ?? pos.entry_price;
    const liveReturn     = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
    const livePnl        = (currentPrice - pos.entry_price) * pos.shares;
    const stopDistance   = pos.stop_loss
      ? ((currentPrice - pos.stop_loss) / currentPrice) * 100 : null;
    const trailDistance  = pos.trailing_stop
      ? ((currentPrice - pos.trailing_stop) / currentPrice) * 100 : null;
    // Sinyal hâlâ güçlü mü?
    const signalStrength = scan?.confluence_score
      ? (scan.confluence_score >= 75 ? 'güçlü' : scan.confluence_score >= 55 ? 'zayıflıyor' : 'zayıf')
      : 'bilinmiyor';
    return {
      ...pos,
      current_price:      currentPrice,
      live_return_pct:    parseFloat(liveReturn.toFixed(2)),
      live_pnl:           parseFloat(livePnl.toFixed(2)),
      stop_distance_pct:  stopDistance  ? parseFloat(stopDistance.toFixed(2))  : null,
      trail_distance_pct: trailDistance ? parseFloat(trailDistance.toFixed(2)) : null,
      scan_confluence:    scan?.confluence_score ?? null,
      scan_rel_vol5:      scan?.rel_vol5        ?? null,
      change_today:       scan?.change_percent   ?? null,
      signal_strength:    signalStrength,
    };
  });

  // ── Gerçek zamanlı portföy değeri ──────────────────────────────────
  const latest   = history?.[0];
  const cash     = latest?.cash ?? APEX_INITIAL_CAPITAL;
  const livePositionsValue = enrichedPositions.reduce(
    (sum, p) => sum + (p.current_price ?? p.entry_price) * p.shares, 0
  );
  const liveTotalValue = cash + livePositionsValue;
  const totalReturn    = ((liveTotalValue - APEX_INITIAL_CAPITAL) / APEX_INITIAL_CAPITAL) * 100;
  const maxDD          = (history ?? []).reduce((m, h) => Math.min(m, h.max_drawdown ?? 0), 0);

  // Win rate (kapatılan işlemler)
  const closed     = (decisions ?? []).filter((d) => d.action === 'SELL' || d.action === 'ROTATE_OUT');
  const evaluated  = closed.filter((d) => d.outcome_return != null);
  const wins       = evaluated.filter((d) => (d.outcome_return ?? 0) > 0);
  const winRate    = evaluated.length > 0 ? (wins.length / evaluated.length) * 100 : null;
  const totalTrades = (decisions ?? []).filter((d) => d.action === 'BUY').length;
  const closedWithReturn = closed.filter((d) => d.outcome_return != null);
  const bestTrade  = closedWithReturn.length > 0 ? Math.max(...closedWithReturn.map((d) => d.outcome_return!)) : null;
  const worstTrade = closedWithReturn.length > 0 ? Math.min(...closedWithReturn.map((d) => d.outcome_return!)) : null;

  // Risk uyarısı: stop'a yakın pozisyon
  const dangerPos = enrichedPositions
    .filter((p) => p.stop_distance_pct != null && p.stop_distance_pct < 2.5)
    .sort((a, b) => (a.stop_distance_pct ?? 99) - (b.stop_distance_pct ?? 99))[0];

  // Zayıflayan sinyal uyarısı
  const weakSignals = enrichedPositions.filter((p) => p.signal_strength === 'zayıf').map((p) => p.sembol);

  return NextResponse.json(
    {
      ok: true,
      summary: {
        totalValue:      parseFloat(liveTotalValue.toFixed(2)),
        cash,
        positionsValue:  parseFloat(livePositionsValue.toFixed(2)),
        totalReturn:     parseFloat(totalReturn.toFixed(2)),
        initialCapital:  APEX_INITIAL_CAPITAL,
        maxDrawdown:     maxDD,
        positionCount:   enrichedPositions.length,
        dailyReturn:     latest?.daily_return ?? 0,
        winRate,
        winRate30d:      latest?.win_rate_30d ?? null,
        totalTrades,
        bestTrade,
        worstTrade,
        // Risk uyarıları
        stopAlert:   dangerPos ? `${dangerPos.sembol} stop'a -%${dangerPos.stop_distance_pct?.toFixed(1)} uzakta` : null,
        weakSignals: weakSignals.length > 0 ? weakSignals : null,
        lastPriceUpdate: scanPrices && scanPrices.length > 0 ? 'scan_cache' : 'snapshot',
      },
      positions:  enrichedPositions,
      history:    (history ?? []).reverse(),
      decisions:  decisions ?? [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}
