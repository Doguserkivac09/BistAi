/**
 * AI Portföy — Haftalık Karar Cron
 *
 * GET /api/cron/ai-portfolio
 * Schedule: Her Pazartesi 06:00 UTC (09:00 TRT)
 *
 * Akış:
 *  1. Mevcut açık pozisyonları çek
 *  2. Her pozisyon için karar ver (SAT/TUT/PARTIAL_SELL)
 *  3. Satış kararlarını uygula → nakit güncelle
 *  4. Yeni fırsatları değerlendir (weekly_picks)
 *  5. Uygun yeni pozisyonlar al
 *  6. Kararları + gerekçeleri kaydet
 *  7. Portföy snapshot al
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import {
  evaluatePosition,
  calcPositionSize,
  calcLevels,
  updateTrailingStop,
  calcSectorExposure,
  portfolioHealthCheck,
  type PortfolioPosition,
  type MarketData,
  INITIAL_CAPITAL,
  MAX_POSITION_PCT,
} from '@/lib/ai-portfolio-engine';

const CRON_SECRET = process.env.CRON_SECRET;

function createAdmin() {
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

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdmin();
  const now = new Date();
  const { week: weekNumber, year } = getISOWeek(now);

  // Bu hafta zaten karar verildi mi?
  const { data: existingDecisions } = await admin
    .from('ai_portfolio_decisions')
    .select('id')
    .eq('week_number', weekNumber)
    .eq('year', year)
    .limit(1);

  if (existingDecisions && existingDecisions.length > 0) {
    return NextResponse.json({ ok: true, message: `Hafta ${weekNumber}/${year} kararı zaten verilmiş`, skipped: true });
  }

  // ── 1. Son portföy durumunu çek ────────────────────────────────────
  const { data: lastSnapshot } = await admin
    .from('ai_portfolio_history')
    .select('*')
    .order('year', { ascending: false })
    .order('week_number', { ascending: false })
    .limit(1);

  let currentCash = lastSnapshot?.[0]?.cash ?? INITIAL_CAPITAL;
  let totalValue  = lastSnapshot?.[0]?.total_value ?? INITIAL_CAPITAL;

  // ── 2. Açık pozisyonları çek ────────────────────────────────────────
  const { data: openPositions } = await admin
    .from('ai_portfolio_positions')
    .select('*')
    .eq('is_open', true);

  const positions: PortfolioPosition[] = (openPositions ?? []).map((p) => ({
    id: p.id,
    sembol: p.sembol,
    sector_id: p.sector_id ?? 'diger',
    shares: p.shares,
    entry_price: p.entry_price,
    stop_loss: p.stop_loss,
    take_profit: p.take_profit,
    trailing_stop: p.trailing_stop,
    cost_basis: p.cost_basis,
    current_price: p.current_price,
  }));

  // ── 3. Scan cache'den güncel fiyat + teknik skor ────────────────────
  const semboller = positions.map((p) => p.sembol);
  const { data: scanData } = semboller.length > 0 ? await admin
    .from('scan_cache')
    .select('sembol, confluence_score, last_close, signals_json')
    .in('sembol', semboller) : { data: [] };

  const scanMap = new Map((scanData ?? []).map((r) => [r.sembol, r]));

  // ── 4. Makro bağlam ─────────────────────────────────────────────────
  const macroFull = await getMacroFull().catch(() => null);
  const macroScore = macroFull?.macroScore?.score ?? 0;
  const macroContext = macroScore > 20 ? 'pozitif' : macroScore < -20 ? 'negatif' : 'nötr';

  const decisions: Array<{
    week_number: number; year: number; sembol: string; action: string;
    shares: number | null; theoretical_price: number; cost_or_proceeds: number;
    dip_score: number | null; investment_score: number | null; technical_score: number | null;
    macro_context: string; reason_short: string;
  }> = [];

  let closedCount = 0;
  let positionsValue = 0;

  // ── 5. Mevcut pozisyonları değerlendir ──────────────────────────────
  for (const pos of positions) {
    const scan = scanMap.get(pos.sembol);
    const currentPrice = scan?.last_close ?? pos.current_price ?? pos.entry_price;
    const techScore = scan?.confluence_score ?? null;

    // Trailing stop güncelle
    const newTrailing = updateTrailingStop(pos.entry_price, currentPrice, pos.trailing_stop);
    if (newTrailing > pos.trailing_stop) {
      await admin.from('ai_portfolio_positions').update({ trailing_stop: newTrailing }).eq('id', pos.id);
    }

    const market: MarketData = {
      sembol: pos.sembol,
      currentPrice,
      technicalScore: techScore,
      dipScore: 30, // mevcut pozisyon için dip skoru artık önemli değil
      investmentScore: null,
      weeklyAligned: null,
      sectorId: pos.sector_id,
      sectorName: '',
    };

    const decision = evaluatePosition(pos, market, totalValue);

    if (decision.action === 'SELL') {
      const proceeds = pos.shares * currentPrice;
      const pnl = proceeds - pos.cost_basis;
      const pnlPct = (pnl / pos.cost_basis) * 100;

      // Pozisyonu kapat
      await admin.from('ai_portfolio_positions').update({
        is_open: false,
        closed_at: now.toISOString(),
        close_price: currentPrice,
        close_reason: decision.trigger,
        realized_pnl: parseFloat(pnl.toFixed(2)),
        realized_pnl_pct: parseFloat(pnlPct.toFixed(2)),
        current_price: currentPrice,
      }).eq('id', pos.id);

      currentCash += proceeds;
      closedCount++;

      decisions.push({
        week_number: weekNumber, year,
        sembol: pos.sembol,
        action: 'SELL',
        shares: pos.shares,
        theoretical_price: currentPrice,
        cost_or_proceeds: proceeds,
        dip_score: null,
        investment_score: null,
        technical_score: techScore,
        macro_context: macroContext,
        reason_short: decision.reasonShort,
      });

    } else if (decision.action === 'PARTIAL_SELL') {
      const sellShares = Math.floor(pos.shares * 0.5);
      if (sellShares > 0) {
        const proceeds = sellShares * currentPrice;
        currentCash += proceeds;

        await admin.from('ai_portfolio_positions').update({
          shares: pos.shares - sellShares,
          cost_basis: (pos.shares - sellShares) * pos.entry_price,
          current_price: currentPrice,
        }).eq('id', pos.id);

        decisions.push({
          week_number: weekNumber, year,
          sembol: pos.sembol,
          action: 'PARTIAL_SELL',
          shares: sellShares,
          theoretical_price: currentPrice,
          cost_or_proceeds: proceeds,
          dip_score: null,
          investment_score: null,
          technical_score: techScore,
          macro_context: macroContext,
          reason_short: decision.reasonShort,
        });

        positionsValue += (pos.shares - sellShares) * currentPrice;
      }
    } else {
      // HOLD — fiyatı güncelle
      await admin.from('ai_portfolio_positions').update({ current_price: currentPrice }).eq('id', pos.id);
      positionsValue += pos.shares * currentPrice;

      decisions.push({
        week_number: weekNumber, year,
        sembol: pos.sembol,
        action: 'HOLD',
        shares: pos.shares,
        theoretical_price: currentPrice,
        cost_or_proceeds: 0,
        dip_score: null,
        investment_score: null,
        technical_score: techScore,
        macro_context: macroContext,
        reason_short: decision.reasonShort,
      });
    }
  }

  // ── 6. Portföy sağlık kontrolü ──────────────────────────────────────
  totalValue = currentCash + positionsValue;
  const remainingPositions = positions.filter((p) => {
    // Satılanları çıkar
    return !decisions.some((d) => d.sembol === p.sembol && d.action === 'SELL');
  });

  const health = portfolioHealthCheck({
    totalValue, cash: currentCash, positionsValue,
    positions: remainingPositions,
  });

  // ── 7. Yeni fırsatlar — weekly_picks'ten ────────────────────────────
  let openedCount = 0;

  if (health.canBuy && macroScore > -30) {
    const { data: weeklyPicks } = await admin
      .from('weekly_picks')
      .select('sembol, sector_id, sector_name, entry_price, confluence_score, notes')
      .eq('week_number', weekNumber)
      .eq('year', year)
      .eq('is_closed', false)
      .order('created_at', { ascending: false });

    const sectorExposure = calcSectorExposure(remainingPositions, totalValue);
    const openedSectors = new Set(remainingPositions.map((p) => p.sector_id));

    for (const pick of weeklyPicks ?? []) {
      if (openedCount >= 3) break;
      if (!health.canBuy || currentCash < 3000) break;

      // Zaten bu hissede pozisyon var mı?
      if (remainingPositions.some((p) => p.sembol === pick.sembol)) continue;

      // Sektör limiti
      const sectorExp = sectorExposure.get(pick.sector_id ?? '') ?? 0;
      if (sectorExp >= 0.25) continue;

      // Dip skorunu notes'tan çıkar
      const dipMatch = (pick.notes ?? '').match(/Dip Skor: (\d+)/);
      const dipScore = dipMatch ? parseInt(dipMatch[1]) : 30;

      const positionSize = calcPositionSize(currentCash, totalValue, 0.60, 2.0, dipScore);
      const cappedSize = Math.min(positionSize, health.maxNewPosition);
      if (cappedSize < 1000) continue;

      const entryPrice = pick.entry_price ?? 0;
      if (entryPrice <= 0) continue;

      const shares = Math.floor(cappedSize / entryPrice);
      if (shares <= 0) continue;

      const cost = shares * entryPrice;
      const { stopLoss, takeProfit, trailingStop } = calcLevels(entryPrice);

      // Pozisyonu aç
      await admin.from('ai_portfolio_positions').insert({
        sembol: pick.sembol,
        sector_id: pick.sector_id,
        sector_name: pick.sector_name,
        shares,
        entry_price: entryPrice,
        entry_week: weekNumber,
        entry_year: year,
        current_price: entryPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        trailing_stop: trailingStop,
        cost_basis: cost,
        is_open: true,
      });

      currentCash -= cost;
      positionsValue += cost;
      totalValue = currentCash + positionsValue;
      openedCount++;

      const reasonShort = dipScore >= 45
        ? `Güçlü Dip Katılım (${dipScore}). Birikim fazında, taze sinyal.`
        : `Weekly picks seçimi — ${pick.sector_name} sektörü, momentum güçlü.`;

      decisions.push({
        week_number: weekNumber, year,
        sembol: pick.sembol,
        action: 'BUY',
        shares,
        theoretical_price: entryPrice,
        cost_or_proceeds: cost,
        dip_score: dipScore,
        investment_score: null,
        technical_score: pick.confluence_score,
        macro_context: macroContext,
        reason_short: reasonShort,
      });
    }
  }

  // ── 8. Kararları kaydet ─────────────────────────────────────────────
  if (decisions.length > 0) {
    await admin.from('ai_portfolio_decisions').insert(decisions);
  }

  // ── 9. Haftalık snapshot ─────────────────────────────────────────────
  const { data: prevSnapshot } = await admin
    .from('ai_portfolio_history')
    .select('total_value, total_return, total_bist_return, max_drawdown')
    .order('year', { ascending: false })
    .order('week_number', { ascending: false })
    .limit(1);

  const prevValue = prevSnapshot?.[0]?.total_value ?? INITIAL_CAPITAL;
  const weeklyReturn = ((totalValue - prevValue) / prevValue) * 100;
  const totalReturn = ((totalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  const prevTotalReturn = prevSnapshot?.[0]?.total_return ?? 0;
  const maxDrawdown = Math.min(prevSnapshot?.[0]?.max_drawdown ?? 0, weeklyReturn < 0 ? weeklyReturn : 0);

  await admin.from('ai_portfolio_history').upsert({
    week_number: weekNumber,
    year,
    total_value: parseFloat(totalValue.toFixed(2)),
    cash: parseFloat(currentCash.toFixed(2)),
    positions_value: parseFloat(positionsValue.toFixed(2)),
    weekly_return: parseFloat(weeklyReturn.toFixed(2)),
    total_return: parseFloat(totalReturn.toFixed(2)),
    max_drawdown: parseFloat(maxDrawdown.toFixed(2)),
    position_count: remainingPositions.length + openedCount,
    closed_this_week: closedCount,
    opened_this_week: openedCount,
  }, { onConflict: 'week_number,year' });

  console.log(`[ai-portfolio] Hafta ${weekNumber}/${year}: ${decisions.length} karar | +${openedCount} açıldı, ${closedCount} kapandı | Portföy: ${totalValue.toFixed(0)}₺`);

  return NextResponse.json({
    ok: true,
    week: weekNumber,
    year,
    totalValue: totalValue.toFixed(2),
    cash: currentCash.toFixed(2),
    decisions: decisions.length,
    opened: openedCount,
    closed: closedCount,
    macroContext,
  });
}
