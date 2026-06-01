/**
 * APEX-US Engine — ABD Borsası Agresif Momentum
 *
 * BIST apex-engine.ts'ten farklar:
 *  - Başlangıç sermayesi: $2.000 USD
 *  - Max pozisyon: portföyün %50'si
 *  - Stop aralığı: [%3, %10] (BIST %4-%9)
 *  - Locked-in basamaklar gevşetildi (US daha volatil)
 *  - Min pozisyon değeri: $50
 *  - Haber fiyatlandırma-in faktörü entegre
 *
 * Paylaşılan logic (apex-engine.ts'ten import):
 *  apexSignalHealth, apexEvaluatePosition, apexTrailingStop
 */

// ── Paylaşılan tip ve fonksiyonları import et ────────────────────────────────

export type {
  ApexPosition, SignalContext, SignalHealth, ApexEvalResult,
} from './apex-engine';

export {
  apexSignalHealth,
  apexEvaluatePosition,
  apexTrailingStop,
} from './apex-engine';

// ── US Sabitleri ─────────────────────────────────────────────────────────────

export const APEX_US_INITIAL_CAPITAL  = 2_000;   // $2,000
export const APEX_US_MAX_POSITION_PCT = 0.50;    // %50 — daha agresif
export const APEX_US_MAX_POSITIONS    = 4;
export const APEX_US_MIN_CASH_PCT     = 0.10;    // %10 min nakit
export const APEX_US_STOP_LOSS_PCT    = 0.07;    // -%7 fallback
export const APEX_US_MIN_CONFLUENCE   = 75;
export const APEX_US_MIN_REL_VOL      = 3.0;
export const APEX_US_ROTATION_THRESH  = 45;
export const APEX_US_MIN_POSITION_USD = 50;      // $50 minimum

// US Locked-in kâr basamakları (BIST'ten daha gevşek — US daha volatil)
export const APEX_US_LOCK_BREAKEVEN_AT = 0.04;   // +%4  → break-even
export const APEX_US_LOCK_1_AT         = 0.12;   // +%12 → +%6 kilitle
export const APEX_US_LOCK_1_FLOOR      = 0.06;
export const APEX_US_LOCK_2_AT         = 0.25;   // +%25 → +%14 kilitle
export const APEX_US_LOCK_2_FLOOR      = 0.14;
export const APEX_US_LOCK_3_AT         = 0.40;   // +%40 → +%22 kilitle
export const APEX_US_LOCK_3_FLOOR      = 0.22;

// ── US Fonksiyonları ─────────────────────────────────────────────────────────

/** US giriş seviyeleri — ATR aralığı [%3, %10] */
export function apexUSCalcLevels(entryPrice: number, atr?: number | null) {
  const stopDist = atr && atr > 0
    ? Math.min(Math.max(atr * 2.0, entryPrice * 0.03), entryPrice * 0.10)
    : entryPrice * APEX_US_STOP_LOSS_PCT;
  return {
    stopLoss:     parseFloat((entryPrice - stopDist).toFixed(4)),
    trailingStop: parseFloat((entryPrice - stopDist).toFixed(4)),
  };
}

/** US kilitli kâr stop zemini */
export function calcUSLockedStopFloor(entryPrice: number, ret: number): number | null {
  if (ret >= APEX_US_LOCK_3_AT * 100) return entryPrice * (1 + APEX_US_LOCK_3_FLOOR);
  if (ret >= APEX_US_LOCK_2_AT * 100) return entryPrice * (1 + APEX_US_LOCK_2_FLOOR);
  if (ret >= APEX_US_LOCK_1_AT * 100) return entryPrice * (1 + APEX_US_LOCK_1_FLOOR);
  if (ret >= APEX_US_LOCK_BREAKEVEN_AT * 100) return entryPrice;
  return null;
}

/** US agresif Kelly — %50 max, R/R 3.0 */
export function apexUSPositionSize(
  availableCash: number,
  totalValue:    number,
  confluence:    number,
  relVol5:       number,
  macroScore:    number,
): number {
  const winRate = 0.60;
  const rr      = 3.0;
  const kelly   = (rr * winRate - (1 - winRate)) / rr;
  const aggressiveKelly = kelly * 1.6; // 1.6× (daha agresif)

  const confMult  = Math.min(1.4, 1.0 + (confluence - 75) / 50);
  const volMult   = Math.min(1.4, 1.0 + (relVol5 - APEX_US_MIN_REL_VOL) * 0.07);
  const macroMult = macroScore < -30 ? 0.5 : macroScore < -10 ? 0.7 : 1.0;

  const fraction = Math.min(
    aggressiveKelly * confMult * volMult * macroMult,
    APEX_US_MAX_POSITION_PCT,
  );
  return Math.min(availableCash * 0.97, totalValue * fraction);
}

/** US portföy sağlık kontrolü */
export function apexUSHealthCheck(
  totalValue:    number,
  cash:          number,
  positionCount: number,
  sectorMap:     Map<string, number>,
): { canBuy: boolean; maxSize: number; warnings: string[] } {
  const cashPct    = cash / totalValue;
  const warnings: string[] = [];

  if (cashPct < 0.05) warnings.push('Kritik nakit <%5');
  if (positionCount >= APEX_US_MAX_POSITIONS) warnings.push(`Max pozisyon (${APEX_US_MAX_POSITIONS}) dolu`);
  for (const [sector, pct] of sectorMap) {
    if (pct > 0.60) warnings.push(`Sektör yoğunluk: ${sector} %${(pct * 100).toFixed(0)}`);
  }

  const canBuy  = cashPct > APEX_US_MIN_CASH_PCT && positionCount < APEX_US_MAX_POSITIONS;
  const maxSize = Math.min(
    cash - totalValue * APEX_US_MIN_CASH_PCT,
    totalValue * APEX_US_MAX_POSITION_PCT,
  );
  return { canBuy, maxSize: Math.max(0, maxSize), warnings };
}
