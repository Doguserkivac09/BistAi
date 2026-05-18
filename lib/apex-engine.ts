/**
 * lib/apex-engine.ts
 *
 * APEX — Agresif Momentum Portföy Motoru
 *
 * Felsefe: Maksimum kazanç. Volatilite fırsattır.
 * Haklıyken büyük, yanlışken hızlı.
 *
 * Kurallar:
 *  - Giriş: relVol5 ≥ 3x + confluence ≥ 75 (yüksek bar)
 *  - Max 4 pozisyon — konsantrasyon güçtür
 *  - Max %25 tek hisse (agresif)
 *  - Stop -%6 (disiplinli, hızlı kesim)
 *  - Kâr alma YOK — trailing stop sonuna kadar
 *  - Rotasyon: zayıf pozisyon → daha güçlü fırsat
 *  - Günlük çalışır (her iş günü kapanışa yakın)
 */

export const APEX_INITIAL_CAPITAL = 100_000;
export const APEX_MAX_POSITION_PCT = 0.25;    // %25
export const APEX_MAX_POSITIONS    = 4;
export const APEX_MIN_CASH_PCT     = 0.08;    // %8 min nakit (agresif dağıtım)
export const APEX_STOP_LOSS_PCT    = 0.06;    // -%6 stop
export const APEX_MIN_CONFLUENCE   = 75;      // giriş için min confluence
export const APEX_MIN_REL_VOL      = 3.0;     // giriş için min relVol5
export const APEX_ROTATION_THRESH  = 45;      // bu altında → rotasyon adayı

export interface ApexPosition {
  id:             string;
  sembol:         string;
  sector_id:      string;
  shares:         number;
  entry_price:    number;
  stop_loss:      number;
  trailing_stop:  number;
  cost_basis:     number;
  current_price:  number | null;
  entry_confluence: number | null;
  entry_rel_vol5:   number | null;
}

export interface ApexScanCandidate {
  sembol:          string;
  sector_id:       string;
  sector_name:     string;
  last_close:      number;
  confluence_score: number;
  rel_vol5:        number;
  change_percent:  number | null;
  signals_json:    Array<{ direction: string; type: string }>;
}

/** Agresif Kelly: Kelly × 1.5, max %25 */
export function apexPositionSize(
  availableCash:  number,
  totalValue:     number,
  confluence:     number,
  relVol5:        number,
  macroScore:     number,
): number {
  // Temel Kelly (basit: win_rate=0.65, R/R=2.5 agresif beklenti)
  const winRate = 0.65;
  const rr      = 2.5;
  const kelly   = (rr * winRate - (1 - winRate)) / rr;
  const aggressiveKelly = kelly * 1.5; // 1.5x Kelly

  // Confluence çarpanı: 75→1.0x, 90→1.3x
  const confMult = Math.min(1.3, 1.0 + (confluence - 75) / 50);

  // relVol5 çarpanı: 3x→1.0, 5x→1.2x, 8x→1.35x
  const volMult  = Math.min(1.35, 1.0 + (relVol5 - APEX_MIN_REL_VOL) * 0.06);

  // Makro cezası: kötüyse ½ boyut
  const macroMult = macroScore < -30 ? 0.5 : macroScore < -10 ? 0.7 : 1.0;

  const fraction = Math.min(
    aggressiveKelly * confMult * volMult * macroMult,
    APEX_MAX_POSITION_PCT,
  );

  return Math.min(availableCash * 0.97, totalValue * fraction);
}

/** Dinamik trailing stop — kâr büyüdükçe agresif sıkılaşır */
export function apexTrailingStop(
  entryPrice:   number,
  currentPrice: number,
  currentStop:  number,
): number {
  const ret = ((currentPrice - entryPrice) / entryPrice) * 100;

  // APEX daha sıkı trailing (kârı hızlı kilitle)
  const trailPct =
    ret >= 80  ? 0.06  :
    ret >= 50  ? 0.08  :
    ret >= 30  ? 0.10  :
    ret >= 15  ? 0.12  :
    ret >= 5   ? 0.08  :
    APEX_STOP_LOSS_PCT;

  const newStop = currentPrice * (1 - trailPct);
  return Math.max(currentStop, newStop);
}

/** Mevcut pozisyon kararı */
export function apexEvaluatePosition(
  pos:       ApexPosition,
  current:   number,
  confNow:   number | null,
  relVol:    number | null,
  bestOpp:   { confluence: number; relVol5: number } | null,
): { action: 'HOLD' | 'SELL' | 'ROTATE_OUT'; reason: string } {
  const ret = ((current - pos.entry_price) / pos.entry_price) * 100;

  // 1. Stop-loss
  if (ret <= -(APEX_STOP_LOSS_PCT * 100) || current <= pos.stop_loss) {
    return { action: 'SELL', reason: `STOP: ${ret.toFixed(1)}% — disiplinle kes` };
  }

  // 2. Trailing stop
  if (ret >= 5 && current <= pos.trailing_stop) {
    return { action: 'SELL', reason: `TRAILING: +${ret.toFixed(1)}% → kilitlendi` };
  }

  // 3. Teknik çöküş
  if ((confNow ?? 100) < APEX_ROTATION_THRESH && ret < -2) {
    return { action: 'SELL', reason: `Sinyal çöktü (conf:${confNow}) + zarar — çık` };
  }

  // 4. Rotasyon: mevcut zayıf, dışarıda çok daha güçlü fırsat var
  if (
    bestOpp &&
    (confNow ?? 100) < 55 &&
    bestOpp.confluence >= 82 &&
    bestOpp.relVol5 >= 4.0 &&
    ret > -3  // zararda rotasyon yapma
  ) {
    return {
      action: 'ROTATE_OUT',
      reason: `Rotasyon: mevcut conf ${confNow} → yeni fırsat conf ${bestOpp.confluence} relVol5 ${bestOpp.relVol5}x`,
    };
  }

  // 5. Tut
  return {
    action: 'HOLD',
    reason: ret > 0
      ? `+${ret.toFixed(1)}% — momentum devam ediyor, trailing: ${pos.trailing_stop.toFixed(2)}`
      : `${ret.toFixed(1)}% — stop uzakta, tez geçerli`,
  };
}

/** Giriş seviyeleri */
export function apexCalcLevels(entryPrice: number, atr?: number | null) {
  const stopDist = atr
    ? Math.min(atr * 1.8, entryPrice * APEX_STOP_LOSS_PCT)
    : entryPrice * APEX_STOP_LOSS_PCT;

  return {
    stopLoss:     parseFloat((entryPrice - stopDist).toFixed(2)),
    trailingStop: parseFloat((entryPrice * (1 - APEX_STOP_LOSS_PCT)).toFixed(2)),
  };
}

/** Portföy sağlık kontrolü */
export function apexHealthCheck(
  totalValue:    number,
  cash:          number,
  positionCount: number,
  sectorMap:     Map<string, number>,
): { canBuy: boolean; maxSize: number; warnings: string[] } {
  const cashPct = cash / totalValue;
  const warnings: string[] = [];

  if (cashPct < 0.05)          warnings.push('Kritik nakit <%5');
  if (positionCount >= APEX_MAX_POSITIONS) warnings.push(`Max pozisyon (${APEX_MAX_POSITIONS}) dolu`);

  for (const [sector, pct] of sectorMap) {
    if (pct > 0.40) warnings.push(`Sektör konsantrasyonu yüksek: ${sector} %${(pct*100).toFixed(0)}`);
  }

  const canBuy = cashPct > APEX_MIN_CASH_PCT && positionCount < APEX_MAX_POSITIONS;
  const maxSize = Math.min(
    cash - totalValue * APEX_MIN_CASH_PCT,
    totalValue * APEX_MAX_POSITION_PCT,
  );

  return { canBuy, maxSize: Math.max(0, maxSize), warnings };
}
