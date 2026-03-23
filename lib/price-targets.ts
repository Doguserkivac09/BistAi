/**
 * Fiyat Hedefleri Hesaplama
 *
 * Destek/Direnç analizi kullanarak kısa vadeli fiyat hedefleri ve
 * stop-loss seviyeleri üretir. Risk/Ödül oranı (R/R) hesaplar.
 */

import type { SRAnalysis } from './support-resistance';

export interface PriceTarget {
  price: number;
  label: string;
  type: 'target' | 'stop';
  /** Mevcut fiyattan % uzaklık (pozitif = yukarı, negatif = aşağı) */
  distancePct: number;
}

export interface PriceTargets {
  currentPrice: number;
  stopLoss: PriceTarget | null;
  target1: PriceTarget | null;
  target2: PriceTarget | null;
  /** Risk/Ödül oranı — target1 / stopLoss mesafesi. null if incomplete. */
  riskReward: number | null;
}

/**
 * S/R analizi üzerinden fiyat hedefleri üretir.
 *
 * Yukarı yön: stop = nearestSupport, t1 = resistances[0], t2 = resistances[1]
 * Aşağı yön:  stop = nearestResistance, t1 = supports[0], t2 = supports[1]
 *
 * @param currentPrice  Anlık kapanış fiyatı
 * @param srAnalysis    calculateSRLevels() sonucu
 * @param direction     Sinyal yönü (varsayılan: 'yukari')
 */
export function computePriceTargets(
  currentPrice: number,
  srAnalysis: SRAnalysis,
  direction: 'yukari' | 'asagi' | 'nötr' = 'yukari'
): PriceTargets {
  const pct = (target: number) =>
    parseFloat((((target - currentPrice) / currentPrice) * 100).toFixed(2));

  if (direction === 'asagi') {
    // Düşüş sinyali: stop direnç, hedefler destek
    const stop = srAnalysis.nearestResistance
      ? { price: srAnalysis.nearestResistance.price, label: 'Stop Loss', type: 'stop' as const, distancePct: pct(srAnalysis.nearestResistance.price) }
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

  // Yukarı veya nötr: stop destek, hedefler direnç
  const stop = srAnalysis.nearestSupport
    ? { price: srAnalysis.nearestSupport.price, label: 'Stop Loss', type: 'stop' as const, distancePct: pct(srAnalysis.nearestSupport.price) }
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
