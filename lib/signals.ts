/**
 * BIST hisseleri için teknik analiz sinyal tespit mantığı.
 * Her sinyal: { type, sembol, severity, direction, data }
 */

import type { OHLCVCandle, StockSignal, SignalSeverity, SignalDirection, ConfluenceResult } from '@/types';

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
  if (candles.length < 30) return null;

  // 50 gün lookback — daha anlamlı destek/direnç seviyeleri
  const lookback = Math.min(50, candles.length - 1);
  const reference = candles.slice(-lookback - 1, -1);
  const last = candles[candles.length - 1]!;
  const highN = Math.max(...reference.map((c) => c.high));
  const lowN  = Math.min(...reference.map((c) => c.low));
  const avgVol = averageVolume(candles, 20);
  const volRatio = avgVol > 0 ? last.volume / avgVol : 0;

  // Hacim: 0.8x ortalama yeterli (tam 1x zorunlu değil)
  const volOk = volRatio >= 0.8;

  // Kırılım yüzdesi — en az %0.3 ötede olmalı (gürültü değil, gerçek kırılım)
  const breakupPct   = highN > 0 ? ((last.close - highN) / highN) * 100 : 0;
  const breakdownPct = lowN  > 0 ? ((lowN - last.close)  / lowN)  * 100 : 0;

  if (breakupPct >= 0.3 && volOk) {
    const severity: SignalSeverity =
      volRatio >= 1.5 && breakupPct >= 1.5 ? 'güçlü' :
      volRatio >= 1.0 && breakupPct >= 0.5 ? 'orta'  : 'zayıf';
    return {
      type: 'Destek/Direnç Kırılımı',
      sembol,
      severity,
      direction: 'yukari',
      data: {
        level: parseFloat(highN.toFixed(2)),
        levelType: 'resistance',
        breakPrice: parseFloat(last.close.toFixed(2)),
        breakoutPct: parseFloat(breakupPct.toFixed(2)),
        volumeRatio: parseFloat(volRatio.toFixed(2)),
        volumeAboveAvg: volRatio >= 1,
      },
    };
  }

  if (breakdownPct >= 0.3 && volOk) {
    const severity: SignalSeverity =
      volRatio >= 1.5 && breakdownPct >= 1.5 ? 'güçlü' :
      volRatio >= 1.0 && breakdownPct >= 0.5 ? 'orta'  : 'zayıf';
    return {
      type: 'Destek/Direnç Kırılımı',
      sembol,
      severity,
      direction: 'asagi',
      data: {
        level: parseFloat(lowN.toFixed(2)),
        levelType: 'support',
        breakPrice: parseFloat(last.close.toFixed(2)),
        breakoutPct: parseFloat(breakdownPct.toFixed(2)),
        volumeRatio: parseFloat(volRatio.toFixed(2)),
        volumeAboveAvg: volRatio >= 1,
      },
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

  const macdLine   = ema12.map((v, i) => v - ema26[i]!);
  const signalLine = calculateEMA(macdLine, 9);

  // Son 7 mum içinde kesişim ara (5'ten 7'ye çıkarıldı)
  for (let i = 1; i <= 7 && candles.length - 1 - i >= 1; i++) {
    const idx     = candles.length - 1 - i;
    const prevIdx = idx - 1;
    const macdNow  = macdLine[idx]!;
    const macdPrev = macdLine[prevIdx]!;
    const sigNow   = signalLine[idx]!;
    const sigPrev  = signalLine[prevIdx]!;

    // Bullish: MACD sinyal çizgisini yukarı kesti
    if (macdPrev <= sigPrev && macdNow > sigNow) {
      const histNow  = macdNow - sigNow;
      // Son mumun histogramı öncekinden büyük mü? (momentum artıyor)
      const histPrev = macdLine[idx + 1]! - signalLine[idx + 1]!;
      const histExpanding = histNow > histPrev;
      // Sıfır çizgisi üstünde mi? (daha güçlü bull sinyali)
      const aboveZero = macdNow > 0;
      const severity: SignalSeverity =
        i === 1 && histExpanding && aboveZero ? 'güçlü' :
        i <= 3 && histExpanding               ? 'orta'  : 'zayıf';
      return {
        type: 'MACD Kesişimi',
        sembol, severity,
        direction: 'yukari',
        data: {
          macd: parseFloat(macdNow.toFixed(4)),
          signal: parseFloat(sigNow.toFixed(4)),
          histogram: parseFloat(histNow.toFixed(4)),
          histExpanding,
          aboveZero,
          crossoverCandlesAgo: i,
        },
      };
    }

    // Bearish: MACD sinyal çizgisini aşağı kesti
    if (macdPrev >= sigPrev && macdNow < sigNow) {
      const histNow  = macdNow - sigNow;
      const histPrev = macdLine[idx + 1]! - signalLine[idx + 1]!;
      const histExpanding = histNow < histPrev; // negatif tarafta genişliyor
      const belowZero = macdNow < 0;
      const severity: SignalSeverity =
        i === 1 && histExpanding && belowZero ? 'güçlü' :
        i <= 3 && histExpanding               ? 'orta'  : 'zayıf';
      return {
        type: 'MACD Kesişimi',
        sembol, severity,
        direction: 'asagi',
        data: {
          macd: parseFloat(macdNow.toFixed(4)),
          signal: parseFloat(sigNow.toFixed(4)),
          histogram: parseFloat(histNow.toFixed(4)),
          histExpanding,
          belowZero,
          crossoverCandlesAgo: i,
        },
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
  const n = rsi.length;
  const lastRsi = rsi[n - 1]!;
  const prevRsi = rsi[n - 2] ?? lastRsi;

  // 1. Bölgeden ÇIKIŞ (en güçlü sinyal): önceki gün bölgedeydi, bugün çıktı
  const crossingOutOversold   = prevRsi <= 32 && lastRsi > 32;  // Aşırı satımdan çıkış
  const crossingOutOverbought = prevRsi >= 68 && lastRsi < 68;  // Aşırı alımdan çıkış

  if (crossingOutOversold) {
    return {
      type: 'RSI Seviyesi',
      sembol,
      severity: prevRsi < 25 ? 'güçlü' : prevRsi < 28 ? 'orta' : 'zayıf',
      direction: 'yukari',
      data: {
        rsi: parseFloat(lastRsi.toFixed(1)),
        prevRsi: parseFloat(prevRsi.toFixed(1)),
        level: 'oversold_exit',
        risingFromOversold: true,
        rsiMomentum: parseFloat((lastRsi - prevRsi).toFixed(1)),
      },
    };
  }

  if (crossingOutOverbought) {
    return {
      type: 'RSI Seviyesi',
      sembol,
      severity: prevRsi > 75 ? 'güçlü' : prevRsi > 72 ? 'orta' : 'zayıf',
      direction: 'asagi',
      data: {
        rsi: parseFloat(lastRsi.toFixed(1)),
        prevRsi: parseFloat(prevRsi.toFixed(1)),
        level: 'overbought_exit',
        fallingFromOverbought: true,
        rsiMomentum: parseFloat((lastRsi - prevRsi).toFixed(1)),
      },
    };
  }

  // 2. Bölgede BULUNMA (devam sinyali): BIST için 32/68 eşiği (daha oynak piyasa)
  if (lastRsi <= 32) {
    return {
      type: 'RSI Seviyesi',
      sembol,
      severity: lastRsi < 25 ? 'güçlü' : lastRsi < 28 ? 'orta' : 'zayıf',
      direction: 'yukari',
      data: {
        rsi: parseFloat(lastRsi.toFixed(1)),
        prevRsi: parseFloat(prevRsi.toFixed(1)),
        level: 'oversold',
        risingFromOversold: lastRsi > prevRsi,
        rsiMomentum: parseFloat((lastRsi - prevRsi).toFixed(1)),
      },
    };
  }

  if (lastRsi >= 68) {
    return {
      type: 'RSI Seviyesi',
      sembol,
      severity: lastRsi > 75 ? 'güçlü' : lastRsi > 72 ? 'orta' : 'zayıf',
      direction: 'asagi',
      data: {
        rsi: parseFloat(lastRsi.toFixed(1)),
        prevRsi: parseFloat(prevRsi.toFixed(1)),
        level: 'overbought',
        fallingFromOverbought: lastRsi < prevRsi,
        rsiMomentum: parseFloat((lastRsi - prevRsi).toFixed(1)),
      },
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
  // EMA200 için en az 205 mum gerekli — tarama sayfası 252 gün çeker
  if (candles.length < 205) return null;
  const closes = candles.map((c) => c.close);
  const ema50  = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);

  // 10 mum lookback (EMA50/200 kesişimi yavaş gelişir, 5 çok dar)
  for (let i = 1; i <= 10 && candles.length - 1 - i >= 1; i++) {
    const idx     = candles.length - 1 - i;
    const prevIdx = idx - 1;
    const e50Now   = ema50[idx]!;
    const e50Prev  = ema50[prevIdx]!;
    const e200Now  = ema200[idx]!;
    const e200Prev = ema200[prevIdx]!;

    // Mesafe yüzdesi — ne kadar ayrışmış?
    const separationPct = e200Now > 0 ? ((e50Now - e200Now) / e200Now) * 100 : 0;

    if (e50Prev <= e200Prev && e50Now > e200Now) {
      return {
        type: 'Altın Çapraz',
        sembol,
        severity: i <= 2 ? 'güçlü' : i <= 5 ? 'orta' : 'zayıf',
        direction: 'yukari',
        data: {
          ema50: parseFloat(e50Now.toFixed(2)),
          ema200: parseFloat(e200Now.toFixed(2)),
          separationPct: parseFloat(separationPct.toFixed(2)),
          crossoverCandlesAgo: i,
          crossType: 'golden',
        },
      };
    }

    if (e50Prev >= e200Prev && e50Now < e200Now) {
      return {
        type: 'Altın Çapraz',
        sembol,
        severity: i <= 2 ? 'güçlü' : i <= 5 ? 'orta' : 'zayıf',
        direction: 'asagi',
        data: {
          ema50: parseFloat(e50Now.toFixed(2)),
          ema200: parseFloat(e200Now.toFixed(2)),
          separationPct: parseFloat(separationPct.toFixed(2)),
          crossoverCandlesAgo: i,
          crossType: 'death',
        },
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

  // candlesAgo: data'da crossoverCandlesAgo / candlesAgo varsa oradan al, yoksa 0
  return signals.map((s) => ({
    ...s,
    candlesAgo: (
      (s.data.crossoverCandlesAgo as number | undefined) ??
      (s.data.candlesAgo as number | undefined) ??
      0
    ),
  }));
}

// ─── Confluence (Güven Skoru) ──────────────────────────────────────────────────

const SIGNAL_CATEGORY: Record<string, string> = {
  'RSI Uyumsuzluğu':       'momentum',
  'RSI Seviyesi':           'momentum',
  'MACD Kesişimi':          'trend',
  'Trend Başlangıcı':       'trend',
  'Altın Çapraz':           'trend',
  'Hacim Anomalisi':        'hacim',
  'Destek/Direnç Kırılımı': 'yapı',
  'Bollinger Sıkışması':    'yapı',
};

const SEVERITY_POINTS: Record<string, number> = { güçlü: 35, orta: 22, zayıf: 12 };

export function computeConfluence(signals: StockSignal[]): ConfluenceResult {
  if (!signals.length) {
    return { score: 0, level: 'düşük', dominantDirection: 'nötr', bullishCount: 0, bearishCount: 0, categoryCount: 0 };
  }

  const bullish  = signals.filter((s) => s.direction === 'yukari');
  const bearish  = signals.filter((s) => s.direction === 'asagi');
  const dominant = bullish.length > bearish.length ? 'yukari'
                 : bearish.length > bullish.length ? 'asagi'
                 : bullish.length > 0              ? 'yukari' // eşitlik → yukarı tercih
                 : 'nötr';

  const dominantSigs = dominant === 'yukari' ? bullish : dominant === 'asagi' ? bearish : signals;
  const conflictCount = signals.length - dominantSigs.length;

  // 1. Severity puan toplamı (dominant yön sinyalleri)
  let score = dominantSigs.reduce((s, sig) => s + (SEVERITY_POINTS[sig.severity] ?? 12), 0);
  score = Math.min(60, score); // severity'den max 60

  // 2. Hizalama bonusu / cezası
  if (conflictCount === 0 && signals.length >= 2) score += 18; // tam konsensüs
  else if (conflictCount === 0)                   score += 8;  // tek sinyal, çelişme yok
  else                                            score -= conflictCount * 8;

  // 3. Kategori çeşitlendirme bonusu (+7 per ek kategori, max +22)
  const categories = new Set(dominantSigs.map((s) => SIGNAL_CATEGORY[s.type] ?? 'diğer'));
  score += Math.min(22, (categories.size - 1) * 7);

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    level: score >= 65 ? 'yüksek' : score >= 35 ? 'orta' : 'düşük',
    dominantDirection: dominant,
    bullishCount: bullish.length,
    bearishCount: bearish.length,
    categoryCount: categories.size,
  };
}
