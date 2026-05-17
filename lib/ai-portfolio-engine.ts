/**
 * lib/ai-portfolio-engine.ts
 *
 * AI Portföy Karar Motoru — Agresif Momentum Stratejisi
 *
 * Felsefe: 100.000₺ ile diversifikasyon değil konsantrasyon.
 * Kaybedeni hızlı kes, kazananı sonuna kadar tut.
 * Yılda 3-5 büyük hareket yeterli.
 *
 * Kurallar:
 *  - Max 5 pozisyon (konsantrasyon)
 *  - Max tek pozisyon: %20 sermaye
 *  - Min nakit: %10 (agresif dağıtım)
 *  - Stop-loss: -%8 (sabit, disiplin)
 *  - KÂR ALMA YOK — trailing stop karar verir
 *  - Trailing: kâr büyüdükçe sıkılaşır
 *  - Makro kötüyse pozisyon küçülür
 */

export interface PortfolioPosition {
  id: string;
  sembol: string;
  sector_id: string;
  shares: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;   // artık kullanılmıyor, trailing belirler
  trailing_stop: number;
  cost_basis: number;
  current_price: number | null;
}

export interface MarketData {
  sembol: string;
  currentPrice: number | null;
  technicalScore: number | null;
  dipScore: number;
  investmentScore: number | null;
  weeklyAligned: boolean | null;
  sectorId: string;
  sectorName: string;
}

export type DecisionAction = 'BUY' | 'SELL' | 'HOLD' | 'PARTIAL_SELL';

export interface Decision {
  sembol: string;
  action: DecisionAction;
  shares: number;
  theoreticalPrice: number;
  reasonShort: string;
  factors: {
    dipScore: number;
    investmentScore: number | null;
    technicalScore: number | null;
    macroContext: string;
    trigger: string;
  };
}

export interface PortfolioState {
  totalValue: number;
  cash: number;
  positionsValue: number;
  positions: PortfolioPosition[];
}

export const INITIAL_CAPITAL   = 100_000;
export const MAX_POSITION_PCT  = 0.20;   // %20 max tek hisse (konsantrasyon)
export const MAX_SECTOR_PCT    = 0.35;   // %35 max tek sektör
export const MIN_CASH_PCT      = 0.10;   // %10 min nakit (agresif dağıtım)
export const MAX_POSITIONS     = 5;      // max 5 pozisyon aynı anda
export const STOP_LOSS_PCT     = 0.08;   // -%8 stop-loss (sabit disiplin)
export const MIN_SCORE_TO_HOLD = 40;     // teknik skor altında sat
export const MIN_ENTRY_SCORE   = 65;     // giriş için min confluence skoru

/**
 * Trailing stop seviyesini hesapla.
 * Kâr büyüdükçe trailing sıkılaşır — kazancı korur ama hareketi kesmez.
 *
 *  +%0–20   → -%8  trailing (geniş, hareket için yer ver)
 *  +%20–40  → -%15 trailing (kazanç büyüdü, biraz sık)
 *  +%40–60  → -%12 trailing
 *  +%60–100 → -%10 trailing
 *  +%100+   → -%8  trailing  (büyük kâr, artık sıkı koru)
 */
export function calcDynamicTrailingStop(
  entryPrice: number,
  currentPrice: number,
  currentStop: number,
): number {
  const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;

  let trailPct: number;
  if (returnPct >= 100) trailPct = 0.08;
  else if (returnPct >= 60) trailPct = 0.10;
  else if (returnPct >= 40) trailPct = 0.12;
  else if (returnPct >= 20) trailPct = 0.15;
  else trailPct = 0.08; // henüz küçük kâr, geniş tut

  const newStop = currentPrice * (1 - trailPct);
  // Stop sadece yukarı çekilir, aşağı inemez
  return Math.max(currentStop, newStop);
}

/**
 * Kelly Criterion bazlı pozisyon büyüklüğü.
 * Makro skora göre ölçeklenir.
 */
export function calcPositionSize(
  availableCash: number,
  totalPortfolioValue: number,
  winRate: number = 0.62,
  avgRR: number = 3.0,    // trailing ile daha yüksek R/R beklentisi
  dipScore: number = 30,
  macroScore: number = 0,
): number {
  // Kelly: f* = (bp - q) / b
  const kellyFraction = (avgRR * winRate - (1 - winRate)) / avgRR;
  const halfKelly = kellyFraction * 0.5;

  // Dip skoru çarpanı
  const scoreMult = dipScore >= 60 ? 1.0 : dipScore >= 45 ? 0.80 : 0.60;

  // Makro çarpanı: makro kötüyse küçük pozisyon, iyiyse tam gaz
  const macroMult = macroScore >= 30 ? 1.2
    : macroScore >= 0  ? 1.0
    : macroScore >= -30 ? 0.70
    : 0.40; // makro çok kötü, çok küçük poz

  const fraction = Math.min(halfKelly * scoreMult * macroMult, MAX_POSITION_PCT);
  return Math.min(availableCash * 0.95, totalPortfolioValue * fraction);
}

/**
 * Mevcut pozisyon için karar ver.
 * Kâr alma yok — trailing stop karar verir.
 */
export function evaluatePosition(
  pos: PortfolioPosition,
  market: MarketData,
  totalValue: number,
): { action: DecisionAction; reasonShort: string; trigger: string } {
  const cp = market.currentPrice ?? pos.current_price ?? pos.entry_price;
  const returnPct = ((cp - pos.entry_price) / pos.entry_price) * 100;
  const techScore = market.technicalScore ?? 50;

  // 1. Stop-loss — -%8 disiplini boz ma
  if (returnPct <= -(STOP_LOSS_PCT * 100)) {
    return {
      action: 'SELL',
      reasonShort: `Stop-loss: ${returnPct.toFixed(1)}% zarar — hızlı kes`,
      trigger: 'stop_loss',
    };
  }

  // 2. Fiyat stop seviyesinin altına düştü
  if (cp <= pos.stop_loss) {
    return {
      action: 'SELL',
      reasonShort: `Stop fiyatı (${pos.stop_loss.toFixed(2)}₺) kırıldı — çık`,
      trigger: 'stop_loss',
    };
  }

  // 3. Trailing stop tetiklendi (kâr koruma)
  if (returnPct >= 10 && cp <= pos.trailing_stop) {
    return {
      action: 'SELL',
      reasonShort: `Trailing stop: ${returnPct.toFixed(1)}% kazanımla kâr kilitlendi`,
      trigger: 'trailing_stop',
    };
  }

  // 4. Teknik sinyal çöktü ve zarardayız → erken çık
  if (techScore < MIN_SCORE_TO_HOLD && returnPct < -3) {
    return {
      action: 'SELL',
      reasonShort: `Teknik skor ${techScore} + ${returnPct.toFixed(1)}% zarar — riski kes`,
      trigger: 'signal_weak',
    };
  }

  // 5. Haftalık trend bozuldu ve -%5'in altında
  if (market.weeklyAligned === false && returnPct < -5) {
    return {
      action: 'SELL',
      reasonShort: `Haftalık trend bozuldu + ${returnPct.toFixed(1)}% zarar`,
      trigger: 'mtf_breakdown',
    };
  }

  // 6. Tut — kâr al yok, momentum devam etsin
  const holdMsg = returnPct >= 50
    ? `+${returnPct.toFixed(1)}% kârda, momentum güçlü — tutmaya devam`
    : returnPct >= 20
    ? `+${returnPct.toFixed(1)}% kâr, trailing sıkılaşıyor — tut`
    : returnPct > 0
    ? `+${returnPct.toFixed(1)}% kârda, teknik ${techScore} — tut`
    : `${returnPct.toFixed(1)}% — teknik ${techScore}, stop uzak — tut`;

  return { action: 'HOLD', reasonShort: holdMsg, trigger: 'hold' };
}

/**
 * Yeni pozisyon için giriş seviyeleri.
 * Take-profit kaldırıldı, sadece stop ve trailing başlangıç.
 */
export function calcLevels(entryPrice: number, atr?: number | null): {
  stopLoss: number;
  takeProfit: number;   // backward compat için tutuldu, trailing kullanılır
  trailingStop: number;
} {
  const stopDist = atr
    ? Math.min(atr * 2.0, entryPrice * STOP_LOSS_PCT)
    : entryPrice * STOP_LOSS_PCT;

  return {
    stopLoss:     parseFloat((entryPrice - stopDist).toFixed(2)),
    takeProfit:   parseFloat((entryPrice * 1.50).toFixed(2)), // referans, kullanılmaz
    trailingStop: parseFloat((entryPrice * (1 - STOP_LOSS_PCT)).toFixed(2)),
  };
}

/**
 * Sektör dağılımını hesapla
 */
export function calcSectorExposure(
  positions: PortfolioPosition[],
  totalValue: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const pos of positions) {
    const pv = (pos.current_price ?? pos.entry_price) * pos.shares;
    map.set(pos.sector_id, (map.get(pos.sector_id) ?? 0) + pv / totalValue);
  }
  return map;
}

/**
 * Portföy sağlık kontrolü
 */
export function portfolioHealthCheck(state: PortfolioState): {
  cashPct: number;
  positionPct: number;
  canBuy: boolean;
  maxNewPosition: number;
  warnings: string[];
} {
  const cashPct = state.cash / state.totalValue;
  const warnings: string[] = [];

  if (cashPct < 0.05) warnings.push('Kritik nakit (<%5) — yeni alım yok');
  if (state.positions.length >= MAX_POSITIONS) warnings.push(`Maks pozisyon (${MAX_POSITIONS}) doldu`);

  const canBuy = cashPct > MIN_CASH_PCT && state.positions.length < MAX_POSITIONS;
  const maxNewPosition = Math.min(
    state.cash - state.totalValue * MIN_CASH_PCT,
    state.totalValue * MAX_POSITION_PCT,
  );

  return {
    cashPct,
    positionPct: state.positionsValue / state.totalValue,
    canBuy,
    maxNewPosition: Math.max(0, maxNewPosition),
    warnings,
  };
}
