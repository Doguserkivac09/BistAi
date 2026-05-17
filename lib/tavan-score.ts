/**
 * lib/tavan-score.ts
 *
 * BIST Tavan / Taban Tespiti ve Tavan İhtimali Skoru
 *
 * Tavan = %10 günlük artış limiti (BIST kuralı)
 * Taban = %10 günlük düşüş limiti
 *
 * "Tavan İhtimali" — bir hissenin yakın sürede (%1-3 gün)
 * tavan yapma olasılığını 0-100 arası skorlar.
 *
 * Faktörler:
 *  1. Bugünkü hareket           (0-35 puan) — güçlü başlamışsa devam edebilir
 *  2. Hacim patlaması relVol5   (0-25 puan) — olağandışı ilgi = kataliz
 *  3. Sinyal gücü (confluence)  (0-20 puan) — teknik altyapı sağlam
 *  4. RSI bölgesi               (0-10 puan) — güçlü ama overbought değil
 *  5. Haftalık trend uyumu      (0-10 puan) — büyük resim destekliyor
 */

/** Tavan / Taban eşiği — BIST'te günlük limit ±%10 */
const LIMIT_THRESHOLD  = 9.5;  // bu %'nin üstü = tavanda / tabanda
const LIMIT_APPROACH   = 7.0;  // bu %'nin üstü = tavana yaklaşıyor

export interface TavanScoreInputs {
  /** Bugünkü % değişim (scan_cache.change_percent) */
  changePercent:    number | null;
  /** Hacim / 5g ortalama (scan_cache.rel_vol5) */
  relVol5:          number | null;
  /** Confluence skoru (scan_cache.confluence_score) */
  confluenceScore:  number | null;
  /** RSI(14) değeri (scan_cache.rsi) */
  rsi:              number | null;
  /** Haftalık trend uyumu (signal_performance.weekly_aligned) */
  weeklyAligned:    boolean | null;
}

export interface TavanResult {
  /** 0-100 arası tavan ihtimal skoru */
  tavanScore:   number;
  /** Bugün tavan yaptı mı? (≥ +%9.5) */
  isTavan:      boolean;
  /** Bugün taban yaptı mı? (≤ -%9.5) */
  isTaban:      boolean;
  /** Tavana yaklaşıyor mu? (+%7 ile +%9.5 arası) */
  yaklasıyor:   boolean;
  /** Skor seviyesi etiketi */
  label:        'kritik' | 'yuksek' | 'orta' | 'dusuk' | null;
}

/**
 * Tavan ihtimal skoru hesaplar.
 * Yalnızca AL yönlü sinyaller için anlamlıdır.
 */
export function calcTavanScore(inputs: TavanScoreInputs): TavanResult {
  const chg  = inputs.changePercent ?? 0;
  const rv   = inputs.relVol5       ?? 1;
  const conf = inputs.confluenceScore ?? 0;
  const rsi  = inputs.rsi            ?? 50;

  const isTavan    = chg >= LIMIT_THRESHOLD;
  const isTaban    = chg <= -LIMIT_THRESHOLD;
  const yaklasıyor = !isTavan && chg >= LIMIT_APPROACH;

  // Tavan veya taban yapan hissede skor hesaplamak anlamsız
  if (isTavan || isTaban) {
    return {
      tavanScore:  isTavan ? 100 : 0,
      isTavan,
      isTaban,
      yaklasıyor: false,
      label:      isTavan ? 'kritik' : null,
    };
  }

  let score = 0;

  // ── 1. Bugünkü momentum (0-35) ───────────────────────────────────────
  // Güçlü başlamış = tavan için yakıt var
  if      (chg >= 8) score += 35;
  else if (chg >= 6) score += 26;
  else if (chg >= 4) score += 17;
  else if (chg >= 2) score += 9;
  else if (chg >= 1) score += 4;
  // Negatif veya flat → tavan ihtimali düşük
  if (chg < 0) score -= 10;

  // ── 2. Hacim patlaması (0-25) ─────────────────────────────────────────
  // Olağandışı hacim = kurumsal ilgi veya haber katalizörü
  if      (rv >= 6) score += 25;
  else if (rv >= 4) score += 19;
  else if (rv >= 2.5) score += 13;
  else if (rv >= 1.8) score += 7;
  else if (rv >= 1.3) score += 3;

  // ── 3. Sinyal gücü (0-20) ────────────────────────────────────────────
  if      (conf >= 85) score += 20;
  else if (conf >= 70) score += 14;
  else if (conf >= 55) score += 8;
  else if (conf >= 45) score += 4;

  // ── 4. RSI momentum bölgesi (0-10) ───────────────────────────────────
  // 60-78: güçlü trend ama henüz aşırı alım değil
  if (rsi >= 60 && rsi <= 78) score += 10;
  else if (rsi >= 55 && rsi < 60) score += 5;
  else if (rsi > 78) score += 3; // aşırı alım — hâlâ olası ama dikkat

  // ── 5. Haftalık trend uyumu (0-10) ───────────────────────────────────
  if (inputs.weeklyAligned === true)  score += 10;
  if (inputs.weeklyAligned === false) score -= 5; // ters trend ceza

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  const label: TavanResult['label'] =
    finalScore >= 75 ? 'kritik'  :
    finalScore >= 55 ? 'yuksek'  :
    finalScore >= 35 ? 'orta'    :
    finalScore >= 15 ? 'dusuk'   : null;

  return {
    tavanScore:  finalScore,
    isTavan:     false,
    isTaban:     false,
    yaklasıyor,
    label,
  };
}

/** Sadece bugünkü duruma bakarak tavan/taban tespiti */
export function detectTavanTaban(changePercent: number | null): {
  isTavan: boolean;
  isTaban: boolean;
} {
  const chg = changePercent ?? 0;
  return {
    isTavan: chg >= LIMIT_THRESHOLD,
    isTaban: chg <= -LIMIT_THRESHOLD,
  };
}
