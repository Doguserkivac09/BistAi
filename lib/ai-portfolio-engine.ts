/**
 * lib/ai-portfolio-engine.ts
 *
 * AI Portföy Karar Motoru — Profesyonel Risk Yönetimi ile
 *
 * Sabit Kurallar:
 *  - Başlangıç: 100.000₺ nakit
 *  - Max tek pozisyon: %12 (sermayenin)
 *  - Max tek sektör: %25
 *  - Min nakit: %20 (yeni fırsat için)
 *  - Stop-loss: -%8 (ATR bazlı sıkılaştırılabilir)
 *  - Kâr alma: +%15'te %50 çıkış, +%25'te tam çıkış
 *  - Trailing stop: Her +%5'te stop %3 yukarı
 */

export interface PortfolioPosition {
  id: string;
  sembol: string;
  sector_id: string;
  shares: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
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

const INITIAL_CAPITAL = 100_000;
const MAX_POSITION_PCT = 0.12;  // %12 max tek hisse
const MAX_SECTOR_PCT   = 0.25;  // %25 max tek sektör
const MIN_CASH_PCT     = 0.20;  // %20 min nakit
const STOP_LOSS_PCT    = 0.08;  // -%8 stop-loss
const TAKE_PROFIT_PCT  = 0.15;  // +%15 kâr al (yarı çıkış)
const FULL_EXIT_PCT    = 0.25;  // +%25 tam çıkış
const TRAILING_STEP    = 0.05;  // +%5'te trailing aktif
const MIN_SCORE_TO_HOLD = 45;   // Bu altına düşünce sat

/**
 * Kelly Criterion bazlı pozisyon büyüklüğü
 * Basitleştirilmiş versiyon: win_rate ve avg R/R bazlı
 */
export function calcPositionSize(
  availableCash: number,
  totalPortfolioValue: number,
  winRate: number = 0.60,
  avgRR: number = 2.0,
  dipScore: number = 30,
): number {
  // Kelly: f* = (bp - q) / b  — b=RR, p=winRate, q=1-p
  const kellyFraction = (avgRR * winRate - (1 - winRate)) / avgRR;
  // Tam Kelly çok agresif → yarı Kelly kullan
  const halfKelly = kellyFraction * 0.5;

  // Dip skoruna göre ek ayar (yüksek skor = daha büyük pozisyon)
  const scoreMult = dipScore >= 50 ? 1.0 : dipScore >= 35 ? 0.75 : 0.5;

  // Pozisyon büyüklüğü = min(Kelly, MaxPosisyon) × toplam portföy
  const fraction = Math.min(halfKelly * scoreMult, MAX_POSITION_PCT);
  return Math.min(availableCash * 0.95, totalPortfolioValue * fraction);
}

/**
 * Mevcut pozisyon için karar ver
 */
export function evaluatePosition(
  pos: PortfolioPosition,
  market: MarketData,
  totalValue: number,
): { action: DecisionAction; reasonShort: string; trigger: string } {
  const cp = market.currentPrice ?? pos.current_price ?? pos.entry_price;
  const returnPct = ((cp - pos.entry_price) / pos.entry_price) * 100;
  const techScore = market.technicalScore ?? 50;

  // 1. Stop-loss kontrolü
  if (cp <= pos.stop_loss || returnPct <= -(STOP_LOSS_PCT * 100)) {
    return {
      action: 'SELL',
      reasonShort: `Stop-loss tetiklendi (${returnPct.toFixed(1)}% zarar)`,
      trigger: 'stop_loss',
    };
  }

  // 2. Trailing stop güncelleme (kâr koruma)
  if (returnPct >= 10 && cp <= pos.trailing_stop) {
    return {
      action: 'SELL',
      reasonShort: `Trailing stop tetiklendi (+${returnPct.toFixed(1)}% kazanımdan geri çekilme)`,
      trigger: 'trailing_stop',
    };
  }

  // 3. Tam kâr alma
  if (returnPct >= FULL_EXIT_PCT * 100) {
    return {
      action: 'SELL',
      reasonShort: `Hedef aşıldı: +${returnPct.toFixed(1)}% — tam çıkış`,
      trigger: 'full_take_profit',
    };
  }

  // 4. Yarı kâr alma (+%15 üstünde)
  if (returnPct >= TAKE_PROFIT_PCT * 100) {
    return {
      action: 'PARTIAL_SELL',
      reasonShort: `+${returnPct.toFixed(1)}% kazanımda yarı kâr alıyorum`,
      trigger: 'partial_take_profit',
    };
  }

  // 5. Zayıf teknik sinyal
  if (techScore < MIN_SCORE_TO_HOLD && returnPct >= -3) {
    return {
      action: 'SELL',
      reasonShort: `Teknik skor düştü (${techScore}) — sermayeyi daha güçlü fırsata taşı`,
      trigger: 'signal_weak',
    };
  }

  // 6. Haftalık trend uyumu kayboldu + -%5'ten fazla zarar
  if (market.weeklyAligned === false && returnPct < -5) {
    return {
      action: 'SELL',
      reasonShort: `MTF uyumu kayboldu + ${returnPct.toFixed(1)}% zarar — riski kes`,
      trigger: 'mtf_breakdown',
    };
  }

  // 7. Tut
  const holdReason = returnPct > 0
    ? `+${returnPct.toFixed(1)}% kârdayız, teknik ${techScore} güçlü — tut`
    : `${returnPct.toFixed(1)}% — teknik hala ${techScore}, pozisyonu koru`;

  return {
    action: 'HOLD',
    reasonShort: holdReason,
    trigger: 'hold',
  };
}

/**
 * Trailing stop seviyesini güncelle
 */
export function updateTrailingStop(
  entryPrice: number,
  currentPrice: number,
  currentStop: number,
): number {
  const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  // Her +%5 kazanımda, stop %3 yukarı çek
  const steps = Math.floor(returnPct / TRAILING_STEP / 100);
  if (steps <= 0) return currentStop;
  const newStop = entryPrice * (1 + steps * 0.03);
  return Math.max(currentStop, newStop);
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
 * Yeni pozisyon için stop/take-profit seviyelerini hesapla
 * ATR bazlı (ATR yoksa fiyat × sabit oran)
 */
export function calcLevels(entryPrice: number, atr?: number | null): {
  stopLoss: number;
  takeProfit: number;
  trailingStop: number;
} {
  const riskMultiplier = atr ? Math.min(atr * 2.5, entryPrice * STOP_LOSS_PCT) : entryPrice * STOP_LOSS_PCT;
  return {
    stopLoss:      parseFloat((entryPrice - riskMultiplier).toFixed(2)),
    takeProfit:    parseFloat((entryPrice * (1 + TAKE_PROFIT_PCT)).toFixed(2)),
    trailingStop:  parseFloat((entryPrice * 0.97).toFixed(2)), // başlangıç: -%3
  };
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
  const positionPct = state.positionsValue / state.totalValue;
  const warnings: string[] = [];

  if (cashPct < 0.10) warnings.push('Kritik düşük nakit (<%10)');
  if (cashPct < MIN_CASH_PCT) warnings.push(`Nakit <%${MIN_CASH_PCT * 100} — yeni alım kısıtlı`);
  if (state.positions.length >= 8) warnings.push('Maksimum pozisyon sayısına yakın (8)');

  const canBuy = cashPct > MIN_CASH_PCT && state.positions.length < 8;
  const maxNewPosition = Math.min(
    state.cash * (1 - MIN_CASH_PCT),
    state.totalValue * MAX_POSITION_PCT,
  );

  return { cashPct, positionPct, canBuy, maxNewPosition, warnings };
}

export { INITIAL_CAPITAL, MAX_POSITION_PCT, STOP_LOSS_PCT, TAKE_PROFIT_PCT };
