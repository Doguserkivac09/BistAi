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
  apexHealthCheck,
  APEX_INITIAL_CAPITAL, APEX_MIN_CONFLUENCE, APEX_MIN_REL_VOL,
  type ApexPosition,
} from '@/lib/apex-engine';
import { bistGuard } from '@/lib/bist-guard';

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
  }));

  // ── 3. scan_cache: bugünün fırsatları ─────────────────────────────
  const { data: scanRows } = await db
    .from('scan_cache')
    .select('sembol, confluence_score, rel_vol5, last_close, change_percent, signals_json, sector')
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

  // scan_cache map (güncel fiyat + confluence)
  const scanMap = new Map((scanRows ?? []).map((r) => [r.sembol, r]));
  const allScanMap = new Map<string, { confluence_score: number; rel_vol5: number; last_close: number }>();
  for (const r of scanRows ?? []) allScanMap.set(r.sembol, r);

  const decisions: Array<{
    decision_date: string; sembol: string; action: string;
    shares: number | null; theoretical_price: number; cost_or_proceeds: number;
    confluence_score: number | null; rel_vol5: number | null;
    stop_loss: number | null; reason_short: string;
  }> = [];

  let closedCount = 0;
  let positionsValue = 0;
  const remainingPositions: ApexPosition[] = [];

  // ── 5. Mevcut pozisyonları değerlendir ────────────────────────────
  for (const pos of positions) {
    const scan    = scanMap.get(pos.sembol);
    const current = scan?.last_close ?? pos.current_price ?? pos.entry_price;
    const confNow = scan?.confluence_score ?? null;

    // Trailing stop güncelle
    const newTrailing = apexTrailingStop(pos.entry_price, current, pos.trailing_stop);
    if (newTrailing > pos.trailing_stop) {
      await db.from('apex_portfolio_positions')
        .update({ trailing_stop: newTrailing, current_price: current })
        .eq('id', pos.id);
    }

    const { action, reason } = apexEvaluatePosition(pos, current, confNow, scan?.rel_vol5 ?? null, bestOpp);

    if (action === 'SELL' || action === 'ROTATE_OUT') {
      const proceeds = pos.shares * current;
      const pnl      = proceeds - pos.cost_basis;
      const pnlPct   = (pnl / pos.cost_basis) * 100;
      const daysHeld = Math.floor((now.getTime() - new Date(pos.id).getTime()) / 86_400_000);

      await db.from('apex_portfolio_positions').update({
        is_open: false, closed_at: now.toISOString(),
        close_price: current, close_reason: action.toLowerCase(),
        realized_pnl: parseFloat(pnl.toFixed(2)),
        realized_pnl_pct: parseFloat(pnlPct.toFixed(2)),
        current_price: current,
      }).eq('id', pos.id);

      cash += proceeds;
      closedCount++;

      decisions.push({
        decision_date: today, sembol: pos.sembol, action,
        shares: pos.shares, theoretical_price: current, cost_or_proceeds: proceeds,
        confluence_score: confNow, rel_vol5: scan?.rel_vol5 ?? null,
        stop_loss: pos.stop_loss, reason_short: reason,
      });
    } else {
      // HOLD
      await db.from('apex_portfolio_positions')
        .update({ current_price: current })
        .eq('id', pos.id);
      positionsValue += pos.shares * current;
      remainingPositions.push({ ...pos, trailing_stop: newTrailing });

      decisions.push({
        decision_date: today, sembol: pos.sembol, action: 'HOLD',
        shares: pos.shares, theoretical_price: current, cost_or_proceeds: 0,
        confluence_score: confNow, rel_vol5: scan?.rel_vol5 ?? null,
        stop_loss: pos.stop_loss, reason_short: reason,
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

  if (health.canBuy && !circuitBreakerActive && !drawdownBlockNew) {
    for (const cand of candidates) {
      if (openedCount >= 2) break;
      if (!health.canBuy || cash < 3000) break;

      // Bu hissede zaten pozisyon var mı? (bu portföy + AI cross-check)
      if (remainingPositions.some((p) => p.sembol === cand.sembol)) continue;
      if (aiOpenSet.has(cand.sembol)) {
        console.log(`[apex] ${cand.sembol} AI portföyde açık — çakışma önlendi`);
        continue;
      }

      // Sektör limiti (%40)
      if ((sectorMap.get(cand.sector ?? 'diger') ?? 0) >= 0.40) continue;

      const rawSize  = apexPositionSize(cash, totalValue, cand.confluence_score, cand.rel_vol5, macroScore);
      const posSize  = rawSize * drawdownSizeMult; // drawdown varsa küçült
      const capped   = Math.min(posSize, health.maxSize);
      if (capped < 1500) continue;

      const entryPrice = cand.last_close;
      if (!entryPrice || entryPrice <= 0) continue;

      const shares = Math.floor(capped / entryPrice);
      if (shares <= 0) continue;

      const cost = shares * entryPrice;
      const { stopLoss, trailingStop } = apexCalcLevels(entryPrice);

      await db.from('apex_portfolio_positions').insert({
        sembol: cand.sembol, sector_id: cand.sector ?? 'diger', sector_name: cand.sector ?? 'Diğer',
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
        stop_loss: stopLoss,
        reason_short: `APEX GİRİŞ: conf ${cand.confluence_score}, relVol5 ${cand.rel_vol5.toFixed(1)}x, bugün ${cand.change_percent?.toFixed(1) ?? '?'}%`,
      });

      // Sektör haritasını güncelle
      sectorMap.set(cand.sector ?? 'diger', (sectorMap.get(cand.sector ?? 'diger') ?? 0) + cost / totalValue);
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
