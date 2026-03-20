/**
 * Phase 13.4 — ML Feature Engineering
 *
 * Hisse mum verisi + teknik sinyal + makro veriden
 * XGBoost modeline girecek özellik vektörü üretir.
 *
 * Feature Grupları:
 * 1. Teknik (RSI, MACD, Bollinger, Hacim, Fiyat momentum)
 * 2. Sinyal meta (tip, yön, şiddet)
 * 3. Makro (makro skor, risk skoru)
 */

import type { OHLCVCandle, StockSignal } from '@/types';
import { calculateEMA } from './signals';

// ── Tipler ───────────────────────────────────────────────────────────

export interface MLFeatureVector {
  // Teknik — normalize edilmiş
  rsi14: number;             // 0–100
  macdHistogram: number;     // normalize: -1 ↔ +1
  bbPosition: number;        // 0=alt band, 1=üst band
  volumeRatio: number;       // güncel/20g-ortalama (cap: 5)
  priceChange5d: number;     // %, -50 ↔ +50
  priceChange20d: number;    // %, -50 ↔ +50
  atr14Pct: number;          // ATR / fiyat % (volatilite)

  // Sinyal meta — ordinal kodlama
  signalTypeCode: number;    // 0=rsi_div, 1=volume, 2=trend, 3=sr_break
  directionCode: number;     // 0=asagi, 1=nötr, 2=yukari
  severityCode: number;      // 0=zayıf, 1=orta, 2=güçlü

  // Makro
  macroScore: number;        // -100 ↔ +100 (normalize: /100)
  riskScore: number;         // 0–100 (normalize: /100)

  // Debug meta (modele girmiyor)
  _symbol: string;
  _signalType: string;
  _candleCount: number;
}

export const FEATURE_NAMES: readonly string[] = [
  'rsi14',
  'macdHistogram',
  'bbPosition',
  'volumeRatio',
  'priceChange5d',
  'priceChange20d',
  'atr14Pct',
  'signalTypeCode',
  'directionCode',
  'severityCode',
  'macroScore',
  'riskScore',
] as const;

// ── Yardımcı Hesaplamalar ─────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function calculateRSI14(closes: number[]): number {
  if (closes.length < 15) return 50;
  const slice = closes.slice(-15);
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = (slice[i] ?? 0) - (slice[i - 1] ?? 0);
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = (ema12.at(-1) ?? 0) - (ema26.at(-1) ?? 0);

  // 9-günlük sinyal — basitleştirilmiş son 9 MACD değeri üzerinden
  const macdValues = closes.slice(-35).map((_, i, arr) => {
    const idx = i + closes.length - arr.length;
    const e12 = calculateEMA(closes.slice(0, idx + 1), 12).at(-1) ?? 0;
    const e26 = calculateEMA(closes.slice(0, idx + 1), 26).at(-1) ?? 0;
    return e12 - e26;
  }).slice(-9);

  const signalLine = macdValues.reduce((s, v) => s + v, 0) / macdValues.length;
  const histogram = macdLine - signalLine;

  // Fiyata göre normalize et
  const lastPrice = closes.at(-1) ?? 1;
  const normalizedHistogram = clamp(histogram / (lastPrice * 0.02), -1, 1);

  return { macd: macdLine, signal: signalLine, histogram: normalizedHistogram };
}

function calculateBollingerPosition(closes: number[], period = 20): number {
  if (closes.length < period) return 0.5;
  const slice = closes.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const stdDev = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period);
  if (stdDev === 0) return 0.5;
  const lastPrice = closes.at(-1) ?? mean;
  const upper = mean + 2 * stdDev;
  const lower = mean - 2 * stdDev;
  return clamp((lastPrice - lower) / (upper - lower), 0, 1);
}

function calculateVolumeRatio(candles: OHLCVCandle[]): number {
  if (candles.length < 21) return 1;
  const recent = candles.at(-1)?.volume ?? 0;
  const avgVolume = candles.slice(-21, -1).reduce((s, c) => s + c.volume, 0) / 20;
  if (avgVolume === 0) return 1;
  return clamp(recent / avgVolume, 0, 5);
}

function calculateATR14Pct(candles: OHLCVCandle[]): number {
  if (candles.length < 15) return 0.02;
  const slice = candles.slice(-15);
  let atrSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const curr = slice[i]!;
    const prev = slice[i - 1]!;
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    atrSum += tr;
  }
  const atr = atrSum / 14;
  const lastPrice = candles.at(-1)?.close ?? 1;
  return clamp(atr / lastPrice, 0, 0.2); // max %20 volatilite
}

function priceChangePercent(candles: OHLCVCandle[], days: number): number {
  if (candles.length < days + 1) return 0;
  const last = candles.at(-1)?.close ?? 0;
  const prev = candles.at(-days - 1)?.close ?? last;
  if (prev === 0) return 0;
  return clamp(((last - prev) / prev) * 100, -50, 50);
}

// ── Sinyal Kodlama ────────────────────────────────────────────────────

const SIGNAL_TYPE_MAP: Record<string, number> = {
  rsi_divergence: 0,
  volume_anomaly: 1,
  trend_start: 2,
  sr_break: 3,
};

const DIRECTION_MAP: Record<string, number> = {
  asagi: 0,
  nötr: 1,
  yukari: 2,
};

const SEVERITY_MAP: Record<string, number> = {
  zayıf: 0,
  orta: 1,
  güçlü: 2,
};

// ── Ana Export ────────────────────────────────────────────────────────

/**
 * Hisse verisi + sinyal + makro skorlarından ML özellik vektörü üretir.
 *
 * @param candles   Son 100 günlük OHLCV mum verisi
 * @param signal    Tespit edilen teknik sinyal
 * @param macroScore  Makro rüzgar skoru (-100 ↔ +100)
 * @param riskScore   Risk skoru (0–100)
 */
export function extractMLFeatures(
  candles: OHLCVCandle[],
  signal: StockSignal,
  macroScore: number,
  riskScore: number
): MLFeatureVector {
  const closes = candles.map((c) => c.close);

  const rsi14 = calculateRSI14(closes);
  const { histogram: macdHistogram } = calculateMACD(closes);
  const bbPosition = calculateBollingerPosition(closes);
  const volumeRatio = calculateVolumeRatio(candles);
  const priceChange5d = priceChangePercent(candles, 5);
  const priceChange20d = priceChangePercent(candles, 20);
  const atr14Pct = calculateATR14Pct(candles);

  const signalTypeCode = SIGNAL_TYPE_MAP[signal.type] ?? 0;
  const directionCode = DIRECTION_MAP[signal.direction] ?? 1;
  const severityCode = SEVERITY_MAP[signal.severity] ?? 1;

  return {
    rsi14,
    macdHistogram,
    bbPosition,
    volumeRatio,
    priceChange5d,
    priceChange20d,
    atr14Pct,
    signalTypeCode,
    directionCode,
    severityCode,
    macroScore: clamp(macroScore, -100, 100),
    riskScore: clamp(riskScore, 0, 100),
    _symbol: signal.sembol,
    _signalType: signal.type,
    _candleCount: candles.length,
  };
}

/**
 * MLFeatureVector'ü modele gönderilecek sayı dizisine çevirir.
 * Meta alanlar (_symbol vb.) dahil edilmez.
 */
export function featureVectorToArray(features: MLFeatureVector): number[] {
  return FEATURE_NAMES.map((name) => {
    const val = features[name as keyof MLFeatureVector];
    return typeof val === 'number' ? val : 0;
  });
}

/**
 * Özellik vektörünü insan okunur formatta açıklar.
 */
export function describeFeatures(features: MLFeatureVector): Record<string, string> {
  return {
    'RSI(14)': `${features.rsi14.toFixed(1)} (${features.rsi14 > 70 ? 'aşırı alım' : features.rsi14 < 30 ? 'aşırı satım' : 'nötr'})`,
    'MACD Histogram': `${features.macdHistogram > 0 ? '+' : ''}${features.macdHistogram.toFixed(3)}`,
    'Bollinger Pozisyon': `${(features.bbPosition * 100).toFixed(0)}% (${features.bbPosition > 0.8 ? 'üst band' : features.bbPosition < 0.2 ? 'alt band' : 'orta'})`,
    'Hacim Oranı': `${features.volumeRatio.toFixed(2)}x ortalama`,
    '5G Fiyat Değişimi': `${features.priceChange5d > 0 ? '+' : ''}${features.priceChange5d.toFixed(2)}%`,
    '20G Fiyat Değişimi': `${features.priceChange20d > 0 ? '+' : ''}${features.priceChange20d.toFixed(2)}%`,
    'ATR%': `${(features.atr14Pct * 100).toFixed(2)}%`,
    'Makro Skor': `${features.macroScore > 0 ? '+' : ''}${features.macroScore.toFixed(0)}`,
    'Risk Skoru': `${features.riskScore.toFixed(0)}/100`,
  };
}
