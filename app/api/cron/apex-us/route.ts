/**
 * APEX-US Portföy — Günlük Karar Cron
 * GET /api/cron/apex-us
 * Schedule: 45 20 * * 1-5 (23:45 TRT — scan-us'tan 15dk sonra)
 *
 * scan_cache (market='US') → Context-Aware Exit + Haber Pricing-In
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import {
  apexEvaluatePosition, apexTrailingStop,
  type ApexPosition, type SignalContext,
  apexSignalHealth,
} from '@/lib/apex-engine';
import {
  apexUSPositionSize, apexUSCalcLevels, apexUSHealthCheck,
  calcUSLockedStopFloor,
  APEX_US_INITIAL_CAPITAL, APEX_US_MIN_CONFLUENCE, APEX_US_MIN_REL_VOL,
  APEX_US_MIN_POSITION_USD,
} from '@/lib/apex-us-engine';
import { usMarketGuard } from '@/lib/us-market-guard';
import { countTradingDaysBetween } from '@/lib/time-align';
import { assessNewsPricedIn } from '@/lib/news-priced-in';

const CRON_SECRET = process.env.CRON_SECRET;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function computeSignalFlags(candlesJson: unknown): { belowSma5: boolean; isStagnant: boolean } {
  if (!Array.isArray(candlesJson) || candlesJson.length < 10) return { belowSma5: false, isStagnant: false };
  const c = candlesJson as Array<{ close: number; high: number; low: number }>;
  const last5  = c.slice(-5);
  const sma5   = last5.reduce((s, x) => s + x.close, 0) / 5;
  const belowSma5 = c.at(-1)!.close < sma5;
  const last10 = c.slice(-10);
  const maxH   = Math.max(...last10.map((x) => x.high));
  const minL   = Math.min(...last10.map((x) => x.low));
  const isStagnant = minL > 0 ? (maxH - minL) / minL < 0.03 : false;
  return { belowSma5, isStagnant };
}

function getDominantSignalType(signalsJson: unknown): string | null {
  if (!Array.isArray(signalsJson)) return null;
  const sigs = (signalsJson as Array<{ direction: string; type: string; severity: string }>)
    .filter((s) => s.direction === 'yukari');
  if (!sigs.length) return null;
  const order: Record<string, number> = { güçlü: 3, orta: 2, zayıf: 1 };
  sigs.sort((a, b) => (order[b.severity] ?? 0) - (order[a.severity] ?? 0));
  return sigs[0]?.type ?? null;
}

function getAtrFromSignals(signalsJson: unknown): number | null {
  if (!Array.isArray(signalsJson)) return null;
  for (const s of signalsJson as Array<{ atr?: number }>) {
    if (s.atr && s.atr > 0) return s.atr;
  }
  return null;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const isVercel = req.headers.get('x-vercel-cron') === '1';
  const token    = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercel && !(CRON_SECRET && token === CRON_SECRET)) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const guard = usMarketGuard();
  if (guard) return guard;

  const db  = admin();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Bugün zaten işlendi mi?
  const { data: existingToday } = await db
    .from('apex_us_decisions')
    .select('id').eq('decision_date', today).limit(1);
  if (existingToday?.length) {
    return NextResponse.json({ ok: true, skipped: true, message: `${today} zaten işlendi` });
  }

  // ── Portföy durumu ────────────────────────────────────────────────────────
  const { data: snapshot } = await db
    .from('apex_us_history')
    .select('total_value, cash, total_return')
    .order('snapshot_date', { ascending: false }).limit(1);

  let cash             = snapshot?.[0]?.cash        ?? APEX_US_INITIAL_CAPITAL;
  let totalValue       = snapshot?.[0]?.total_value ?? APEX_US_INITIAL_CAPITAL;
  const totalReturnPct = snapshot?.[0]?.total_return ?? 0;

  // Drawdown koruması
  let drawdownBlockNew = false, drawdownSizeMult = 1.0;
  if (totalReturnPct < -20) { drawdownBlockNew = true; console.log('[apex-us] Drawdown -%20 — yeni giriş durduruldu'); }
  else if (totalReturnPct < -12) { drawdownSizeMult = 0.5; console.log('[apex-us] Drawdown -%12 — boyut yarıya indi'); }

  // Makro
  const macroFull   = await getMacroFull().catch(() => null);
  const macroScore  = macroFull?.macroScore?.score ?? 0;
  const macroBlockNew    = macroScore <= -20;
  const macroReducedMode = macroScore > -20 && macroScore <= -10;

  // ── Açık pozisyonlar ──────────────────────────────────────────────────────
  const { data: rawPos } = await db
    .from('apex_us_positions')
    .select('*').eq('is_open', true);

  const positions: (ApexPosition & { entry_date: string; tp1_hit: boolean })[] = (rawPos ?? []).map((p) => ({
    id: p.id, sembol: p.sembol, sector_id: p.sector_id ?? 'other',
    shares: p.shares, entry_price: p.entry_price,
    stop_loss: p.stop_loss, trailing_stop: p.trailing_stop,
    cost_basis: p.cost_basis, current_price: p.current_price,
    entry_confluence: p.entry_confluence, entry_rel_vol5: p.entry_rel_vol5,
    tp1_hit:    p.tp1_hit    ?? false,
    entry_date: p.entry_date ?? today,
  }));

  // Scan verisi (market='US')
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

  // Kandidatlar: scan_cache'den yüksek confluence + relVol (market='US')
  const { data: scanRows } = await db
    .from('scan_cache')
    .select('sembol, confluence_score, rel_vol5, last_close, change_percent, signals_json, candles_json, sector')
    .eq('market', 'US')
    .gte('confluence_score', APEX_US_MIN_CONFLUENCE)
    .gte('rel_vol5', APEX_US_MIN_REL_VOL)
    .order('confluence_score', { ascending: false })
    .limit(20);

  const candidates = (scanRows ?? []).filter((r) => {
    const sigs = (r.signals_json ?? []) as Array<{ direction: string }>;
    const up   = sigs.filter((s) => s.direction === 'yukari').length;
    const down = sigs.filter((s) => s.direction === 'asagi').length;
    return up > down && (r.last_close ?? 0) > 0;
  });

  const bestOpp = candidates[0]
    ? { confluence: candidates[0].confluence_score, relVol5: candidates[0].rel_vol5 }
    : null;

  const decisions: Array<Record<string, unknown>> = [];
  let closedCount = 0, positionsValue = 0;
  const remainingPositions: typeof positions = [];

  // Sektör sayacı (konsantrasyon)
  const sectorMap = new Map<string, number>();
  const sectorPositionCount = new Map<string, number>();

  // ── Mevcut pozisyonları değerlendir ────────────────────────────────────────
  for (const pos of positions) {
    const posScan    = fullPosScanMap.get(pos.sembol) as Record<string, unknown> | undefined;
    const current    = (posScan?.last_close as number | undefined) ?? pos.current_price ?? pos.entry_price;
    const confNow    = (posScan?.confluence_score as number | undefined) ?? null;
    const ret        = ((current - pos.entry_price) / pos.entry_price) * 100;
    const newTrailing = apexTrailingStop(pos.entry_price, current, pos.trailing_stop);
    const stopFloor  = calcUSLockedStopFloor(pos.entry_price, ret);
    const newStopLoss = stopFloor !== null && stopFloor > pos.stop_loss ? stopFloor : pos.stop_loss;

    const sigFlags = computeSignalFlags(posScan?.candles_json);
    const candles   = Array.isArray(posScan?.candles_json) ? (posScan!.candles_json as Array<{ close: number }>) : null;

    // Haber pricing-in
    const atr       = getAtrFromSignals(posScan?.signals_json);
    const newsResult = await assessNewsPricedIn(
      pos.sembol,
      posScan?.change_percent as number | null,
      atr, current, posScan?.rel_vol5 as number | null, candles,
    ).catch(() => null);

    const sigCtx: SignalContext = {
      rsi:        (posScan?.rsi as number | null) ?? null,
      confluence: confNow,
      relVol5:    (posScan?.rel_vol5 as number | null) ?? null,
      signals:    Array.isArray(posScan?.signals_json) ? (posScan!.signals_json as Array<{ direction: string }>) : null,
      macroScore,
      changeToday: (posScan?.change_percent as number | null) ?? null,
      belowSma5:   sigFlags.belowSma5,
      isStagnant:  sigFlags.isStagnant,
    };

    // News scoring — sinyal skoruna ekle
    const newsAdj = newsResult?.scoreAdj ?? 0;
    const updatedCtx: SignalContext = newsAdj !== 0
      ? { ...sigCtx, /* newsAdj is applied in apexSignalHealth if available */ }
      : sigCtx;

    // Manuel: eğer haber skoru varsa, confluence'ı geçici ayarla
    const adjustedHealth = (() => {
      const base = apexSignalHealth(updatedCtx);
      return { ...base, score: base.score + newsAdj };
    })();

    const tradingDaysOpen = countTradingDaysBetween(new Date(pos.entry_date), now);
    const updatedPos = { ...pos, stop_loss: newStopLoss, trailing_stop: newTrailing };
    const evalResult = apexEvaluatePosition(updatedPos, current, confNow, (posScan?.rel_vol5 as number | null) ?? null, bestOpp, sigCtx, tradingDaysOpen);
    const { action, reason } = evalResult;

    if (action === 'SELL' || action === 'ROTATE_OUT') {
      const proceeds = pos.shares * current;
      const pnl      = proceeds - pos.cost_basis;
      const pnlPct   = (pnl / pos.cost_basis) * 100;
      await db.from('apex_us_positions').update({
        is_open: false, closed_at: now.toISOString(),
        close_price: current, close_reason: action.toLowerCase(),
        realized_pnl: parseFloat(pnl.toFixed(2)),
        realized_pnl_pct: parseFloat(pnlPct.toFixed(2)),
        current_price: current, stop_loss: newStopLoss,
      }).eq('id', pos.id);
      cash += proceeds; closedCount++;
      decisions.push({
        decision_date: today, sembol: pos.sembol, action,
        shares: pos.shares, theoretical_price: current, cost_or_proceeds: proceeds,
        confluence_score: confNow, rel_vol5: (posScan?.rel_vol5 ?? null),
        stop_loss: newStopLoss, reason_short: reason, signal_type: null,
        news_status: newsResult?.status ?? null, news_score_adj: newsAdj || null,
      });

    } else if (action === 'PARTIAL_SELL') {
      const pct          = evalResult.partialPct ?? 50;
      const closeShares  = pos.shares * (pct / 100); // fractional ok
      const remainShares = pos.shares - closeShares;
      const partialProc  = closeShares * current;
      const partialPnl   = (current - pos.entry_price) * closeShares;
      const newStop      = Math.max(newStopLoss, pos.entry_price);
      await db.from('apex_us_positions').update({
        shares: remainShares, stop_loss: newStop, tp1_hit: true,
        tp1_hit_at: now.toISOString(), current_price: current, trailing_stop: newTrailing,
      }).eq('id', pos.id);
      cash          += partialProc;
      positionsValue += remainShares * current;
      remainingPositions.push({ ...updatedPos, shares: remainShares, stop_loss: newStop, tp1_hit: true });
      const pnlStr = `${partialPnl >= 0 ? '+' : ''}$${partialPnl.toFixed(2)}`;
      decisions.push({
        decision_date: today, sembol: pos.sembol, action: 'PARTIAL_SELL',
        shares: closeShares, theoretical_price: current, cost_or_proceeds: partialProc,
        confluence_score: confNow, rel_vol5: (posScan?.rel_vol5 ?? null),
        stop_loss: newStop, signal_type: null,
        reason_short: `${evalResult.trigger === 'parabolic' ? 'PARABOLİK' : 'KISMI'} -%${pct} (${pnlStr}): ${reason}`,
        news_status: newsResult?.status ?? null, news_score_adj: newsAdj || null,
      });

    } else {
      await db.from('apex_us_positions').update({
        current_price: current, trailing_stop: newTrailing, stop_loss: newStopLoss,
      }).eq('id', pos.id);
      positionsValue += pos.shares * current;
      remainingPositions.push({ ...updatedPos });
      const pv = (updatedPos.current_price ?? pos.entry_price) * pos.shares;
      sectorMap.set(pos.sector_id, (sectorMap.get(pos.sector_id) ?? 0) + pv / (totalValue || 1));
      decisions.push({
        decision_date: today, sembol: pos.sembol, action: 'HOLD',
        shares: pos.shares, theoretical_price: current, cost_or_proceeds: 0,
        confluence_score: confNow, rel_vol5: (posScan?.rel_vol5 ?? null),
        stop_loss: newStopLoss, reason_short: reason, signal_type: null,
        news_status: newsResult?.status ?? null, news_score_adj: newsAdj || null,
      });
    }
  }

  for (const pos of remainingPositions) {
    sectorPositionCount.set(pos.sector_id, (sectorPositionCount.get(pos.sector_id) ?? 0) + 1);
  }

  totalValue = cash + positionsValue;

  // ── Yeni pozisyon aç ──────────────────────────────────────────────────────
  const health = apexUSHealthCheck(totalValue, cash, remainingPositions.length, sectorMap);
  let openedCount = 0;

  const crossCheck = await db.from('apex_portfolio_positions').select('sembol').eq('is_open', true).then((r) => new Set((r.data ?? []).map((p) => p.sembol)));

  if (health.canBuy && !drawdownBlockNew && !macroBlockNew) {
    for (const cand of candidates) {
      if (openedCount >= 2) break;
      if (!health.canBuy || cash < APEX_US_MIN_POSITION_USD) break;
      if (macroReducedMode && (remainingPositions.length + openedCount) >= 2) break;

      if (remainingPositions.some((p) => p.sembol === cand.sembol)) continue;
      if (crossCheck.has(cand.sembol)) continue; // BIST ile çakışma önleme

      const sectorId = cand.sector ?? 'other';
      if ((sectorMap.get(sectorId) ?? 0) >= 0.60) continue;
      if ((sectorPositionCount.get(sectorId) ?? 0) >= 2) continue;

      const rawSize  = apexUSPositionSize(cash, totalValue, cand.confluence_score, cand.rel_vol5, macroScore);
      const posSize  = rawSize * drawdownSizeMult;
      const capped   = Math.min(posSize, health.maxSize);
      if (capped < APEX_US_MIN_POSITION_USD) continue;

      const entryPrice = cand.last_close as number;
      if (!entryPrice || entryPrice <= 0) continue;

      // Haber fiyatlandırma kontrolü — negatif haberde giriş yok
      const candCandles = Array.isArray(cand.candles_json) ? (cand.candles_json as Array<{ close: number }>) : null;
      const candAtr     = getAtrFromSignals(cand.signals_json);
      const newsResult  = await assessNewsPricedIn(
        cand.sembol as string, cand.change_percent as number | null,
        candAtr, entryPrice, cand.rel_vol5 as number | null, candCandles,
      ).catch(() => null);

      if (newsResult?.status === 'sell_news_risk' || newsResult?.status === 'negative_sentiment') {
        console.log(`[apex-us] ${cand.sembol} haber riski (${newsResult.status}) — atlandı`);
        continue;
      }

      const shares     = capped / entryPrice; // Fractional — float
      const cost       = shares * entryPrice;
      const { stopLoss, trailingStop } = apexUSCalcLevels(entryPrice, candAtr);
      const sigType    = getDominantSignalType(cand.signals_json);

      await db.from('apex_us_positions').insert({
        sembol: cand.sembol as string, sector_id: sectorId, sector_name: cand.sector ?? 'Other',
        shares, entry_price: entryPrice, entry_date: today,
        current_price: entryPrice, stop_loss: stopLoss, trailing_stop: trailingStop,
        cost_basis: cost, is_open: true,
        entry_confluence: cand.confluence_score as number,
        entry_rel_vol5: cand.rel_vol5 as number,
      });

      cash -= cost; positionsValue += cost; totalValue = cash + positionsValue;
      openedCount++;
      sectorMap.set(sectorId, (sectorMap.get(sectorId) ?? 0) + cost / totalValue);
      sectorPositionCount.set(sectorId, (sectorPositionCount.get(sectorId) ?? 0) + 1);

      decisions.push({
        decision_date: today, sembol: cand.sembol, action: 'BUY',
        shares: parseFloat(shares.toFixed(6)), theoretical_price: entryPrice, cost_or_proceeds: cost,
        confluence_score: cand.confluence_score, rel_vol5: cand.rel_vol5,
        stop_loss: stopLoss, signal_type: sigType,
        reason_short: `APEX-US GİRİŞ: conf ${cand.confluence_score}, relVol5 ${(cand.rel_vol5 as number).toFixed(1)}x${sigType ? ` [${sigType}]` : ''}, bugün ${(cand.change_percent as number | null)?.toFixed(1) ?? '?'}%${newsResult ? `, haber: ${newsResult.status}` : ''}`,
        news_status: newsResult?.status ?? null, news_score_adj: newsResult?.scoreAdj ?? null,
      });
    }
  }

  // Kararları kaydet
  if (decisions.length > 0) {
    await db.from('apex_us_decisions').insert(decisions);
  }

  // Günlük snapshot
  const prevSnap    = await db.from('apex_us_history').select('total_value, total_return, max_drawdown').order('snapshot_date', { ascending: false }).limit(1);
  const prevValue   = prevSnap.data?.[0]?.total_value ?? APEX_US_INITIAL_CAPITAL;
  const dailyReturn = prevValue > 0 ? ((totalValue - prevValue) / prevValue) * 100 : 0;
  const totalReturnNow = ((totalValue - APEX_US_INITIAL_CAPITAL) / APEX_US_INITIAL_CAPITAL) * 100;
  const prevMaxDD   = prevSnap.data?.[0]?.max_drawdown ?? 0;
  const maxDrawdown = Math.min(prevMaxDD, dailyReturn < 0 ? dailyReturn : 0);

  const { data: recentDec } = await db.from('apex_us_decisions')
    .select('action, outcome_return')
    .in('action', ['SELL', 'ROTATE_OUT'])
    .gte('decision_date', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const evalDec  = (recentDec ?? []).filter((d) => d.outcome_return != null);
  const winsDec  = evalDec.filter((d) => (d.outcome_return ?? 0) > 0);
  const winRate  = evalDec.length > 0 ? (winsDec.length / evalDec.length) * 100 : null;

  await db.from('apex_us_history').upsert({
    snapshot_date:   today,
    total_value:     parseFloat(totalValue.toFixed(4)),
    cash:            parseFloat(cash.toFixed(4)),
    positions_value: parseFloat(positionsValue.toFixed(4)),
    daily_return:    parseFloat(dailyReturn.toFixed(4)),
    total_return:    parseFloat(totalReturnNow.toFixed(4)),
    max_drawdown:    parseFloat(maxDrawdown.toFixed(4)),
    position_count:  remainingPositions.length + openedCount,
    trades_today:    openedCount + closedCount,
    win_rate_30d:    winRate ? parseFloat(winRate.toFixed(1)) : null,
  }, { onConflict: 'snapshot_date' });

  console.log(`[APEX-US] ${today}: ${decisions.length} karar | +${openedCount} açıldı, ${closedCount} kapandı | $${totalValue.toFixed(2)}`);

  return NextResponse.json({
    ok: true, date: today, currency: 'USD',
    totalValue: totalValue.toFixed(4),
    cash: cash.toFixed(4),
    decisions: decisions.length, opened: openedCount, closed: closedCount,
  });
}
