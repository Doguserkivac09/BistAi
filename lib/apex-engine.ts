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

export const APEX_INITIAL_CAPITAL  = 100_000;
export const APEX_MAX_POSITION_PCT = 0.25;    // %25
export const APEX_MAX_POSITIONS    = 4;
export const APEX_MIN_CASH_PCT     = 0.08;    // %8 min nakit
export const APEX_STOP_LOSS_PCT    = 0.06;    // -%6 stop fallback (ATR yoksa)
export const APEX_MIN_CONFLUENCE   = 75;      // giriş için min confluence
export const APEX_MIN_REL_VOL      = 3.0;     // giriş için min relVol5
export const APEX_ROTATION_THRESH  = 45;      // bu altında → rotasyon adayı

// Kilitli kâr basamakları — "let winners run" ama zemin koy
export const APEX_LOCK_BREAKEVEN_AT = 0.04;   // +%4  → break-even stop
export const APEX_LOCK_1_AT         = 0.10;   // +%10 → +%5 kilitle
export const APEX_LOCK_1_FLOOR      = 0.05;
export const APEX_LOCK_2_AT         = 0.20;   // +%20 → +%12 kilitle
export const APEX_LOCK_2_FLOOR      = 0.12;
export const APEX_LOCK_3_AT         = 0.35;   // +%35 → +%20 kilitle
export const APEX_LOCK_3_FLOOR      = 0.20;

export interface ApexPosition {
  id:               string;
  sembol:           string;
  sector_id:        string;
  shares:           number;
  entry_price:      number;
  stop_loss:        number;
  trailing_stop:    number;
  cost_basis:       number;
  current_price:    number | null;
  entry_confluence: number | null;
  entry_rel_vol5:   number | null;
  tp1_hit:          boolean;   // ilk kısmi çıkış yapıldı mı?
  entry_date:       string;    // YYYY-MM-DD — whipsaw koruması için
}

/** Signal health değerlendirmesi için gereken bağlam */
export interface SignalContext {
  rsi:         number | null;
  confluence:  number | null;
  relVol5:     number | null;
  signals:     Array<{ direction: string }> | null;
  macroScore:  number;
  changeToday: number | null;   // parabolik fade için
  belowSma5:   boolean;         // kapanış 5G SMA altında mı
  isStagnant:  boolean;         // 10g menzil <%3 mü
}

/** Sinyal sağlığı sonucu */
export interface SignalHealth {
  score:     number;
  label:     'güçlü' | 'izleniyor' | 'zayıf' | 'bozuldu';
  rsiFlag:   'ok' | 'high' | 'critical';
  volFlag:   'ok' | 'low' | 'critical';
  trendFlag: 'ok' | 'below_ema';
  factors:   string[];
}

/** Pozisyon değerlendirme sonucu */
export interface ApexEvalResult {
  action:     'HOLD' | 'PARTIAL_SELL' | 'SELL' | 'ROTATE_OUT';
  reason:     string;
  partialPct?: number;   // 25 veya 50 — PARTIAL_SELL için
  trigger?:   'parabolic' | 'signal_weak' | 'signal_broken' | 'stop' | 'trailing' | 'rotation';
  health?:    SignalHealth;
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

/** 6 faktör × 2 ek kural ile sinyal sağlığını değerlendir */
export function apexSignalHealth(ctx: SignalContext): SignalHealth {
  let score = 0;
  const factors: string[] = [];
  let rsiFlag:   SignalHealth['rsiFlag']   = 'ok';
  let volFlag:   SignalHealth['volFlag']   = 'ok';
  let trendFlag: SignalHealth['trendFlag'] = 'ok';

  // F1: RSI
  if (ctx.rsi !== null) {
    if (ctx.rsi > 82)      { score -= 2; factors.push(`RSI=${ctx.rsi.toFixed(0)} aşırı alım`); rsiFlag = 'critical'; }
    else if (ctx.rsi > 75) { score -= 1; factors.push(`RSI=${ctx.rsi.toFixed(0)} yüksek`); rsiFlag = 'high'; }
    else if (ctx.rsi < 65) { score += 1; }
  }

  // F2: Confluence
  if (ctx.confluence !== null) {
    if      (ctx.confluence >= 70) score += 2;
    else if (ctx.confluence >= 55) score += 1;
    else if (ctx.confluence < 45)  { score -= 2; factors.push(`Conf=${ctx.confluence} bozuldu`); }
    else if (ctx.confluence < 55)  { score -= 1; factors.push(`Conf=${ctx.confluence} zayıfladı`); }
  }

  // F3: Relative Volume
  if (ctx.relVol5 !== null) {
    if      (ctx.relVol5 >= 1.5) { score += 1; }
    else if (ctx.relVol5 < 0.8)  { score -= 2; factors.push(`Hacim bitti (${ctx.relVol5.toFixed(1)}x)`); volFlag = 'critical'; }
    else if (ctx.relVol5 < 1.2)  { score -= 1; factors.push(`Hacim düştü (${ctx.relVol5.toFixed(1)}x)`); volFlag = 'low'; }
  }

  // F4: Sinyal yönü
  if (ctx.signals && ctx.signals.length > 0) {
    const up   = ctx.signals.filter((s) => s.direction === 'yukari').length;
    const down = ctx.signals.filter((s) => s.direction === 'asagi').length;
    if      (up > down)               score += 1;
    else if (down >= 2 && down > up)  { score -= 2; factors.push('SAT sinyali baskın'); }
    else if (down > 0)                score -= 1;
  }

  // F5: Makro rejim
  if      (ctx.macroScore >  10) score += 1;
  else if (ctx.macroScore < -10) { score -= 1; factors.push('Makro bozuldu'); }

  // F6: Trend kırılması (5G SMA altı kapanış — kritik: -3)
  if (ctx.belowSma5) {
    score -= 3;
    factors.push('5G SMA ALTINDA kapandı');
    trendFlag = 'below_ema';
  }

  // F7: Time decay (10g menzil <%3 — hareketsiz pozisyon)
  if (ctx.isStagnant) {
    score -= 1;
    factors.push('10g menzil <%3 — hareketsiz');
  }

  const label: SignalHealth['label'] =
    score >= 4  ? 'güçlü' :
    score >= 1  ? 'izleniyor' :
    score >= -2 ? 'zayıf' :
                  'bozuldu';

  return { score, label, rsiFlag, volFlag, trendFlag, factors };
}

/** Locked-in kâr stop zemini — her cron'da uygulanır */
export function calcLockedStopFloor(entryPrice: number, ret: number): number | null {
  if (ret >= APEX_LOCK_3_AT * 100) return entryPrice * (1 + APEX_LOCK_3_FLOOR);
  if (ret >= APEX_LOCK_2_AT * 100) return entryPrice * (1 + APEX_LOCK_2_FLOOR);
  if (ret >= APEX_LOCK_1_AT * 100) return entryPrice * (1 + APEX_LOCK_1_FLOOR);
  if (ret >= APEX_LOCK_BREAKEVEN_AT * 100) return entryPrice;
  return null;
}

/** Context-Aware pozisyon değerlendirme */
export function apexEvaluatePosition(
  pos:              ApexPosition,
  current:          number,
  confNow:          number | null,
  relVol:           number | null,
  bestOpp:          { confluence: number; relVol5: number } | null,
  signalCtx?:       SignalContext,
  tradingDaysOpen?: number,
): ApexEvalResult {
  const ret = ((current - pos.entry_price) / pos.entry_price) * 100;

  // ── 1. Hard stop (locked-in floor dahil, her zaman aktif) ───────────
  if (current <= pos.stop_loss) {
    return {
      action: 'SELL', trigger: 'stop',
      reason: ret >= 0
        ? `Kilitli kâr stop: +${ret.toFixed(1)}% — kazanç korundu`
        : `STOP: ${ret.toFixed(1)}% — disiplinle kes`,
    };
  }

  // ── 2. Trailing stop (kârdayken) ────────────────────────────────────
  if (ret >= 5 && current <= pos.trailing_stop) {
    return {
      action: 'SELL', trigger: 'trailing',
      reason: `Trailing: +${ret.toFixed(1)}%${pos.tp1_hit ? ' (kısmi sonrası)' : ''} → kilitlendi`,
    };
  }

  // ── 3. Parabolik Fade: gün içi +%15 sıçrama → %25 realize ──────────
  //    İlk 2 işlem gününde de aktif (whipsaw muafiyeti yok)
  if (signalCtx?.changeToday !== null && signalCtx?.changeToday !== undefined
      && signalCtx.changeToday >= 15) {
    return {
      action: 'PARTIAL_SELL', partialPct: 25, trigger: 'parabolic',
      reason: `Parabolik sıçrama +${signalCtx.changeToday.toFixed(1)}% — %25 realize`,
    };
  }

  // ── 4. Whipsaw koruması: ilk 2 iş günü — sadece hard stop geçer ─────
  const daysOpen = tradingDaysOpen ?? 99;
  if (daysOpen < 2) {
    return {
      action: 'HOLD',
      reason: ret > 0
        ? `+${ret.toFixed(1)}% — whipsaw koruması (${daysOpen}. iş günü)`
        : `${ret.toFixed(1)}% — açılış günü, bekleniyor`,
    };
  }

  // ── 5. Sinyal sağlığı değerlendirmesi (kâr >= +%4) ──────────────────
  if (ret >= 4 && signalCtx) {
    const health = apexSignalHealth(signalCtx);

    if (health.score <= -3) {
      return {
        action: 'SELL', trigger: 'signal_broken', health,
        reason: `Sinyal bozuldu (skor ${health.score}): ${health.factors.slice(0, 2).join(', ')} — kâr realize`,
      };
    }

    if (health.score <= -1 && !pos.tp1_hit) {
      return {
        action: 'PARTIAL_SELL', partialPct: 50, trigger: 'signal_weak', health,
        reason: `Sinyal zayıfladı (skor ${health.score}): ${health.factors.slice(0, 2).join(', ')} — %50 kâr al`,
      };
    }

    const hlabel = health.score >= 4 ? 'güçlü' : health.score >= 1 ? 'izleniyor' : 'zayıf ama tutuluyor';
    return {
      action: 'HOLD', health,
      reason: `+${ret.toFixed(1)}% — sinyal ${hlabel} (skor ${health.score}), trailing: ${pos.trailing_stop.toFixed(2)}`,
    };
  }

  // ── 6. Rotasyon ─────────────────────────────────────────────────────
  if (bestOpp && (confNow ?? 100) < 55 && bestOpp.confluence >= 82
      && bestOpp.relVol5 >= 4.0 && ret > -3) {
    return {
      action: 'ROTATE_OUT', trigger: 'rotation',
      reason: `Rotasyon: mevcut conf ${confNow} → fırsat conf ${bestOpp.confluence} relVol ${bestOpp.relVol5}x`,
    };
  }

  // ── 7. Teknik çöküş + zarar ─────────────────────────────────────────
  if ((confNow ?? 100) < APEX_ROTATION_THRESH && ret < -2) {
    return {
      action: 'SELL', trigger: 'signal_broken',
      reason: `Sinyal çöktü (conf:${confNow}) + zarar — çık`,
    };
  }

  // ── 8. Tut ──────────────────────────────────────────────────────────
  return {
    action: 'HOLD',
    reason: ret > 0
      ? `+${ret.toFixed(1)}% — devam${pos.tp1_hit ? ' (kısmi sonrası)' : ''}, trailing: ${pos.trailing_stop.toFixed(2)}`
      : `${ret.toFixed(1)}% — stop uzakta, izleniyor`,
  };
}

/** Giriş seviyeleri — ATR bazlı dinamik stop */
export function apexCalcLevels(entryPrice: number, atr?: number | null) {
  // ATR × 2.0, [%4, %9] aralığında sıkıştır.
  // Düşük volatilite → tighter stop (hızlı kes).
  // Yüksek volatilite → biraz geniş, gürültüden tetiklenme.
  const stopDist = atr && atr > 0
    ? Math.min(
        Math.max(atr * 2.0, entryPrice * 0.04),  // min %4
        entryPrice * 0.09,                         // max %9
      )
    : entryPrice * APEX_STOP_LOSS_PCT;             // fallback %6

  return {
    stopLoss:     parseFloat((entryPrice - stopDist).toFixed(2)),
    trailingStop: parseFloat((entryPrice - stopDist).toFixed(2)), // initial trailing = stop
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
