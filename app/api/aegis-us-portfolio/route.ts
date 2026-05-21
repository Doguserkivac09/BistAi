/**
 * GET /api/aegis-us-portfolio
 * Aegis-US: canlı fiyat çekme + gerçek zamanlı portföy değeri
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AEGIS_US_INITIAL_CAPITAL } from '@/lib/aegis-us-engine';
import { fetchQuoteUS } from '@/lib/yahoo-us';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { week: weekNum, year: d.getFullYear() };
}

export async function GET() {
  const db = admin();

  const [{ data: positions }, { data: history }, { data: decisions }] = await Promise.all([
    db.from('aegis_us_positions').select('*').eq('is_open', true).order('entry_date', { ascending: false }),
    db.from('aegis_us_history').select('*').order('year', { ascending: false }).order('week_number', { ascending: false }).limit(12),
    db.from('aegis_us_decisions').select('*').order('year', { ascending: false }).order('week_number', { ascending: false }).limit(50),
  ]);

  const symbols = (positions ?? []).map((p) => p.sembol as string);
  const priceMap = new Map<string, { price: number; changePercent: number | null; confluence: number | null; relVol5: number | null; rsi: number | null }>();

  if (symbols.length > 0) {
    const { data: scanPrices } = await db
      .from('scan_cache')
      .select('sembol, last_close, confluence_score, change_percent, rel_vol5, rsi')
      .eq('market', 'US')
      .in('sembol', symbols);

    for (const r of scanPrices ?? []) {
      if (r.last_close) priceMap.set(r.sembol, {
        price: r.last_close, changePercent: r.change_percent ?? null,
        confluence: r.confluence_score ?? null, relVol5: r.rel_vol5 ?? null, rsi: r.rsi ?? null,
      });
    }

    // Fallback: Yahoo
    const missing = symbols.filter((s) => !priceMap.has(s));
    if (missing.length > 0) {
      await Promise.allSettled(missing.map(async (s) => {
        const q = await fetchQuoteUS(s);
        if (q?.regularMarketPrice) priceMap.set(s, {
          price: q.regularMarketPrice, changePercent: q.regularMarketChangePercent ?? null,
          confluence: null, relVol5: null, rsi: null,
        });
      }));
    }
  }

  const enrichedPositions = (positions ?? []).map((pos) => {
    const scan        = priceMap.get(pos.sembol as string);
    const currentPrice = scan?.price ?? pos.current_price ?? pos.entry_price;
    const liveReturn  = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
    const livePnl     = (currentPrice - pos.entry_price) * pos.shares;
    const stopDist    = pos.stop_loss ? ((currentPrice - pos.stop_loss) / currentPrice) * 100 : null;
    const trailDist   = pos.trailing_stop ? ((currentPrice - pos.trailing_stop) / currentPrice) * 100 : null;
    return {
      ...pos,
      current_price:      currentPrice,
      live_return_pct:    parseFloat(liveReturn.toFixed(2)),
      live_pnl:           parseFloat(livePnl.toFixed(2)),
      stop_distance_pct:  stopDist  ? parseFloat(stopDist.toFixed(2))  : null,
      trail_distance_pct: trailDist ? parseFloat(trailDist.toFixed(2)) : null,
      scan_confluence:    scan?.confluence ?? null,
      scan_rel_vol5:      scan?.relVol5    ?? null,
      scan_rsi:           scan?.rsi        ?? null,
      change_today:       scan?.changePercent ?? null,
    };
  });

  const latest       = history?.[0];
  const cash         = latest?.cash ?? AEGIS_US_INITIAL_CAPITAL;
  const livePosValue = enrichedPositions.reduce((s, p) => s + (p.current_price ?? p.entry_price) * p.shares, 0);
  const liveTotalValue = cash + livePosValue;
  const totalReturn    = ((liveTotalValue - AEGIS_US_INITIAL_CAPITAL) / AEGIS_US_INITIAL_CAPITAL) * 100;
  const maxDD = (history ?? []).reduce((m, h) => Math.min(m, h.max_drawdown ?? 0), 0);

  const { week: currentWeek, year: currentYear } = getISOWeek(new Date());
  const weeklyReturn = history?.find((h) => h.week_number === currentWeek && h.year === currentYear)?.weekly_return ?? 0;
  const sp500return  = history?.find((h) => h.week_number === currentWeek && h.year === currentYear)?.sp500_return ?? 0;

  return NextResponse.json(
    {
      ok: true, currency: 'USD',
      summary: {
        totalValue:      parseFloat(liveTotalValue.toFixed(2)),
        cash, positionsValue: parseFloat(livePosValue.toFixed(2)),
        totalReturn:     parseFloat(totalReturn.toFixed(2)),
        initialCapital:  AEGIS_US_INITIAL_CAPITAL,
        maxDrawdown:     maxDD,
        positionCount:   enrichedPositions.length,
        weeklyReturn, alpha: weeklyReturn - sp500return,
        lastPriceUpdate: symbols.length > 0 ? 'scan_cache+yahoo' : 'snapshot',
      },
      positions:  enrichedPositions,
      history:    (history ?? []).reverse(),
      decisions:  decisions ?? [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}
