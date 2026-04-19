/**
 * Fiyat Hedefleri Hesaplama
 *
 * Destek/Direnç analizi kullanarak kısa vadeli fiyat hedefleri ve
 * stop-loss seviyeleri üretir. Risk/Ödül oranı (R/R) hesaplar.
 *
 * Hibrit stop-loss (v2):
 *   long  → stop = max(nearestSupport,   entry - ATR_MULT × ATR14)  // en sıkı
 *   short → stop = min(nearestResistance, entry + ATR_MULT × ATR14) // en sıkı
 *
 * Amaç: yapısal stop çok uzakta ise volatilite-bazlı (ATR) stop koruyucu
 * rol oynar; volatilite düşükken yapısal seviye geçerli kalır.
 */

import type { SRAnalysis } from './support-resistance';
import type { OHLCVCandle } from '@/types';

/** ATR stop için varsayılan çarpan — Wilder standardı 2-3 arası, kısa vade için 2. */
const ATR_MULT = 2;
/** ATR periyodu (Wilder) — 14 standart. */
const ATR_PERIOD = 14;

/** Stop-loss kaynağı — UI'da "🏗 Yapısal" vs. "📏 ATR" rozeti için. */
export type StopSource = 'structural' | 'atr' | 'hybrid';

export interface PriceTarget {
  price: number;
  label: string;
  type: 'target' | 'stop';
  /** Mevcut fiyattan % uzaklık (pozitif = yukarı, negatif = aşağı) */
  distancePct: number;
  /** Stop-loss için — hangi yöntemle belirlendi? (sadece type='stop' için anlamlı) */
  source?: StopSource;
  /** Yapısal referans (destek/direnç) seviyesi — UI'da "Yapısal: X₺" göstermek için */
  structuralPrice?: number;
  /** ATR-bazlı referans seviyesi — UI'da "ATR: X₺" göstermek için */
  atrPrice?: number;
}

export interface PriceTargets {
  currentPrice: number;
  stopLoss: PriceTarget | null;
  target1: PriceTarget | null;
  target2: PriceTarget | null;
  /** Risk/Ödül oranı — target1 / stopLoss mesafesi. null if incomplete. */
  riskReward: number | null;
}

/** ATR14 (Wilder smoothing) — son mum itibariyle. */
export function computeATR14(candles: OHLCVCandle[], period = ATR_PERIOD): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close),
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  // İlk ATR = ilk N TR ortalaması
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  // Sonraki ATR'ler — Wilder smoothing: ((n-1)*prev + tr) / n
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]!) / period;
  }
  return atr;
}

/**
 * Hibrit stop-loss — yapısal ve ATR-bazlı stop'tan en sıkı (entry'ye en yakın) olanı seçer.
 * @returns source + seçilen fiyat. Her ikisi de null ise null.
 */
function pickHybridStop(
  entry: number,
  direction: 'yukari' | 'asagi',
  structural: number | null,
  atr: number | null,
): { price: number; source: StopSource; structuralPrice?: number; atrPrice?: number } | null {
  const atrStop = atr !== null
    ? (direction === 'yukari' ? entry - ATR_MULT * atr : entry + ATR_MULT * atr)
    : null;

  // Sadece biri varsa onu kullan
  if (structural === null && atrStop === null) return null;
  if (structural === null)  return { price: atrStop!, source: 'atr',        atrPrice: atrStop! };
  if (atrStop === null)     return { price: structural, source: 'structural', structuralPrice: structural };

  // Her ikisi de var — en sıkı (entry'ye en yakın) olanı seç
  const pickedStructural = direction === 'yukari'
    ? structural >= atrStop   // long: büyük olan = entry'ye yakın
    : structural <= atrStop;  // short: küçük olan = entry'ye yakın

  const price  = pickedStructural ? structural : atrStop;
  const source: StopSource = pickedStructural ? 'structural' : 'atr';
  return { price, source, structuralPrice: structural, atrPrice: atrStop };
}

/**
 * S/R analizi üzerinden fiyat hedefleri üretir.
 *
 * Yukarı yön: stop = hibrit(nearestSupport, entry - 2*ATR14), hedefler = resistances[0,1]
 * Aşağı yön:  stop = hibrit(nearestResistance, entry + 2*ATR14), hedefler = supports[0,1]
 *
 * @param currentPrice  Anlık kapanış fiyatı
 * @param srAnalysis    calculateSRLevels() sonucu
 * @param direction     Sinyal yönü (varsayılan: 'yukari')
 * @param candles       ATR hesabı için OHLCV — verilmezse saf yapısal stop kullanılır
 */
export function computePriceTargets(
  currentPrice: number,
  srAnalysis: SRAnalysis,
  direction: 'yukari' | 'asagi' | 'nötr' = 'yukari',
  candles?: OHLCVCandle[],
): PriceTargets {
  const pct = (target: number) =>
    parseFloat((((target - currentPrice) / currentPrice) * 100).toFixed(2));

  const atr = candles && candles.length >= ATR_PERIOD + 1 ? computeATR14(candles) : null;

  if (direction === 'asagi') {
    // Düşüş sinyali: stop direnç (üstte), hedefler destek
    const structural = srAnalysis.nearestResistance?.price ?? null;
    const hybrid = pickHybridStop(currentPrice, 'asagi', structural, atr);

    const stop: PriceTarget | null = hybrid
      ? { price: hybrid.price, label: 'Stop Loss', type: 'stop', distancePct: pct(hybrid.price), source: hybrid.source, structuralPrice: hybrid.structuralPrice, atrPrice: hybrid.atrPrice }
      : null;

    const t1 = srAnalysis.supports[0]
      ? { price: srAnalysis.supports[0].price, label: 'Hedef 1', type: 'target' as const, distancePct: pct(srAnalysis.supports[0].price) }
      : null;

    const t2 = srAnalysis.supports[1]
      ? { price: srAnalysis.supports[1].price, label: 'Hedef 2', type: 'target' as const, distancePct: pct(srAnalysis.supports[1].price) }
      : null;

    const riskReward = stop && t1
      ? parseFloat((Math.abs(t1.distancePct) / Math.abs(stop.distancePct)).toFixed(2))
      : null;

    return { currentPrice, stopLoss: stop, target1: t1, target2: t2, riskReward };
  }

  // Yukarı veya nötr: stop destek (altta), hedefler direnç
  const structural = srAnalysis.nearestSupport?.price ?? null;
  const hybrid = pickHybridStop(currentPrice, 'yukari', structural, atr);

  const stop: PriceTarget | null = hybrid
    ? { price: hybrid.price, label: 'Stop Loss', type: 'stop', distancePct: pct(hybrid.price), source: hybrid.source, structuralPrice: hybrid.structuralPrice, atrPrice: hybrid.atrPrice }
    : null;

  const t1 = srAnalysis.resistances[0]
    ? { price: srAnalysis.resistances[0].price, label: 'Hedef 1', type: 'target' as const, distancePct: pct(srAnalysis.resistances[0].price) }
    : null;

  const t2 = srAnalysis.resistances[1]
    ? { price: srAnalysis.resistances[1].price, label: 'Hedef 2', type: 'target' as const, distancePct: pct(srAnalysis.resistances[1].price) }
    : null;

  const riskReward = stop && t1
    ? parseFloat((Math.abs(t1.distancePct) / Math.abs(stop.distancePct)).toFixed(2))
    : null;

  return { currentPrice, stopLoss: stop, target1: t1, target2: t2, riskReward };
}
