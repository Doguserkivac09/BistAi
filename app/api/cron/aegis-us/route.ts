/**
 * Aegis-US Portföy — Haftalık Karar Cron
 * GET /api/cron/aegis-us
 * Schedule: 30 21 * * 1 (Pazartesi 00:30 TRT Salı — US scan sonrası)
 *
 * scan_cache (market='US') → Context-Aware Exit + Haftalık AL/SAT/TUT
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import {
  apexEvaluatePosition, apexTrailingStop, calcLockedStopFloor,
  apexSignalHealth, type ApexPosition, type SignalContext,
} from '@/lib/apex-engine';
import {
  aegisUSPositionSize, aegisUSCalcLevels, aegisUSHealthCheck,
  AEGIS_US_INITIAL_CAPITAL, AEGIS_US_MIN_CONFLUENCE, AEGIS_US_MIN_REL_VOL,
  AEGIS_US_MIN_POSITION_USD, AEGIS_US_STOP_LOSS_PCT,
} from '@/lib/aegis-us-engine';
import { usMarketGuard } from '@/lib/us-market-guard';
import { countTradingDaysBetween } from '@/lib/time-align';
import { assessNewsPricedIn } from '@/lib/news-priced-in';
import { fetchQuoteUS } from '@/lib/yahoo-us';

const CRON_SECRET = process.env.CRON_SECRET;

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

function computeSignalFlags(candlesJson: unknown): { belowSma5: boolean; isStagnant: boolean } {
  if (!Array.isArray(candlesJson) || candlesJson.length < 10) return { belowSma5: false, isStagnant: false };
  const c = candlesJson as Array<{ close: number; high: number; low: number }>;
  const last5 = c.slice(-5);
  const sma5 = last5.reduce((s, x) => s + x.close, 0) / 5;
  const belowSma5 = c.at(-1)!.close < sma5;
  const last10 = c.slice(-10);
  const maxH = Math.max(...last10.map((x) => x.high));
  const minL = Math.min(...last10.map((x) => x.low));
  const isStagnant = minL > 0 ? (maxH - minL) / minL < 0.03 : false;
  return { belowSma5, isStagnant };
}

function getAtrFromSignals(signalsJson: unknown): number | null {
  if (!Array.isArray(signalsJson)) return null;
  for (const s of signalsJson as Array<{ atr?: number }>) {
    if (s.atr && s.atr > 0) return s.atr;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const isVercel = req.headers.get('x-vercel-cron') === '1';
  const token    = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercel && !(CRON_SECRET && token === CRON_SECRET)) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guard = usMarketGuard();
  if (guard) return guard;

  const db  = admin();
  const now = new Date();
  const { week: weekNumber, year } = getISOWeek(now);
  const today = now.toISOString().slice(0, 10);

  // Bu hafta zaten işlendi mi?
  const { data: existing } = await db
    .from('aegis_us_decisions')
    .select('id').eq('week_number', weekNumber).eq('year', year).limit(1);
  if (existing?.length) {
    return NextResponse.json({ ok: true, skipped: true, message: `${year}-W${weekNumber} zaten işlendi` });
  }

  // Portföy durumu
  const { data: snapshot } = await db
    .from('aegis_us_history')
    .select('total_value, cash, total_return')
    .order('year', { ascending: false }).order('week_number', { ascending: false }).limit(1);

  let cash          = snapshot?.[0]?.cash        ?? AEGIS_US_INITIAL_CAPITAL;
  let totalValue    = snapshot?.[0]?.total_value ?? AEGIS_US_INITIAL_CAPITAL;
  const totalReturnPct = snapshot?.[0]?.total_return ?? 0;

  let drawdownBlockNew = false;
  if (totalReturnPct < -20) { drawdownBlockNew = true; }

  // Makro
  const macroFull  = await getMacroFull().catch(() => null);
  const macroScore = macroFull?.macroScore?.score ?? 0;
  const macroBlockNew = macroScore <= -20;

  // Açık pozisyonlar
  const { data: rawPos } = await db.from('aegis_us_positions').select('*').eq('is_open', true);

  const positions: (ApexPosition & { entry_date: string; tp1_hit: boolean; entry_week: number; entry_year: number })[] = (rawPos ?? []).map((p) => ({
    id: p.id, sembol: p.sembol, sector_id: p.sector_id ?? 'other',
    shares: p.shares, entry_price: p.entry_price,
    stop_loss: p.stop_loss ?? p.entry_price * (1 - AEGIS_US_STOP_LOSS_PCT),
    trailing_stop: p.trailing_stop ?? p.entry_price * (1 - AEGIS_US_STOP_LOSS_PCT),
    cost_basis: p.cost_basis, current_price: p.current_price,
    entry_confluence: p.entry_confluence ?? null, entry_rel_vol5: null,
    tp1_hit:    p.tp1_hit    ?? false,
    entry_date: p.entry_date ?? today,
    entry_week: p.entry_week ?? weekNumber,
    entry_year: p.entry_year ?? year,
  }));

  // Scan verisi (market='US') — tüm açık pozisyonlar için
  const openSemboller = positions.map((p) => p.sembol);
  const fullPosScanMap = new Map<string, Record<string, unknown>>();
  if (openSemboller.length > 0) {
    const { data: scanRows } = await db
      .from('scan_cache')
      .select('sembol, last_close, rsi, confluence_score, rel_vol5, change_percent, signals_json, candles_json')
      .eq('market', 'US')
      .in('sembol', openSemboller);
    for (const r of scanRows ?? []) fullPosScanMap.set(r.sembol, r as Record<string, unknown>);
  }

  // Kandidatlar (daha geniş eşik — Aegis muhafazakâr giriş)
  const { data: scanRows } = await db
    .from('scan_cache')
    .select('sembol, confluence_score, rel_vol5, last_close, change_percent, signals_json, candles_json, sector')
    .eq('market', 'US')
    .gte('confluence_score', AEGIS_US_MIN_CONFLUENCE)
    .gte('rel_vol5', AEGIS_US_MIN_REL_VOL)
    .order('confluence_score', { ascending: false })
    .limit(30);

  const candidates = (scanRows ?? []).filter((r) => {
    const sigs = (r.signals_json ?? []) as Array<{ direction: string }>;
    const up   = sigs.filter((s) => s.direction === 'yukari').length;
    const down = sigs.filter((s) => s.direction === 'asagi').length;
    return up > down && (r.last_close ?? 0) > 0;
  });

  const bestOpp = candidates[0] ? { confluence: candidates[0].confluence_score, relVol5: candidates[0].rel_vol5 } : null;
  const decisions: Array<Record<string, unknown>> = [];
  let closedCount = 0, positionsValue = 0;
  const remainingPositions: typeof positions = [];

  // ── Mevcut pozisyonları değerlendir ────────────────────────────────────────
  for (const pos of positions) {
    const posScan  = fullPosScanMap.get(pos.sembol) as Record<string, unknown> | undefined;
    const current  = (posScan?.last_close as number | undefined) ?? pos.current_price ?? pos.entry_price;
    const confNow  = (posScan?.confluence_score as number | undefined) ?? null;
    const ret      = ((current - pos.entry_price) / pos.entry_price) * 100;
    const newTrail = apexTrailingStop(pos.entry_price, current, pos.trailing_stop);
    const stopFloor = calcLockedStopFloor(pos.entry_price, ret);
    const newStop   = stopFloor !== null && stopFloor > pos.stop_loss ? stopFloor : pos.stop_loss;
    const sigFlags  = computeSignalFlags(posScan?.candles_json);
    const candles   = Array.isArray(posScan?.candles_json) ? (posScan!.candles_json as Array<{ close: number }>) : null;
    const atr       = getAtrFromSignals(posScan?.signals_json);

    // Aegis: basit haber kontrolü — sadece negatif sentimenti engelle
    const newsResult = await assessNewsPricedIn(
      pos.sembol, posScan?.change_percent as number | null,
      atr, current, posScan?.rel_vol5 as number | null, candles,
    ).catch(() => null);

    const sigCtx: SignalContext = {
      rsi:         (posScan?.rsi as number | null) ?? null,
      confluence:  confNow,
      relVol5:     (posScan?.rel_vol5 as number | null) ?? null,
      signals:     Array.isArray(posScan?.signals_json) ? (posScan!.signals_json as Array<{ direction: string }>) : null,
      macroScore,
      changeToday: (posScan?.change_percent as number | null) ?? null,
      belowSma5:   sigFlags.belowSma5,
      isStagnant:  sigFlags.isStagnant,
    };

    // Haber negatifse ekstra skor düşür
    const newsAdj = (newsResult?.status === 'negative_sentiment' || newsResult?.status === 'sell_news_risk')
      ? newsResult.scoreAdj : 0;
    const health  = apexSignalHealth(sigCtx);
    const adjustedScore = health.score + newsAdj;

    const tradingDaysOpen = countTradingDaysBetween(new Date(pos.entry_date), now);
    const updatedPos = { ...pos, stop_loss: newStop, trailing_stop: newTrail };
    const evalResult = apexEvaluatePosition(updatedPos, current, confNow, (posScan?.rel_vol5 as number | null) ?? null, bestOpp, sigCtx, tradingDaysOpen);
    const { action, reason } = evalResult;

    if (action === 'SELL' || action === 'ROTATE_OUT') {
      const proceeds = pos.shares * current;
      const pnl = proceeds - pos.cost_basis;
      await db.from('aegis_us_positions').update({
        is_open: false, closed_at: now.toISOString(),
        close_price: current, close_reason: action.toLowerCase(),
        realized_pnl: parseFloat(pnl.toFixed(2)),
        realized_pnl_pct: parseFloat(((pnl / pos.cost_basis) * 100).toFixed(2)),
        current_price: current, stop_loss: newStop,
      }).eq('id', pos.id);
      cash += proceeds; closedCount++;
      decisions.push({ week_number: weekNumber, year, sembol: pos.sembol, action,
        shares: pos.shares, theoretical_price: current, cost_or_proceeds: proceeds,
        technical_score: confNow, macro_context: macroScore > 10 ? 'pozitif' : macroScore < -10 ? 'negatif' : 'nötr',
        reason_short: reason });

    } else if (action === 'PARTIAL_SELL') {
      const pct = evalResult.partialPct ?? 50;
      const closeShares = pos.shares * (pct / 100);
      const remainShares = pos.shares - closeShares;
      const partialProc = closeShares * current;
      const newStopBreakeven = Math.max(newStop, pos.entry_price);
      await db.from('aegis_us_positions').update({
        shares: remainShares, stop_loss: newStopBreakeven, tp1_hit: true,
        tp1_hit_at: now.toISOString(), current_price: current, trailing_stop: newTrail,
      }).eq('id', pos.id);
      cash += partialProc; positionsValue += remainShares * current;
      remainingPositions.push({ ...updatedPos, shares: remainShares, stop_loss: newStopBreakeven, tp1_hit: true });
      decisions.push({ week_number: weekNumber, year, sembol: pos.sembol, action: 'PARTIAL_SELL',
        shares: closeShares, theoretical_price: current, cost_or_proceeds: partialProc,
        technical_score: confNow, macro_context: null,
        reason_short: `KISMI -%${pct} (${reason})` });

    } else {
      await db.from('aegis_us_positions').update({ current_price: current, trailing_stop: newTrail, stop_loss: newStop }).eq('id', pos.id);
      positionsValue += pos.shares * current;
      remainingPositions.push({ ...updatedPos });
      decisions.push({ week_number: weekNumber, year, sembol: pos.sembol, action: 'HOLD',
        shares: pos.shares, theoretical_price: current, cost_or_proceeds: 0,
        technical_score: confNow, macro_context: null, reason_short: reason });
    }
  }

  totalValue = cash + positionsValue;

  // ── Yeni pozisyon aç (haftalık, max 2) ────────────────────────────────────
  const health   = aegisUSHealthCheck(totalValue, cash, remainingPositions.length);
  let openedCount = 0;

  if (health.canBuy && !drawdownBlockNew && !macroBlockNew) {
    const openSembolSet = new Set(remainingPositions.map((p) => p.sembol));

    for (const cand of candidates) {
      if (openedCount >= 2) break;
      if (!health.canBuy || cash < AEGIS_US_MIN_POSITION_USD) break;

      if (openSembolSet.has(cand.sembol as string)) continue;

      // Negatif haber → atla
      const candCandles = Array.isArray(cand.candles_json) ? (cand.candles_json as Array<{ close: number }>) : null;
      const newsResult  = await assessNewsPricedIn(
        cand.sembol as string, cand.change_percent as number | null,
        getAtrFromSignals(cand.signals_json), cand.last_close as number,
        cand.rel_vol5 as number | null, candCandles,
      ).catch(() => null);
      if (newsResult?.status === 'negative_sentiment' || newsResult?.status === 'sell_news_risk') continue;

      const entryPrice = cand.last_close as number;
      if (!entryPrice || entryPrice <= 0) continue;

      const rawSize  = aegisUSPositionSize(cash, totalValue, cand.confluence_score as number, macroScore);
      const capped   = Math.min(rawSize, health.maxSize);
      if (capped < AEGIS_US_MIN_POSITION_USD) continue;

      const shares = capped / entryPrice; // fractional
      const cost   = shares * entryPrice;
      const { stopLoss, trailingStop, takeProfit } = aegisUSCalcLevels(entryPrice);

      await db.from('aegis_us_positions').insert({
        sembol: cand.sembol as string, sector_id: cand.sector ?? 'other', sector_name: cand.sector ?? 'Other',
        shares, entry_price: entryPrice, entry_date: today, entry_week: weekNumber, entry_year: year,
        current_price: entryPrice, stop_loss: stopLoss, trailing_stop: trailingStop, take_profit: takeProfit,
        cost_basis: cost, is_open: true, entry_confluence: cand.confluence_score as number,
      });

      cash -= cost; positionsValue += cost; totalValue = cash + positionsValue;
      openedCount++;
      openSembolSet.add(cand.sembol as string);

      decisions.push({ week_number: weekNumber, year, sembol: cand.sembol, action: 'BUY',
        shares: parseFloat(shares.toFixed(6)), theoretical_price: entryPrice, cost_or_proceeds: cost,
        technical_score: cand.confluence_score as number,
        macro_context: macroScore > 10 ? 'pozitif' : macroScore < -10 ? 'negatif' : 'nötr',
        reason_short: `AEGIS-US GİRİŞ: conf ${cand.confluence_score}, relVol5 ${(cand.rel_vol5 as number).toFixed(1)}x` });
    }
  }

  if (decisions.length > 0) {
    await db.from('aegis_us_decisions').insert(decisions);
  }

  // SP500 (SPY) haftalık getiri
  let sp500Return = 0;
  try {
    const { fetchOHLCVUS } = await import('@/lib/yahoo-us');
    const { candles: spy } = await fetchOHLCVUS('SPY', 7);
    if (spy.length >= 5) {
      sp500Return = ((spy.at(-1)!.close - spy.at(-5)!.close) / spy.at(-5)!.close) * 100;
    }
  } catch { /* fallback 0 */ }

  const prevVal = snapshot?.[0]?.total_value ?? AEGIS_US_INITIAL_CAPITAL;
  const weeklyReturn = prevVal > 0 ? ((totalValue - prevVal) / prevVal) * 100 : 0;
  const totalReturnNow = ((totalValue - AEGIS_US_INITIAL_CAPITAL) / AEGIS_US_INITIAL_CAPITAL) * 100;
  const prevMaxDD = snapshot?.[0]?.total_return ?? 0;
  const maxDrawdown = Math.min(prevMaxDD < 0 ? prevMaxDD : 0, weeklyReturn < 0 ? weeklyReturn : 0);

  await db.from('aegis_us_history').upsert({
    week_number: weekNumber, year,
    total_value:      parseFloat(totalValue.toFixed(4)),
    cash:             parseFloat(cash.toFixed(4)),
    positions_value:  parseFloat(positionsValue.toFixed(4)),
    weekly_return:    parseFloat(weeklyReturn.toFixed(4)),
    sp500_return:     parseFloat(sp500Return.toFixed(4)),
    alpha:            parseFloat((weeklyReturn - sp500Return).toFixed(4)),
    total_return:     parseFloat(totalReturnNow.toFixed(4)),
    max_drawdown:     parseFloat(maxDrawdown.toFixed(4)),
    position_count:   remainingPositions.length + openedCount,
    closed_this_week: closedCount,
    opened_this_week: openedCount,
  }, { onConflict: 'week_number,year' });

  console.log(`[AEGIS-US] ${year}-W${weekNumber}: ${decisions.length} karar | +${openedCount} açıldı, ${closedCount} kapandı | $${totalValue.toFixed(2)}`);

  return NextResponse.json({ ok: true, week: `${year}-W${weekNumber}`, currency: 'USD',
    totalValue: totalValue.toFixed(4), decisions: decisions.length, opened: openedCount, closed: closedCount });
}
