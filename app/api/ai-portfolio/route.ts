/**
 * AI Portföy Public API
 * GET /api/ai-portfolio
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

  const latest = history?.[0];
  const totalValue  = latest?.total_value  ?? INITIAL_CAPITAL;
  const totalReturn = latest?.total_return ?? 0;
  const maxDrawdown = history?.reduce((m, h) => Math.min(m, h.max_drawdown ?? 0), 0) ?? 0;

  // Win rate — kapanmış kararlardan
  const closedDecisions = (decisions ?? []).filter((d) => d.action === 'SELL' || d.action === 'PARTIAL_SELL');

  return NextResponse.json(
    {
      ok: true,
      summary: {
        totalValue,
        cash: latest?.cash ?? INITIAL_CAPITAL,
        positionsValue: latest?.positions_value ?? 0,
        totalReturn,
        initialCapital: INITIAL_CAPITAL,
        maxDrawdown,
        positionCount: positions?.length ?? 0,
        weeklyReturn: latest?.weekly_return ?? 0,
        alpha: (latest?.weekly_return ?? 0) - (latest?.bist_return ?? 0),
      },
      positions: positions ?? [],
      history: (history ?? []).reverse(), // kronolojik sıra UI için
      decisions: decisions ?? [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}
