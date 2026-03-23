/**
 * Teknik Adil Değer Hesaplama
 *
 * EMA50, EMA200 ve Bollinger Orta Bandı (SMA20) üzerinden
 * "teknik adil değer" bölgesi hesaplar.
 *
 * Sapma bölgeleri (mevcut fiyatın adil değerden % uzaklığı):
 *   > +15%  → Aşırı Pahalı
 *   +5..+15 → Pahalı
 *   -5..+5  → Adil Değer
 *   -15..-5 → Ucuz
 *   < -15%  → Aşırı Ucuz
 */

import type { OHLCVCandle } from '@/types';
import { calculateEMA } from '@/lib/signals';

export type FairValueZone =
  | 'asiri_pahali'
  | 'pahali'
  | 'adil_deger'
  | 'ucuz'
  | 'asiri_ucuz';

export interface TechFairValueResult {
  currentPrice: number;
  fairValue: number;
  deviationPct: number;   // pozitif = fiyat FV üzerinde
  zone: FairValueZone;
  zoneLabel: string;
  /** EMA50 (orta vade eğilimi) */
  ema50: number | null;
  /** EMA200 (uzun vade eğilimi) */
  ema200: number | null;
  /** SMA20 — Bollinger orta bandı */
  sma20: number | null;
  /** Yeterli veri var mı? */
  valid: boolean;
}

const ZONE_THRESHOLDS = {
  EXPENSIVE_HIGH: 15,  // >+15% → aşırı pahalı
  EXPENSIVE_LOW:   5,  // +5..+15 → pahalı
  CHEAP_LOW:      -5,  // -5..-15 → ucuz
  CHEAP_HIGH:    -15,  // <-15% → aşırı ucuz
} as const;

const ZONE_LABELS: Record<FairValueZone, string> = {
  asiri_pahali: 'Aşırı Pahalı',
  pahali:       'Pahalı',
  adil_deger:   'Adil Değer',
  ucuz:         'Ucuz',
  asiri_ucuz:   'Aşırı Ucuz',
};

export function computeTechFairValue(candles: OHLCVCandle[]): TechFairValueResult {
  const MIN_CANDLES = 50;
  if (candles.length < MIN_CANDLES) {
    return {
      currentPrice: candles[candles.length - 1]?.close ?? 0,
      fairValue: 0,
      deviationPct: 0,
      zone: 'adil_deger',
      zoneLabel: 'Adil Değer',
      ema50: null,
      ema200: null,
      sma20: null,
      valid: false,
    };
  }

  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1]!;

  // EMA50 — orta vade
  const ema50Arr = calculateEMA(closes, 50);
  const ema50 = ema50Arr[ema50Arr.length - 1] ?? null;

  // EMA200 — uzun vade (yeterli veri varsa)
  const ema200 = candles.length >= 200
    ? (() => {
        const arr = calculateEMA(closes, 200);
        return arr[arr.length - 1] ?? null;
      })()
    : null;

  // SMA20 — Bollinger orta bandı
  const sma20Slice = closes.slice(-20);
  const sma20 = sma20Slice.reduce((a, b) => a + b, 0) / sma20Slice.length;

  // Adil değer: mevcut bileşenlerin ortalaması
  const components = [ema50, sma20, ema200].filter((v): v is number => v !== null);
  const fairValue = components.reduce((a, b) => a + b, 0) / components.length;

  // Sapma
  const deviationPct = fairValue > 0
    ? parseFloat(((currentPrice - fairValue) / fairValue * 100).toFixed(2))
    : 0;

  // Bölge
  let zone: FairValueZone;
  if (deviationPct >= ZONE_THRESHOLDS.EXPENSIVE_HIGH) {
    zone = 'asiri_pahali';
  } else if (deviationPct >= ZONE_THRESHOLDS.EXPENSIVE_LOW) {
    zone = 'pahali';
  } else if (deviationPct <= ZONE_THRESHOLDS.CHEAP_HIGH) {
    zone = 'asiri_ucuz';
  } else if (deviationPct <= ZONE_THRESHOLDS.CHEAP_LOW) {
    zone = 'ucuz';
  } else {
    zone = 'adil_deger';
  }

  return {
    currentPrice,
    fairValue: parseFloat(fairValue.toFixed(2)),
    deviationPct,
    zone,
    zoneLabel: ZONE_LABELS[zone],
    ema50: ema50 ? parseFloat(ema50.toFixed(2)) : null,
    ema200: ema200 ? parseFloat(ema200.toFixed(2)) : null,
    sma20: parseFloat(sma20.toFixed(2)),
    valid: true,
  };
}
