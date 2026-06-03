/**
 * APEX Portföy — Günlük Karar Cron
 * GET /api/cron/apex-portfolio
 * Schedule: Her iş günü 14:45 UTC (17:45 TRT) — kapanışa 15 dk kala
 *
 * Akış:
 *  1. scan_cache'den bugünün en güçlü fırsatlarını al (relVol5≥3, conf≥75)
 *  2. Açık pozisyonları değerlendir (stop/trailing/rotasyon)
 *  3. Slot varsa en güçlü fırsata gir
 *  4. Snapshot kaydet
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import {
  apexPositionSize, apexTrailingStop, apexEvaluatePosition, apexCalcLevels,
  apexHealthCheck, apexSignalHealth, calcLockedStopFloor,
  APEX_INITIAL_CAPITAL, APEX_MIN_CONFLUENCE, APEX_MIN_REL_VOL,
  type ApexPosition, type SignalContext,
} from '@/lib/apex-engine';
import { bistGuard } from '@/lib/bist-guard';
import { countTradingDaysBetween } from '@/lib/time-align';

const CRON_SECRET = process.env.CRON_SECRET;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const isVercel = req.headers.get('x-vercel-cron') === '1';
  const token    = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercel && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guard = bistGuard();
  if (guard) return guard;

  const db  = admin();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Bugün zaten çalıştı mı?
  const { data: existing } = await db
    .from('apex_portfolio_decisions')
    .select('id')
    .eq('decision_date', today)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, skipped: true, message: `${today} zaten işlendi` });
  }

  // ── 1. Portföy durumu ──────────────────────────────────────────────
  const { data: snapshot } = await db
    .from('apex_portfolio_history')
    .select('total_value, cash, total_return')
    .order('snapshot_date', { ascending: false })
    .limit(1);

  let cash         = snapshot?.[0]?.cash         ?? APEX_INITIAL_CAPITAL;
  let totalValue   = snapshot?.[0]?.total_value   ?? APEX_INITIAL_CAPITAL;
  const totalReturnPct = snapshot?.[0]?.total_return ?? 0;

  // ── Devre kesici: XU100 bugün %3'ten fazla düştüyse yeni giriş yok ──
  let circuitBreakerActive = false;
  try {
    const { fetchOHLCV } = await import('@/lib/yahoo');
    const { candles: xu100 } = await fetchOHLCV('XU100', 3);
    if (xu100.length >= 2) {
      const todayChange = ((xu100[xu100.length-1]!.close - xu100[xu100.length-2]!.close) / xu100[xu100.length-2]!.close) * 100;
      if (todayChange < -3.0) {
        circuitBreakerActive = true;
        console.log(`[apex] Devre kesici aktif — XU100 bugün ${todayChange.toFixed(1)}%`);
      }
    }
  } catch { /* devre kesici çalışmazsa devam et */ }

  // ── Drawdown koruması ──────────────────────────────────────────────
  // -%10: pozisyon boyutu yarıya iner   -%15: yeni giriş durur
  let drawdownSizeMult = 1.0;
  let drawdownBlockNew = false;
  if (totalReturnPct < -15) {
    drawdownBlockNew = true;
    console.log(`[apex] Drawdown -%15 aşıldı (${totalReturnPct.toFixed(1)}%) — yeni giriş durduruldu`);
  } else if (totalReturnPct < -10) {
    drawdownSizeMult = 0.5;
    console.log(`[apex] Drawdown -%10 aşıldı (${totalReturnPct.toFixed(1)}%) — pozisyon boyutu yarıya indirildi`);
  }

  // ── Dinamik Kelly: gerçek sinyal performansı ────────────────────────
  let dynamicWinRate = 0.65; // APEX varsayılan
  try {
    const ninety = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data: perfHist } = await db
      .from('signal_performance')
      .select('return_7d')
      .eq('evaluated', true)
      .gte('entry_time', ninety);
    const evaluated = (perfHist ?? []).filter((r) => r.return_7d != null);
    if (evaluated.length >= 30) {
      const wins = evaluated.filter((r) => (r.return_7d ?? 0) > 0.4);
      dynamicWinRate = Math.max(0.50, wins.length / evaluated.length); // min %50
    }
  } catch { /* fallback */ }

  // ── 2. Açık pozisyonlar ────────────────────────────────────────────
  const { data: rawPos } = await db
    .from('apex_portfolio_positions')
    .select('*')
    .eq('is_open', true);

  const positions: ApexPosition[] = (rawPos ?? []).map((p) => ({
    id: p.id, sembol: p.sembol, sector_id: p.sector_id ?? 'diger',
    shares: p.shares, entry_price: p.entry_price,
    stop_loss: p.stop_loss, trailing_stop: p.trailing_stop,
    cost_basis: p.cost_basis, current_price: p.current_price,
    entry_confluence: p.entry_confluence, entry_rel_vol5: p.entry_rel_vol5,
    tp1_hit:    p.tp1_hit    ?? false,
    entry_date: p.entry_date ?? today,
  }));

  // ── Açık pozisyonlar için tam scan verisi (degradasyon dahil) ────────
  const openSemboller = positions.map((p) => p.sembol);
  const fullPosScanMap = new Map<string, {
    last_close: number; rsi: number | null;
    confluence_score: number | null; rel_vol5: number | null;
    change_percent: number | null; signals_json: unknown; candles_json: unknown;
  }>();
  if (openSemboller.length > 0) {
    const { data: posScanRows } = await db
      .from('scan_cache')
      .select('sembol, last_close, rsi, confluence_score, rel_vol5, change_percent, signals_json, candles_json')
      .eq('market', 'BIST')
      .in('sembol', openSemboller);
    for (const r of posScanRows ?? []) {
      fullPosScanMap.set(r.sembol, r);
    }
  }

  // ── 3. scan_cache: bugünün fırsatları (sadece BIST) ───────────────
  const { data: scanRows } = await db
    .from('scan_cache')
    .select('sembol, confluence_score, rel_vol5, last_close, change_percent, signals_json, sector')
    .eq('market', 'BIST')
    .gte('confluence_score', APEX_MIN_CONFLUENCE)
    .gte('rel_vol5', APEX_MIN_REL_VOL)
    .order('confluence_score', { ascending: false })
    .limit(20);

  // Sadece AL sinyali baskın olanlar
  const candidates = (scanRows ?? []).filter((r) => {
    const sigs = (r.signals_json ?? []) as Array<{ direction: string }>;
    const up   = sigs.filter((s) => s.direction === 'yukari').length;
    const down = sigs.filter((s) => s.direction === 'asagi').length;
    return up > down && (r.last_close ?? 0) > 0;
  });

  // En güçlü fırsat (rotasyon kararı için)
  const bestOpp = candidates[0]
    ? { confluence: candidates[0].confluence_score, relVol5: candidates[0].rel_vol5 }
    : null;

  // ── 4. Makro bağlam ────────────────────────────────────────────────
  const macroFull   = await getMacroFull().catch(() => null);
  const macroScore  = macroFull?.macroScore?.score ?? 0;
  const macroCtx    = macroScore > 20 ? 'pozitif' : macroScore < -20 ? 'negatif' : 'nötr';

  // Makro rejim: yeni açma yasağı (≤-20) veya azaltılmış mod (-20 < score ≤-10)
  const macroBlockNew    = macroScore <= -20;  // yeni pozisyon yok
  const macroReducedMode = macroScore > -20 && macroScore <= -10; // maks 2 toplam
  if (macroBlockNew) {
    console.log(`[apex] Makro rejim filtresi aktif (score=${macroScore}) — yeni açma durduruldu`);
  } else if (macroReducedMode) {
    console.log(`[apex] Makro azaltılmış mod (score=${macroScore}) — toplam maks 2 pozisyon`);
  }

  // scan_cache map (güncel fiyat + confluence)
  const scanMap = new Map((scanRows ?? []).map((r) => [r.sembol, r]));
  const allScanMap = new Map<string, { confluence_score: number; rel_vol5: number; last_close: number }>();
  for (const r of scanRows ?? []) allScanMap.set(r.sembol, r);

  // candles_json'dan 5G SMA altı + durgunluk flag'leri hesapla
  function computeSignalFlags(candlesJson: unknown): { belowSma5: boolean; isStagnant: boolean } {
    if (!Array.isArray(candlesJson) || candlesJson.length < 10) {
      return { belowSma5: false, isStagnant: false };
    }
    const candles = candlesJson as Array<{ close: number; high: number; low: number }>;
    const last5   = candles.slice(-5);
    const sma5    = last5.reduce((s, c) => s + c.close, 0) / 5;
    const lastC   = candles[candles.length - 1]!.close;
    const belowSma5  = lastC < sma5;
    const last10  = candles.slice(-10);
    const maxH    = Math.max(...last10.map((c) => c.high));
    const minL    = Math.min(...last10.map((c) => c.low));
    const range   = minL > 0 ? (maxH - minL) / minL : 0;
    const isStagnant = range < 0.03;
    return { belowSma5, isStagnant };
  }

  // signals_json'dan ATR çıkar (dinamik stop için)
  function getAtrFromSignals(signalsJson: unknown): number | null {
    if (!Array.isArray(signalsJson)) return null;
    for (const sig of signalsJson as Array<{ atr?: number }>) {
      if (sig.atr && sig.atr > 0) return sig.atr;
    }
    return null;
  }

  // Dominant AL sinyali tipini çıkar (win rate by setup takibi)
  function getDominantSignalType(signalsJson: unknown): string | null {
    if (!Array.isArray(signalsJson)) return null;
    const sigs = (signalsJson as Array<{ type: string; direction: string; severity: string }>)
      .filter((s) => s.direction === 'yukari');
    if (sigs.length === 0) return null;
    const order: Record<string, number> = { 'güçlü': 3, 'orta': 2, 'zayıf': 1 };
    sigs.sort((a, b) => (order[b.severity] ?? 0) - (order[a.severity] ?? 0));
    return sigs[0]?.type ?? null;
  }

  const decisions: Array<{
    decision_date: string; sembol: string; action: string;
    shares: number | null; theoretical_price: number; cost_or_proceeds: number;
    confluence_score: number | null; rel_vol5: number | null;
    stop_loss: number | null; reason_short: string;
    signal_type: string | null;
  }> = [];

  let closedCount = 0;
  let positionsValue = 0;
  const remainingPositions: ApexPosition[] = [];

  // ── 5. Mevcut pozisyonları değerlendir ────────────────────────────
  for (const pos of positions) {
    // Tam scan verisi (degradasyon dahil)
    const posScan = fullPosScanMap.get(pos.sembol);
    const current = posScan?.last_close ?? pos.current_price ?? pos.entry_price;
    const confNow = posScan?.confluence_score ?? null;
    const ret     = ((current - pos.entry_price) / pos.entry_price) * 100;

    // Trailing stop güncelle
    const newTrailing = apexTrailingStop(pos.entry_price, current, pos.trailing_stop);

    // Locked-in kâr stop zemini — kapanış fiyatına göre
    const stopFloor  = calcLockedStopFloor(pos.entry_price, ret);
    const newStopLoss = stopFloor !== null && stopFloor > pos.stop_loss ? stopFloor : pos.stop_loss;

    // Signal Context oluştur
    const sigFlags    = computeSignalFlags(posScan?.candles_json);
    const sigCtx: SignalContext = {
      rsi:         posScan?.rsi          ?? null,
      confluence:  confNow,
      relVol5:     posScan?.rel_vol5     ?? null,
      signals:     Array.isArray(posScan?.signals_json) ? (posScan.signals_json as Array<{ direction: string }>) : null,
      macroScore,
      changeToday: posScan?.change_percent ?? null,
      belowSma5:   sigFlags.belowSma5,
      isStagnant:  sigFlags.isStagnant,
    };

    // Kaç iş günü açık?
    const tradingDaysOpen = countTradingDaysBetween(new Date(pos.entry_date), now);

    // Güncel pos (stop zeminli)
    const updatedPos = { ...pos, stop_loss: newStopLoss, trailing_stop: newTrailing };
    const evalResult = apexEvaluatePosition(updatedPos, current, confNow, posScan?.rel_vol5 ?? null, bestOpp, sigCtx, tradingDaysOpen);
    const { action, reason } = evalResult;

    if (action === 'SELL' || action === 'ROTATE_OUT') {
      const proceeds = pos.shares * current;
      const pnl      = proceeds - pos.cost_basis;
      const pnlPct   = (pnl / pos.cost_basis) * 100;

      await db.from('apex_portfolio_positions').update({
        is_open: false, closed_at: now.toISOString(),
        close_price: current, close_reason: action.toLowerCase(),
        realized_pnl: parseFloat(pnl.toFixed(2)),
        realized_pnl_pct: parseFloat(pnlPct.toFixed(2)),
        current_price: current, stop_loss: newStopLoss,
      }).eq('id', pos.id);

      cash += proceeds;
      closedCount++;

      decisions.push({
        decision_date: today, sembol: pos.sembol, action,
        shares: pos.shares, theoretical_price: current, cost_or_proceeds: proceeds,
        confluence_score: confNow, rel_vol5: posScan?.rel_vol5 ?? null,
        stop_loss: newStopLoss, reason_short: reason,
        signal_type: null,
      });

    } else if (action === 'PARTIAL_SELL') {
      const partialPct   = evalResult.partialPct ?? 50;
      const closeShares  = Math.floor(pos.shares * (partialPct / 100));
      const remainShares = pos.shares - closeShares;
      const partialProc  = closeShares * current;
      const partialPnl   = (current - pos.entry_price) * closeShares;
      const pnlStr       = `${partialPnl >= 0 ? '+' : ''}${partialPnl.toFixed(0)}₺`;
      const trigger      = evalResult.trigger ?? 'signal_weak';

      // Stop: break-even (en az), sonra locked floor
      const newStop = Math.max(newStopLoss, pos.entry_price);

      await db.from('apex_portfolio_positions').update({
        shares:      remainShares,
        stop_loss:   newStop,
        tp1_hit:     true,
        tp1_hit_at:  now.toISOString(),
        current_price: current,
        trailing_stop: newTrailing,
      }).eq('id', pos.id);

      cash          += partialProc;
      positionsValue += remainShares * current;
      remainingPositions.push({ ...updatedPos, shares: remainShares, stop_loss: newStop, tp1_hit: true });

      const triggerLabel = trigger === 'parabolic' ? `PARABOLİK FADE` : `KISMI ÇIKIŞ`;
      decisions.push({
        decision_date: today, sembol: pos.sembol, action: 'PARTIAL_SELL',
        shares: closeShares, theoretical_price: current, cost_or_proceeds: partialProc,
        confluence_score: confNow, rel_vol5: posScan?.rel_vol5 ?? null,
        stop_loss: newStop, signal_type: null,
        reason_short: `${triggerLabel} -%${partialPct} (${pnlStr}): ${reason}`,
      });

    } else {
      // HOLD — stop + trailing güncelle (locked floor varsa)
      await db.from('apex_portfolio_positions').update({
        current_price: current,
        trailing_stop: newTrailing,
        stop_loss: newStopLoss,
      }).eq('id', pos.id);

      positionsValue += pos.shares * current;
      remainingPositions.push({ ...updatedPos });

      decisions.push({
        decision_date: today, sembol: pos.sembol, action: 'HOLD',
        shares: pos.shares, theoretical_price: current, cost_or_proceeds: 0,
        confluence_score: confNow, rel_vol5: posScan?.rel_vol5 ?? null,
        stop_loss: newStopLoss, reason_short: reason,
        signal_type: null,
      });
    }
  }

  totalValue = cash + positionsValue;

  // ── 6. Sektör dağılımı ─────────────────────────────────────────────
  const sectorMap = new Map<string, number>();
  for (const pos of remainingPositions) {
    const pv = (pos.current_price ?? pos.entry_price) * pos.shares;
    sectorMap.set(pos.sector_id, (sectorMap.get(pos.sector_id) ?? 0) + pv / totalValue);
  }

  // ── 7. Yeni pozisyon aç ────────────────────────────────────────────
  // Cross-portfolio: AI portföyde açık olan hisseler burada da açılmasın
  const { data: aiOpen } = await db
    .from('ai_portfolio_positions')
    .select('sembol')
    .eq('is_open', true);
  const aiOpenSet = new Set((aiOpen ?? []).map((p) => p.sembol));

  const health = apexHealthCheck(totalValue, cash, remainingPositions.length, sectorMap);
  let openedCount = 0;

  // Sektör başına pozisyon sayısı (konsantrasyon kontrolü)
  const sectorPositionCount = new Map<string, number>();
  for (const pos of remainingPositions) {
    const sid = pos.sector_id ?? 'diger';
    sectorPositionCount.set(sid, (sectorPositionCount.get(sid) ?? 0) + 1);
  }

  if (health.canBuy && !circuitBreakerActive && !drawdownBlockNew && !macroBlockNew) {
    for (const cand of candidates) {
      if (openedCount >= 2) break;
      if (!health.canBuy || cash < 3000) break;

      // Makro azaltılmış mod: toplam maks 2 pozisyon
      if (macroReducedMode && (remainingPositions.length + openedCount) >= 2) {
        console.log(`[apex] Makro azaltılmış mod — 2 pozisyon dolu, yeni giriş durduruldu`);
        break;
      }

      // Bu hissede zaten pozisyon var mı? (bu portföy + AI cross-check)
      if (remainingPositions.some((p) => p.sembol === cand.sembol)) continue;
      if (aiOpenSet.has(cand.sembol)) {
        console.log(`[apex] ${cand.sembol} AI portföyde açık — çakışma önlendi`);
        continue;
      }

      // Sektör limiti: %40 değer + maks 2 pozisyon aynı sektörde
      const sectorId = cand.sector ?? 'diger';
      if ((sectorMap.get(sectorId) ?? 0) >= 0.40) continue;
      if ((sectorPositionCount.get(sectorId) ?? 0) >= 2) {
        console.log(`[apex] ${cand.sembol} — sektör pozisyon limiti (maks 2)`);
        continue;
      }

      const rawSize  = apexPositionSize(cash, totalValue, cand.confluence_score, cand.rel_vol5, macroScore);
      const posSize  = rawSize * drawdownSizeMult;
      const capped   = Math.min(posSize, health.maxSize);
      if (capped < 1500) continue;

      const entryPrice = cand.last_close;
      if (!entryPrice || entryPrice <= 0) continue;

      const shares = Math.floor(capped / entryPrice);
      if (shares <= 0) continue;

      const cost = shares * entryPrice;
      const candAtr = getAtrFromSignals(cand.signals_json);
      const { stopLoss, trailingStop } = apexCalcLevels(entryPrice, candAtr);

      // Dominant sinyal tipi (win rate by setup)
      const sigType = getDominantSignalType(cand.signals_json);

      await db.from('apex_portfolio_positions').insert({
        sembol: cand.sembol, sector_id: sectorId, sector_name: cand.sector ?? 'Diğer',
        shares, entry_price: entryPrice, entry_date: today,
        current_price: entryPrice, stop_loss: stopLoss, trailing_stop: trailingStop,
        cost_basis: cost, is_open: true,
        entry_confluence: cand.confluence_score, entry_rel_vol5: cand.rel_vol5,
      });

      cash -= cost;
      positionsValue += cost;
      totalValue = cash + positionsValue;
      openedCount++;

      decisions.push({
        decision_date: today, sembol: cand.sembol, action: 'BUY',
        shares, theoretical_price: entryPrice, cost_or_proceeds: cost,
        confluence_score: cand.confluence_score, rel_vol5: cand.rel_vol5,
        stop_loss: stopLoss, signal_type: sigType,
        reason_short: `APEX GİRİŞ: conf ${cand.confluence_score}, relVol5 ${cand.rel_vol5.toFixed(1)}x${sigType ? ` [${sigType}]` : ''}, bugün ${cand.change_percent?.toFixed(1) ?? '?'}%`,
      });

      // Haritaları güncelle
      sectorMap.set(sectorId, (sectorMap.get(sectorId) ?? 0) + cost / totalValue);
      sectorPositionCount.set(sectorId, (sectorPositionCount.get(sectorId) ?? 0) + 1);
    }
  }

  // ── 8. Kararları kaydet ────────────────────────────────────────────
  if (decisions.length > 0) {
    await db.from('apex_portfolio_decisions').insert(decisions);
  }

  // ── 9. Günlük snapshot ────────────────────────────────────────────
  const prevSnap = await db
    .from('apex_portfolio_history')
    .select('total_value, total_return, max_drawdown')
    .order('snapshot_date', { ascending: false })
    .limit(1);

  const prevValue   = prevSnap.data?.[0]?.total_value ?? APEX_INITIAL_CAPITAL;
  const dailyReturn = ((totalValue - prevValue) / prevValue) * 100;
  const totalReturn = ((totalValue - APEX_INITIAL_CAPITAL) / APEX_INITIAL_CAPITAL) * 100;
  const prevMaxDD   = prevSnap.data?.[0]?.max_drawdown ?? 0;
  const maxDrawdown = Math.min(prevMaxDD, dailyReturn < 0 ? dailyReturn : 0);

  // 30 günlük win rate
  const { data: recent } = await db
    .from('apex_portfolio_decisions')
    .select('action, outcome_return')
    .in('action', ['SELL', 'ROTATE_OUT'])
    .gte('decision_date', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));

  const evaluated = (recent ?? []).filter((d) => d.outcome_return != null);
  const wins      = evaluated.filter((d) => (d.outcome_return ?? 0) > 0);
  const winRate   = evaluated.length > 0 ? (wins.length / evaluated.length) * 100 : null;

  await db.from('apex_portfolio_history').upsert({
    snapshot_date: today,
    total_value:  parseFloat(totalValue.toFixed(2)),
    cash:         parseFloat(cash.toFixed(2)),
    positions_value: parseFloat(positionsValue.toFixed(2)),
    daily_return: parseFloat(dailyReturn.toFixed(2)),
    total_return: parseFloat(totalReturn.toFixed(2)),
    max_drawdown: parseFloat(maxDrawdown.toFixed(2)),
    position_count: remainingPositions.length + openedCount,
    trades_today: openedCount + closedCount,
    win_rate_30d: winRate ? parseFloat(winRate.toFixed(1)) : null,
  }, { onConflict: 'snapshot_date' });

  console.log(`[APEX] ${today}: ${decisions.length} karar | +${openedCount} açıldı, ${closedCount} kapandı | ${totalValue.toFixed(0)}₺ | Makro: ${macroCtx}`);

  return NextResponse.json({
    ok: true, date: today,
    totalValue: totalValue.toFixed(2),
    cash: cash.toFixed(2),
    decisions: decisions.length,
    opened: openedCount, closed: closedCount,
    macroContext: macroCtx,
  });
}
