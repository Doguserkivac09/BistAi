export const dynamic = 'force-dynamic';
/**
 * GET /api/apex-us-portfolio
 * APEX-US: canlı fiyat çekme + gerçek zamanlı portföy değeri
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { APEX_US_INITIAL_CAPITAL } from '@/lib/apex-us-engine';
import { fetchQuoteUS } from '@/lib/yahoo-us';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const db = admin();

  const [{ data: positions }, { data: history }, { data: decisions }] = await Promise.all([
    db.from('apex_us_positions').select('*').eq('is_open', true).order('entry_date', { ascending: false }),
    db.from('apex_us_history').select('*').order('snapshot_date', { ascending: false }).limit(30),
    db.from('apex_us_decisions').select('*').order('decision_date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
  ]);

  // Canlı fiyat: önce scan_cache (market='US'), fallback Yahoo
  const symbols    = (positions ?? []).map((p) => p.sembol as string);
  const priceMap   = new Map<string, { price: number; changePercent: number | null; confluence: number | null; relVol5: number | null; rsi: number | null }>();

  if (symbols.length > 0) {
    const { data: scanPrices } = await db
      .from('scan_cache')
      .select('sembol, last_close, confluence_score, change_percent, rel_vol5, rsi')
      .eq('market', 'US')
      .in('sembol', symbols);

    for (const r of scanPrices ?? []) {
      if (r.last_close) {
        priceMap.set(r.sembol, {
          price:       r.last_close,
          changePercent: r.change_percent ?? null,
          confluence:  r.confluence_score ?? null,
          relVol5:     r.rel_vol5 ?? null,
          rsi:         r.rsi ?? null,
        });
      }
    }

    // Fallback: scan_cache'de yoksa Yahoo'dan çek
    const missing = symbols.filter((s) => !priceMap.has(s));
    if (missing.length > 0) {
      await Promise.allSettled(missing.map(async (s) => {
        const q = await fetchQuoteUS(s);
        if (q?.regularMarketPrice) {
          priceMap.set(s, {
            price:        q.regularMarketPrice,
            changePercent: q.regularMarketChangePercent ?? null,
            confluence: null, relVol5: null, rsi: null,
          });
        }
      }));
    }
  }

  // Pozisyonlara canlı veri ekle
  const enrichedPositions = (positions ?? []).map((pos) => {
    const scan        = priceMap.get(pos.sembol);
    const currentPrice = scan?.price ?? pos.current_price ?? pos.entry_price;
    const liveReturn  = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
    const livePnl     = (currentPrice - pos.entry_price) * pos.shares;
    const stopDist    = pos.stop_loss ? ((currentPrice - pos.stop_loss) / currentPrice) * 100 : null;
    const trailDist   = pos.trailing_stop ? ((currentPrice - pos.trailing_stop) / currentPrice) * 100 : null;
    const signalStrength = scan?.confluence
      ? (scan.confluence >= 75 ? 'güçlü' : scan.confluence >= 55 ? 'zayıflıyor' : 'zayıf')
      : 'bilinmiyor';
    return {
      ...pos,
      current_price:      currentPrice,
      live_return_pct:    parseFloat(liveReturn.toFixed(2)),
      live_pnl:           parseFloat(livePnl.toFixed(2)),
      stop_distance_pct:  stopDist  ? parseFloat(stopDist.toFixed(2))  : null,
      trail_distance_pct: trailDist ? parseFloat(trailDist.toFixed(2)) : null,
      scan_confluence:    scan?.confluence   ?? null,
      scan_rel_vol5:      scan?.relVol5      ?? null,
      scan_rsi:           scan?.rsi          ?? null,
      change_today:       scan?.changePercent ?? null,
      signal_strength:    signalStrength,
    };
  });

  // Gerçek zamanlı değer
  const latest      = history?.[0];
  const cash        = latest?.cash ?? APEX_US_INITIAL_CAPITAL;
  const livePosValue = enrichedPositions.reduce(
    (sum, p) => sum + (p.current_price ?? p.entry_price) * p.shares, 0
  );
  const liveTotalValue = cash + livePosValue;
  const totalReturn    = ((liveTotalValue - APEX_US_INITIAL_CAPITAL) / APEX_US_INITIAL_CAPITAL) * 100;
  const maxDD          = (history ?? []).reduce((m, h) => Math.min(m, h.max_drawdown ?? 0), 0);

  const closed    = (decisions ?? []).filter((d) => d.action === 'SELL' || d.action === 'ROTATE_OUT');
  const evaluated = closed.filter((d) => d.outcome_return != null);
  const wins      = evaluated.filter((d) => (d.outcome_return ?? 0) > 0);
  const winRate   = evaluated.length > 0 ? (wins.length / evaluated.length) * 100 : null;
  const totalTrades = (decisions ?? []).filter((d) => d.action === 'BUY').length;
  const closedRet = closed.filter((d) => d.outcome_return != null);
  const bestTrade  = closedRet.length > 0 ? Math.max(...closedRet.map((d) => d.outcome_return!)) : null;
  const worstTrade = closedRet.length > 0 ? Math.min(...closedRet.map((d) => d.outcome_return!)) : null;

  const dangerPos  = enrichedPositions.filter((p) => p.stop_distance_pct != null && p.stop_distance_pct < 2.5).sort((a, b) => (a.stop_distance_pct ?? 99) - (b.stop_distance_pct ?? 99))[0];
  const weakSignals = enrichedPositions.filter((p) => p.signal_strength === 'zayıf').map((p) => p.sembol);

  return NextResponse.json(
    {
      ok: true,
      currency: 'USD',
      summary: {
        totalValue:      parseFloat(liveTotalValue.toFixed(2)),
        cash,
        positionsValue:  parseFloat(livePosValue.toFixed(2)),
        totalReturn:     parseFloat(totalReturn.toFixed(2)),
        initialCapital:  APEX_US_INITIAL_CAPITAL,
        maxDrawdown:     maxDD,
        positionCount:   enrichedPositions.length,
        dailyReturn:     latest?.daily_return ?? 0,
        winRate,
        winRate30d:      latest?.win_rate_30d ?? null,
        totalTrades,
        bestTrade,
        worstTrade,
        stopAlert:   dangerPos ? `${dangerPos.sembol} stop'a -%${dangerPos.stop_distance_pct?.toFixed(1)} uzakta` : null,
        weakSignals: weakSignals.length > 0 ? weakSignals : null,
        lastPriceUpdate: symbols.length > 0 ? 'scan_cache+yahoo' : 'snapshot',
      },
      positions:  enrichedPositions,
      history:    (history ?? []).reverse(),
      decisions:  decisions ?? [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}
