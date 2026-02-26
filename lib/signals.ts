/**
 * BIST hisseleri için teknik analiz sinyal tespit mantığı.
 * Her sinyal: { type, sembol, severity, direction, data }
 */

import type { OHLCVCandle, StockSignal, SignalSeverity, SignalDirection } from '@/types';

// --- RSI (14 periyot) ---
function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      rsi.push(50);
      continue;
    }
    const slice = closes.slice(i - period, i + 1);
    let gains = 0;
    let losses = 0;
    for (let j = 1; j < slice.length; j++) {
      const diff = slice[j]! - slice[j - 1]!;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) {
      rsi.push(100);
      continue;
    }
    const rs = avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }
  return rsi;
}

// --- EMA (exported for regime-engine) ---
export function calculateEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i]!;
      if (i === period - 1) {
        const firstEma = sum / period;
        ema.push(firstEma);
      } else {
        ema.push(values[i]!);
      }
      continue;
    }
    const prevEma = ema[i - 1]!;
    const nextEma = values[i]! * k + prevEma * (1 - k);
    ema.push(nextEma);
  }
  return ema;
}

// --- Ortalama hacim (son N gün) ---
function averageVolume(candles: OHLCVCandle[], n: number): number {
  if (candles.length < n) return 0;
  const slice = candles.slice(-n);
  const sum = slice.reduce((a, c) => a + c.volume, 0);
  return sum / slice.length;
}

export function detectRsiDivergence(sembol: string, candles: OHLCVCandle[]): StockSignal | null {
  if (candles.length < 20) return null;
  const closes = candles.map((c) => c.close);
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const rsi = calculateRSI(closes, 14);

  const lookback = 10;
  const start = 14;

  for (let i = candles.length - 1; i >= start + lookback; i--) {
    let priceLow1 = lows[i]!;
    let priceLow2 = lows[i]!;
    let priceHigh1 = highs[i]!;
    let priceHigh2 = highs[i]!;
    let idxLow1 = i;
    let idxLow2 = i;
    let idxHigh1 = i;
    let idxHigh2 = i;

    for (let j = i - 1; j >= i - lookback && j >= start; j--) {
      if (lows[j]! < priceLow1) {
        priceLow2 = priceLow1;
        idxLow2 = idxLow1;
        priceLow1 = lows[j]!;
        idxLow1 = j;
      } else if (lows[j]! < priceLow2) {
        priceLow2 = lows[j]!;
        idxLow2 = j;
      }
      if (highs[j]! > priceHigh1) {
        priceHigh2 = priceHigh1;
        idxHigh2 = idxHigh1;
        priceHigh1 = highs[j]!;
        idxHigh1 = j;
      } else if (highs[j]! > priceHigh2) {
        priceHigh2 = highs[j]!;
        idxHigh2 = j;
      }
    }

    const rsi1 = rsi[idxLow1] ?? 50;
    const rsi2 = rsi[idxLow2] ?? 50;
    const rsiH1 = rsi[idxHigh1] ?? 50;
    const rsiH2 = rsi[idxHigh2] ?? 50;

    // Bullish: fiyat daha düşük dip, RSI daha yüksek dip
    if (idxLow1 > idxLow2 && priceLow1 < priceLow2 && rsi1 > rsi2 && rsi1 < 40) {
      const severity: SignalSeverity = rsi1 < 30 ? 'güçlü' : rsi1 < 35 ? 'orta' : 'zayıf';
      return {
        type: 'RSI Uyumsuzluğu',
        sembol,
        severity,
        direction: 'yukari',
        data: {
          rsiCurrent: rsi1,
          rsiPrev: rsi2,
          priceLow1,
          priceLow2,
          divergenceType: 'bullish',
        },
      };
    }
    // Bearish: fiyat daha yüksek tepe, RSI daha düşük tepe
    if (idxHigh1 > idxHigh2 && priceHigh1 > priceHigh2 && rsiH1 < rsiH2 && rsiH1 > 60) {
      const severity: SignalSeverity = rsiH1 > 70 ? 'güçlü' : rsiH1 > 65 ? 'orta' : 'zayıf';
      return {
        type: 'RSI Uyumsuzluğu',
        sembol,
        severity,
        direction: 'asagi',
        data: {
          rsiCurrent: rsiH1,
          rsiPrev: rsiH2,
          priceHigh1,
          priceHigh2,
          divergenceType: 'bearish',
        },
      };
    }
  }
  return null;
}

export function detectVolumeAnomaly(sembol: string, candles: OHLCVCandle[]): StockSignal | null {
  if (candles.length < 21) return null;
  const avgVol = averageVolume(candles, 20);
  const last = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  if (avgVol <= 0) return null;

  const ratio = last.volume / avgVol;
  // Biraz daha esnek eşik: 1.8x üzeri hacimleri de dikkate al
  if (ratio < 1.8) return null;

  const priceChange = prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const direction: SignalDirection = priceChange > 0.5 ? 'yukari' : priceChange < -0.5 ? 'asagi' : 'nötr';
  const severity: SignalSeverity = ratio >= 3 ? 'güçlü' : ratio >= 2.3 ? 'orta' : 'zayıf';

  return {
    type: 'Hacim Anomalisi',
    sembol,
    severity,
    direction,
    data: {
      currentVolume: last.volume,
      avgVolume20: avgVol,
      volumeRatio: ratio,
      priceChange,
    },
  };
}

export function detectTrendStart(sembol: string, candles: OHLCVCandle[]): StockSignal | null {
  if (candles.length < 25) return null;
  const closes = candles.map((c) => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);

  // Son 5 mum içinde gerçekleşen kesişimleri dikkate al
  for (let i = 1; i <= 5 && candles.length - 1 - i >= 0; i++) {
    const idx = candles.length - 1 - i;
    const prevIdx = idx - 1;
    if (prevIdx < 0) continue;

    const ema9Now = ema9[idx]!;
    const ema9Prev = ema9[prevIdx]!;
    const ema21Now = ema21[idx]!;
    const ema21Prev = ema21[prevIdx]!;

    if (ema9Prev <= ema21Prev && ema9Now > ema21Now) {
      return {
        type: 'Trend Başlangıcı',
        sembol,
        severity: i === 1 ? 'güçlü' : i === 2 ? 'orta' : 'zayıf',
        direction: 'yukari',
        data: { ema9: ema9Now, ema21: ema21Now, crossoverCandlesAgo: i },
      };
    }
    if (ema9Prev >= ema21Prev && ema9Now < ema21Now) {
      return {
        type: 'Trend Başlangıcı',
        sembol,
        severity: i === 1 ? 'güçlü' : i === 2 ? 'orta' : 'zayıf',
        direction: 'asagi',
        data: { ema9: ema9Now, ema21: ema21Now, crossoverCandlesAgo: i },
      };
    }
  }
  return null;
}

export function detectSupportResistanceBreak(sembol: string, candles: OHLCVCandle[]): StockSignal | null {
  if (candles.length < 21) return null;
  const last20 = candles.slice(-21, -1);
  const last = candles[candles.length - 1]!;
  const high20 = Math.max(...last20.map((c) => c.high));
  const low20 = Math.min(...last20.map((c) => c.low));
  const avgVol = averageVolume(candles, 20);
  const volAbove = avgVol > 0 && last.volume >= avgVol;

  if (last.close > high20 && volAbove) {
    return {
      type: 'Destek/Direnç Kırılımı',
      sembol,
      severity: last.volume >= avgVol * 1.5 ? 'güçlü' : 'orta',
      direction: 'yukari',
      data: { level: high20, levelType: 'resistance', breakPrice: last.close, volumeAboveAvg: true },
    };
  }
  if (last.close < low20 && volAbove) {
    return {
      type: 'Destek/Direnç Kırılımı',
      sembol,
      severity: last.volume >= avgVol * 1.5 ? 'güçlü' : 'orta',
      direction: 'asagi',
      data: { level: low20, levelType: 'support', breakPrice: last.close, volumeAboveAvg: true },
    };
  }
  return null;
}

export function detectAllSignals(sembol: string, candles: OHLCVCandle[]): StockSignal[] {
  const signals: StockSignal[] = [];
  const rsi = detectRsiDivergence(sembol, candles);
  const vol = detectVolumeAnomaly(sembol, candles);
  const trend = detectTrendStart(sembol, candles);
  const breakout = detectSupportResistanceBreak(sembol, candles);
  if (rsi) signals.push(rsi);
  if (vol) signals.push(vol);
  if (trend) signals.push(trend);
  if (breakout) signals.push(breakout);
  return signals;
}
