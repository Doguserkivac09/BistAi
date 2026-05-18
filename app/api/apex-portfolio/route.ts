/**
 * GET /api/apex-portfolio
 * APEX portföy özeti, pozisyonlar, kararlar, performans
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

  const latest     = history?.[0];
  const totalValue = latest?.total_value  ?? APEX_INITIAL_CAPITAL;
  const totalReturn = latest?.total_return ?? 0;
  const maxDD      = (history ?? []).reduce((m, h) => Math.min(m, h.max_drawdown ?? 0), 0);

  // 30 günlük win rate (kapatılan işlemler)
  const closed = (decisions ?? []).filter((d) => d.action === 'SELL' || d.action === 'ROTATE_OUT');
  const evaluated = closed.filter((d) => d.outcome_return != null);
  const wins = evaluated.filter((d) => (d.outcome_return ?? 0) > 0);
  const winRate = evaluated.length > 0 ? (wins.length / evaluated.length) * 100 : null;

  // Toplam işlem sayısı (BUY'lar)
  const totalTrades = (decisions ?? []).filter((d) => d.action === 'BUY').length;

  // En iyi ve en kötü kapatılan işlem
  const closedWithReturn = closed.filter((d) => d.outcome_return != null);
  const bestTrade  = closedWithReturn.length > 0 ? Math.max(...closedWithReturn.map((d) => d.outcome_return!)) : null;
  const worstTrade = closedWithReturn.length > 0 ? Math.min(...closedWithReturn.map((d) => d.outcome_return!)) : null;

  return NextResponse.json(
    {
      ok: true,
      summary: {
        totalValue,
        cash:            latest?.cash             ?? APEX_INITIAL_CAPITAL,
        positionsValue:  latest?.positions_value  ?? 0,
        totalReturn,
        initialCapital:  APEX_INITIAL_CAPITAL,
        maxDrawdown:     maxDD,
        positionCount:   positions?.length ?? 0,
        dailyReturn:     latest?.daily_return     ?? 0,
        winRate,
        winRate30d:      latest?.win_rate_30d      ?? null,
        totalTrades,
        bestTrade,
        worstTrade,
      },
      positions: positions ?? [],
      history: (history ?? []).reverse(),
      decisions: decisions ?? [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}
