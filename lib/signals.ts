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
  if (avgVol <= 0) return null;

  const last = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const ratio = last.volume / avgVol;

  // Ardışık yüksek hacim günleri (son mum dahil geriye doğru, her gün ≥1.3x ortalama)
  let consecutiveHighVolDays = 0;
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    if ((candles[i]!.volume / avgVol) >= 1.3) consecutiveHighVolDays++;
    else break;
  }

  // Tetikleyici: tek günde 1.8x+ VEYA 2+ ardışık gün 1.3x+
  if (ratio < 1.8 && consecutiveHighVolDays < 2) return null;

  // 5 günlük ortalama hacim / 20 günlük oran (baskı sürekliliği)
  const slice5 = candles.slice(-5);
  const avg5 = slice5.reduce((a, c) => a + c.volume, 0) / slice5.length;
  const relVol5 = parseFloat((avg5 / avgVol).toFixed(2));

  // Fiyat yönü: son 3 günlük trend (tek mum gürültüsünü azaltır)
  const ref3 = candles.length >= 4 ? candles[candles.length - 4]! : prev;
  const priceChange3d = ref3.close !== 0
    ? parseFloat((((last.close - ref3.close) / ref3.close) * 100).toFixed(2))
    : 0;
  const priceChange = prev.close !== 0
    ? parseFloat((((last.close - prev.close) / prev.close) * 100).toFixed(2))
    : 0;

  const direction: SignalDirection =
    priceChange3d > 1 ? 'yukari' : priceChange3d < -1 ? 'asagi' : 'nötr';

  // Severity: spike büyüklüğü (0-2) + ardışık gün bonusu (0-2)
  const spikeScore = ratio >= 3 ? 2 : ratio >= 2.3 ? 1 : 0;
  const streakScore = consecutiveHighVolDays >= 3 ? 2 : consecutiveHighVolDays >= 2 ? 1 : 0;
  const total = spikeScore + streakScore;
  const severity: SignalSeverity = total >= 3 ? 'güçlü' : total >= 1 ? 'orta' : 'zayıf';

  return {
    type: 'Hacim Anomalisi',
    sembol,
    severity,
    direction,
    data: {
      currentVolume: last.volume,
      avgVolume20: avgVol,
      volumeRatio: parseFloat(ratio.toFixed(2)),
      consecutiveHighVolDays,
      relVol5,
      priceChange,
      priceChange3d,
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

// --- MACD (12, 26, 9) ---
export function detectMACDCrossover(sembol: string, candles: OHLCVCandle[]): StockSignal | null {
  if (candles.length < 35) return null;
  const closes = candles.map((c) => c.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  // MACD çizgisi = EMA12 - EMA26
  const macdLine = ema12.map((v, i) => v - ema26[i]!);
  // Sinyal çizgisi = MACD'ın 9 EMA'sı
  const signalLine = calculateEMA(macdLine, 9);

  // Son 5 mum içinde kesişim ara
  for (let i = 1; i <= 5 && candles.length - 1 - i >= 1; i++) {
    const idx = candles.length - 1 - i;
    const prevIdx = idx - 1;
    const macdNow = macdLine[idx]!;
    const macdPrev = macdLine[prevIdx]!;
    const sigNow = signalLine[idx]!;
    const sigPrev = signalLine[prevIdx]!;

    // Bullish: MACD sinyal çizgisini yukarı kesti
    if (macdPrev <= sigPrev && macdNow > sigNow) {
      const histNow = macdNow - sigNow;
      return {
        type: 'MACD Kesişimi',
        sembol,
        severity: i === 1 ? 'güçlü' : i <= 2 ? 'orta' : 'zayıf',
        direction: 'yukari',
        data: { macd: macdNow, signal: sigNow, histogram: histNow, crossoverCandlesAgo: i },
      };
    }
    // Bearish: MACD sinyal çizgisini aşağı kesti
    if (macdPrev >= sigPrev && macdNow < sigNow) {
      const histNow = macdNow - sigNow;
      return {
        type: 'MACD Kesişimi',
        sembol,
        severity: i === 1 ? 'güçlü' : i <= 2 ? 'orta' : 'zayıf',
        direction: 'asagi',
        data: { macd: macdNow, signal: sigNow, histogram: histNow, crossoverCandlesAgo: i },
      };
    }
  }
  return null;
}

// --- RSI Aşırı Alım / Aşırı Satım ---
export function detectRsiLevel(sembol: string, candles: OHLCVCandle[]): StockSignal | null {
  if (candles.length < 20) return null;
  const closes = candles.map((c) => c.close);
  const rsi = calculateRSI(closes, 14);
  const lastRsi = rsi[rsi.length - 1]!;

  if (lastRsi < 30) {
    return {
      type: 'RSI Seviyesi',
      sembol,
      severity: lastRsi < 25 ? 'güçlü' : lastRsi < 28 ? 'orta' : 'zayıf',
      direction: 'yukari',
      data: { rsi: lastRsi, level: 'oversold' },
    };
  }
  if (lastRsi > 70) {
    return {
      type: 'RSI Seviyesi',
      sembol,
      severity: lastRsi > 75 ? 'güçlü' : lastRsi > 72 ? 'orta' : 'zayıf',
      direction: 'asagi',
      data: { rsi: lastRsi, level: 'overbought' },
    };
  }
  return null;
}

// --- Bollinger Bandı Sıkışması ---
export function detectBollingerSqueeze(sembol: string, candles: OHLCVCandle[]): StockSignal | null {
  const PERIOD = 20;
  const LOOKBACK = 50; // Sıkışma karşılaştırması için geriye bak
  if (candles.length < PERIOD + LOOKBACK) return null;

  const closes = candles.map((c) => c.close);

  // Bollinger band genişliklerini hesapla
  const bandWidths: number[] = [];
  for (let i = PERIOD - 1; i < closes.length; i++) {
    const slice = closes.slice(i - PERIOD + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / PERIOD;
    const variance = slice.reduce((a, b) => a + (b - sma) ** 2, 0) / PERIOD;
    const stdev = Math.sqrt(variance);
    const width = sma > 0 ? (stdev * 4) / sma * 100 : 0; // (2*stdev yukarı + 2*stdev aşağı) / SMA
    bandWidths.push(width);
  }

  const currentWidth = bandWidths[bandWidths.length - 1]!;
  const recentWidths = bandWidths.slice(-LOOKBACK);
  const minWidth = Math.min(...recentWidths);

  // Sıkışma: mevcut genişlik, son LOOKBACK mumun minimumuyla neredeyse aynı (en dar %10 dilimde)
  const isSqueezing = currentWidth <= minWidth * 1.1 && currentWidth < 15;
  if (!isSqueezing) return null;

  // Yön: EMA9 vs EMA21 ve son kapanış vs SMA ile belirle
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const lastClose = closes[closes.length - 1]!;
  const lastEma9 = ema9[ema9.length - 1]!;
  const lastEma21 = ema21[ema21.length - 1]!;

  // Son 20 mumun SMA'sı (orta bant)
  const sma20 = closes.slice(-PERIOD).reduce((a, b) => a + b, 0) / PERIOD;

  let direction: SignalDirection;
  if (lastEma9 > lastEma21 && lastClose > sma20) {
    direction = 'yukari';
  } else if (lastEma9 < lastEma21 && lastClose < sma20) {
    direction = 'asagi';
  } else {
    direction = 'nötr';
  }

  const severity: SignalSeverity = currentWidth < 3 ? 'güçlü' : currentWidth < 5 ? 'orta' : 'zayıf';

  return {
    type: 'Bollinger Sıkışması',
    sembol,
    severity,
    direction,
    data: {
      bandWidth: parseFloat(currentWidth.toFixed(2)),
      minWidth50: parseFloat(minWidth.toFixed(2)),
      sma20: parseFloat(sma20.toFixed(2)),
    },
  };
}

// --- Golden Cross / Death Cross (EMA50 vs EMA200) ---
export function detectGoldenCross(sembol: string, candles: OHLCVCandle[]): StockSignal | null {
  if (candles.length < 205) return null;
  const closes = candles.map((c) => c.close);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);

  for (let i = 1; i <= 5 && candles.length - 1 - i >= 1; i++) {
    const idx = candles.length - 1 - i;
    const prevIdx = idx - 1;
    const e50Now = ema50[idx]!;
    const e50Prev = ema50[prevIdx]!;
    const e200Now = ema200[idx]!;
    const e200Prev = ema200[prevIdx]!;

    // Golden Cross: EMA50 EMA200'ü yukarı kesti
    if (e50Prev <= e200Prev && e50Now > e200Now) {
      return {
        type: 'Altın Çapraz',
        sembol,
        severity: i === 1 ? 'güçlü' : i <= 3 ? 'orta' : 'zayıf',
        direction: 'yukari',
        data: { ema50: e50Now, ema200: e200Now, crossoverCandlesAgo: i, crossType: 'golden' },
      };
    }
    // Death Cross: EMA50 EMA200'ü aşağı kesti
    if (e50Prev >= e200Prev && e50Now < e200Now) {
      return {
        type: 'Altın Çapraz',
        sembol,
        severity: i === 1 ? 'güçlü' : i <= 3 ? 'orta' : 'zayıf',
        direction: 'asagi',
        data: { ema50: e50Now, ema200: e200Now, crossoverCandlesAgo: i, crossType: 'death' },
      };
    }
  }
  return null;
}

export function detectAllSignals(
  sembol: string,
  candles: OHLCVCandle[],
  options?: { types?: string[] }
): StockSignal[] {
  const enabled = options?.types;
  const want = (type: string) => !enabled || enabled.length === 0 || enabled.includes(type);

  const signals: StockSignal[] = [];
  if (want('RSI Uyumsuzluğu'))        { const s = detectRsiDivergence(sembol, candles);          if (s) signals.push(s); }
  if (want('Hacim Anomalisi'))        { const s = detectVolumeAnomaly(sembol, candles);           if (s) signals.push(s); }
  if (want('Trend Başlangıcı'))       { const s = detectTrendStart(sembol, candles);              if (s) signals.push(s); }
  if (want('Destek/Direnç Kırılımı')) { const s = detectSupportResistanceBreak(sembol, candles); if (s) signals.push(s); }
  if (want('MACD Kesişimi'))          { const s = detectMACDCrossover(sembol, candles);           if (s) signals.push(s); }
  if (want('RSI Seviyesi'))           { const s = detectRsiLevel(sembol, candles);                if (s) signals.push(s); }
  if (want('Altın Çapraz'))           { const s = detectGoldenCross(sembol, candles);             if (s) signals.push(s); }
  if (want('Bollinger Sıkışması'))    { const s = detectBollingerSqueeze(sembol, candles);        if (s) signals.push(s); }
  return signals;
}
