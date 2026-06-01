/**
 * Aegis-US Engine — ABD Borsası Orta Vadeli Portföy
 *
 * Felsefe: Sermayeyi koruyarak büyüt. Volatilite kontrol altında.
 *
 * Farklılıklar (Aegis BIST'e göre):
 *  - Başlangıç: $2.000 USD
 *  - Giriş eşiği: Confluence ≥ 65 (APEX'ten daha düşük bar)
 *  - Min relVol5: 1.5× (likidite teyidi yeterli)
 *  - Max pozisyon: %25 (muhafazakâr)
 *  - Stop: -%8 sabit (ATR yok — basit ve disiplinli)
 *  - Haftalık karar döngüsü
 *
 * Paylaşılan logic (apex-engine.ts'ten):
 *  apexSignalHealth, apexEvaluatePosition, calcLockedStopFloor, apexTrailingStop
 */

export type { ApexPosition, SignalContext, SignalHealth, ApexEvalResult } from './apex-engine';
export { apexSignalHealth, apexEvaluatePosition, calcLockedStopFloor, apexTrailingStop } from './apex-engine';

// ── Sabitler ─────────────────────────────────────────────────────────────────

export const AEGIS_US_INITIAL_CAPITAL  = 2_000;   // $2,000
export const AEGIS_US_MAX_POSITION_PCT = 0.25;    // %25
export const AEGIS_US_MAX_POSITIONS    = 5;
export const AEGIS_US_MIN_CASH_PCT     = 0.10;    // %10 min nakit
export const AEGIS_US_STOP_LOSS_PCT    = 0.08;    // -%8 sabit stop
export const AEGIS_US_MIN_CONFLUENCE   = 65;      // APEX'ten daha geniş (75)
export const AEGIS_US_MIN_REL_VOL      = 1.5;     // Orta likidite yeterli
export const AEGIS_US_MIN_POSITION_USD = 50;      // $50 minimum

// Locked-in basamaklar — BIST Aegis ile aynı (ihtiyatlı)
// calcLockedStopFloor: +%4 BE, +%10→+%5, +%20→+%12, +%35→+%20

// ── Kelly Criterion — Muhafazakâr ────────────────────────────────────────────

export function aegisUSPositionSize(
  availableCash: number,
  totalValue:    number,
  confluence:    number,
  macroScore:    number,
): number {
  const winRate = 0.58;  // daha muhafazakâr beklenti
  const rr      = 2.0;
  const kelly   = (rr * winRate - (1 - winRate)) / rr;
  const kellyMult = 1.0; // tam Kelly (APEX gibi 1.5-1.6× yok)

  const confMult  = Math.min(1.2, 1.0 + (confluence - AEGIS_US_MIN_CONFLUENCE) / 100);
  const macroMult = macroScore < -30 ? 0.5 : macroScore < -10 ? 0.7 : 1.0;

  const fraction = Math.min(
    kelly * kellyMult * confMult * macroMult,
    AEGIS_US_MAX_POSITION_PCT,
  );
  return Math.min(availableCash * 0.97, totalValue * fraction);
}

/** Giriş seviyeleri — sabit %8 stop (ATR bazlı değil) */
export function aegisUSCalcLevels(entryPrice: number) {
  const stopDist = entryPrice * AEGIS_US_STOP_LOSS_PCT;
  return {
    stopLoss:     parseFloat((entryPrice - stopDist).toFixed(4)),
    trailingStop: parseFloat((entryPrice - stopDist).toFixed(4)),
    takeProfit:   parseFloat((entryPrice * 1.24).toFixed(4)),  // +%24 referans (trailing belirler)
  };
}

/** Portföy sağlık kontrolü */
export function aegisUSHealthCheck(
  totalValue:    number,
  cash:          number,
  positionCount: number,
): { canBuy: boolean; maxSize: number } {
  const cashPct = cash / totalValue;
  const canBuy  = cashPct > AEGIS_US_MIN_CASH_PCT && positionCount < AEGIS_US_MAX_POSITIONS;
  const maxSize = Math.min(
    cash - totalValue * AEGIS_US_MIN_CASH_PCT,
    totalValue * AEGIS_US_MAX_POSITION_PCT,
  );
  return { canBuy, maxSize: Math.max(0, maxSize) };
}
