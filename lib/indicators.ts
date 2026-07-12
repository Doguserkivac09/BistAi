/**
 * Teknik indikatör matematiği — paylaşılan, saf, deterministik.
 *
 * StockChart/SignalChart'ta tekrarlanan EMA/RSI/BB hesapları buraya taşındı + MACD eklendi.
 * InteractiveChart ve diğer grafik bileşenleri buradan import eder (kopya math YOK).
 */

/** Üstel hareketli ortalama. İlk `period` değer için ham değer/SMA tohumlaması. */
export function calculateEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i]!;
      if (i === period - 1) ema.push(sum / period);
      else ema.push(values[i]!);
      continue;
    }
    ema.push(values[i]! * k + ema[i - 1]! * (1 - k));
  }
  return ema;
}

/** Basit hareketli ortalama. İlk `period-1` için mevcut değer. */
export function calculateSMA(values: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { sma.push(values[i]!); continue; }
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j]!;
    sma.push(s / period);
  }
  return sma;
}

/** RSI (Wilder değil, basit ortalama — mevcut StockChart davranışıyla birebir). */
export function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { rsi.push(50); continue; }
    const slice = closes.slice(i - period, i + 1);
    let gains = 0, losses = 0;
    for (let j = 1; j < slice.length; j++) {
      const d = slice[j]! - slice[j - 1]!;
      if (d > 0) gains += d; else losses -= d;
    }
    const avgLoss = losses / period;
    if (avgLoss === 0) { rsi.push(100); continue; }
    rsi.push(100 - 100 / (1 + (gains / period) / avgLoss));
  }
  return rsi;
}

export interface BollingerBands {
  upper: number[];
  middle: number[];
  lower: number[];
}

/** Bollinger Bantları (SMA ± 2σ). İlk `period-1` için mevcut değer. */
export function calculateBollingerBands(closes: number[], period = 20, mult = 2): BollingerBands {
  const upper: number[] = [], middle: number[] = [], lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(closes[i]!); middle.push(closes[i]!); lower.push(closes[i]!); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const stdev = Math.sqrt(slice.reduce((a, b) => a + (b - sma) ** 2, 0) / period);
    upper.push(sma + mult * stdev);
    middle.push(sma);
    lower.push(sma - mult * stdev);
  }
  return { upper, middle, lower };
}

/**
 * VWAP (Volume Weighted Average Price) — kümülatif hacim ağırlıklı ortalama fiyat.
 * Tipik fiyat = (high+low+close)/3. Yüklü aralığın başından kümülatif (anchored VWAP).
 */
export function calculateVWAP(
  candles: { high: number; low: number; close: number; volume: number }[],
): number[] {
  const out: number[] = [];
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume ?? 0;
    cumPV += typical * v;
    cumV += v;
    out.push(cumV > 0 ? cumPV / cumV : typical);
  }
  return out;
}

export interface MACDResult {
  macd: number[];     // fastEMA - slowEMA
  signal: number[];   // macd'nin EMA'sı
  histogram: number[]; // macd - signal
}

/**
 * MACD (Moving Average Convergence Divergence).
 * @param closes Kapanış serisi.
 * @param fast Hızlı EMA periyodu (12).
 * @param slow Yavaş EMA periyodu (26).
 * @param signalPeriod Sinyal EMA periyodu (9).
 */
export function calculateMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MACDResult {
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  const macd = closes.map((_, i) => (emaFast[i] ?? 0) - (emaSlow[i] ?? 0));
  const signal = calculateEMA(macd, signalPeriod);
  const histogram = macd.map((m, i) => m - (signal[i] ?? 0));
  return { macd, signal, histogram };
}
