import type { OHLCVCandle } from '@/types';

export interface SRLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number;   // 1–5 (kaç kez test edildi)
  lastTouchDate: string;
}

export interface SRAnalysis {
  supports: SRLevel[];      // Yakından uzağa sıralı (en yakın önce)
  resistances: SRLevel[];   // Yakından uzağa sıralı
  currentPrice: number;
  nearestSupport: SRLevel | null;
  nearestResistance: SRLevel | null;
  /** Mevcut fiyatın destek–direnç aralığında yüzde konumu (0=destek, 100=direnç) */
  positionPct: number | null;
}

/**
 * Pivot noktası: çevresindeki N mumdan daha yüksek (tepe) veya daha düşük (dip)
 */
function isPivotHigh(candles: OHLCVCandle[], idx: number, n = 3): boolean {
  const price = candles[idx]!.high;
  for (let i = Math.max(0, idx - n); i <= Math.min(candles.length - 1, idx + n); i++) {
    if (i !== idx && candles[i]!.high >= price) return false;
  }
  return true;
}

function isPivotLow(candles: OHLCVCandle[], idx: number, n = 3): boolean {
  const price = candles[idx]!.low;
  for (let i = Math.max(0, idx - n); i <= Math.min(candles.length - 1, idx + n); i++) {
    if (i !== idx && candles[i]!.low <= price) return false;
  }
  return true;
}

/**
 * Yakın fiyatlı pivot noktalarını kümele (clustering).
 * tolerancePct: iki seviyenin "aynı" sayılması için max fark yüzdesi
 */
function clusterLevels(
  points: { price: number; date: string }[],
  tolerancePct = 1.5
): { price: number; strength: number; lastTouchDate: string }[] {
  if (!points.length) return [];

  const sorted = [...points].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; dates: string[] }[] = [];

  for (const point of sorted) {
    const last = clusters[clusters.length - 1];
    const refPrice = last ? last.prices.reduce((a, b) => a + b, 0) / last.prices.length : null;

    if (last && refPrice !== null && Math.abs(point.price - refPrice) / refPrice <= tolerancePct / 100) {
      last.prices.push(point.price);
      last.dates.push(point.date);
    } else {
      clusters.push({ prices: [point.price], dates: [point.date] });
    }
  }

  return clusters.map((c) => ({
    price: c.prices.reduce((a, b) => a + b, 0) / c.prices.length,
    strength: Math.min(5, c.prices.length),
    lastTouchDate: c.dates.sort().reverse()[0]!,
  }));
}

/**
 * Ana fonksiyon: Son `lookback` mumdan destek ve direnç seviyelerini hesaplar.
 */
export function calculateSRLevels(
  candles: OHLCVCandle[],
  lookback = 90,
  maxLevels = 4
): SRAnalysis {
  const slice = candles.slice(-Math.min(lookback, candles.length));
  const currentPrice = slice[slice.length - 1]!.close;
  const pivotN = 3; // Her yanda kaç mum bakılacak

  const highPoints: { price: number; date: string }[] = [];
  const lowPoints: { price: number; date: string }[] = [];

  for (let i = pivotN; i < slice.length - pivotN; i++) {
    const candle = slice[i]!;
    const date = typeof candle.date === 'number'
      ? new Date(candle.date * 1000).toISOString().split('T')[0]!
      : String(candle.date);

    if (isPivotHigh(slice, i, pivotN)) {
      highPoints.push({ price: candle.high, date });
    }
    if (isPivotLow(slice, i, pivotN)) {
      lowPoints.push({ price: candle.low, date });
    }
  }

  const rawResistances = clusterLevels(highPoints).filter((r) => r.price > currentPrice);
  const rawSupports = clusterLevels(lowPoints).filter((s) => s.price < currentPrice);

  // Dirençler: en yakından uzağa (ascending)
  const resistances: SRLevel[] = rawResistances
    .sort((a, b) => a.price - b.price)
    .slice(0, maxLevels)
    .map((r) => ({ ...r, type: 'resistance' as const }));

  // Destekler: en yakından uzağa (descending)
  const supports: SRLevel[] = rawSupports
    .sort((a, b) => b.price - a.price)
    .slice(0, maxLevels)
    .map((s) => ({ ...s, type: 'support' as const }));

  const nearestSupport = supports[0] ?? null;
  const nearestResistance = resistances[0] ?? null;

  let positionPct: number | null = null;
  if (nearestSupport && nearestResistance) {
    const range = nearestResistance.price - nearestSupport.price;
    positionPct = range > 0 ? ((currentPrice - nearestSupport.price) / range) * 100 : null;
  }

  return { supports, resistances, currentPrice, nearestSupport, nearestResistance, positionPct };
}
