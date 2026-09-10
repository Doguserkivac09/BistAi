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

/**
 * On-Balance Volume (OBV) — kümülatif hacim akışı.
 * Kapanış yükseldiyse +hacim, düştüyse −hacim. Fiyatla OBV çelişkisi (divergence)
 * akıllı para akışını (birikim/dağıtım) ele verir.
 */
export function calculateOBV(closes: number[], volumes: number[]): number[] {
  const obv = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const v = volumes[i] ?? 0;
    obv[i] = closes[i]! > closes[i - 1]! ? obv[i - 1] + v
           : closes[i]! < closes[i - 1]! ? obv[i - 1] - v
           : obv[i - 1];
  }
  return obv;
}

export interface VortexResult {
  /** VI+ (yükseliş vorteksi) — girişe hizalı, ilk `period` eleman NaN */
  viPlus: number[];
  /** VI- (düşüş vorteksi) */
  viMinus: number[];
}

/**
 * Vortex Indicator (Etienne Botes & Douglas Siepman).
 * VM+ = |High_t − Low_{t−1}|, VM- = |Low_t − High_{t−1}|, TR = true range.
 * VI+ = Σ VM+ / Σ TR (period), VI- = Σ VM- / Σ TR.
 * VI+ > VI-  → yükseliş baskın; VI- düşerken kesişim = "satış azalıyor".
 */
export function calculateVortex(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): VortexResult {
  const n = closes.length;
  const tr = new Array(n).fill(0);
  const vmPlus = new Array(n).fill(0);
  const vmMinus = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const h = highs[i]!, l = lows[i]!, pc = closes[i - 1]!, ph = highs[i - 1]!, pl = lows[i - 1]!;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    vmPlus[i] = Math.abs(h - pl);
    vmMinus[i] = Math.abs(l - ph);
  }
  const viPlus = new Array(n).fill(NaN);
  const viMinus = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    let sTr = 0, sP = 0, sM = 0;
    for (let j = i - period + 1; j <= i; j++) { sTr += tr[j]; sP += vmPlus[j]; sM += vmMinus[j]; }
    if (sTr > 0) { viPlus[i] = sP / sTr; viMinus[i] = sM / sTr; }
  }
  return { viPlus, viMinus };
}

// ── ADX / DMI (Wilder) ──────────────────────────────────────────────────────

export interface AdxResult {
  /** +DI — yükseliş yönlü hareket gücü (0-100). İlk `period` eleman NaN. */
  plusDi: number[];
  /** −DI — düşüş yönlü hareket gücü (0-100). */
  minusDi: number[];
  /**
   * ADX — TREND GÜCÜ (0-100), YÖNSÜZDÜR. İlk `2*period - 1` eleman NaN.
   *
   * ⚠️ Sık yapılan hata: yüksek ADX "yükseliş" sanılır. ADX yalnız trendin
   * ne kadar GÜÇLÜ olduğunu söyler; yönü +DI/−DI verir. ADX zirve yapıp
   * düşerken trend zayıflıyordur — yön değişimi DEĞİL, momentum kaybıdır.
   */
  adx: number[];
}

/**
 * ADX/DMI — Wilder (1978) orijinal yöntemi.
 *
 * Wilder yumuşatması (RMA) basit ortalama DEĞİLDİR:
 *   ilk değer  = ilk `period` elemanın TOPLAMI
 *   sonraki    = önceki − (önceki / period) + güncel
 * Bu, TradingView/Matriks gibi platformlarla aynı sayıyı üretir; SMA kullanmak
 * gözle görülür sapma yaratır (özellikle ADX'te).
 *
 * `period = 14` standart. Warmup: +DI/−DI `period`'dan, ADX `2*period-1`'den itibaren.
 */
export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): AdxResult {
  const n = closes.length;
  const plusDi = new Array(n).fill(NaN);
  const minusDi = new Array(n).fill(NaN);
  const adx = new Array(n).fill(NaN);
  if (n < period + 1) return { plusDi, minusDi, adx };

  const tr = new Array(n).fill(0);
  const plusDm = new Array(n).fill(0);
  const minusDm = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const h = highs[i]!, l = lows[i]!, ph = highs[i - 1]!, pl = lows[i - 1]!, pc = closes[i - 1]!;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const up = h - ph;      // yukarı hareket
    const down = pl - l;    // aşağı hareket
    // Yalnız BASKIN yön sayılır; ikisi de pozitifse büyük olan alınır, diğeri 0.
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }

  // Wilder yumuşatması — ilk pencere TOPLAM, sonrası kayan
  let sTr = 0, sPlus = 0, sMinus = 0;
  for (let i = 1; i <= period; i++) { sTr += tr[i]!; sPlus += plusDm[i]!; sMinus += minusDm[i]!; }

  const dx = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    if (i > period) {
      sTr = sTr - sTr / period + tr[i]!;
      sPlus = sPlus - sPlus / period + plusDm[i]!;
      sMinus = sMinus - sMinus / period + minusDm[i]!;
    }
    if (sTr > 0) {
      const pdi = 100 * (sPlus / sTr);
      const mdi = 100 * (sMinus / sTr);
      plusDi[i] = pdi;
      minusDi[i] = mdi;
      const toplam = pdi + mdi;
      dx[i] = toplam > 0 ? 100 * (Math.abs(pdi - mdi) / toplam) : 0;
    }
  }

  // ADX = DX'in Wilder yumuşatması; ilk ADX = ilk `period` DX'in ORTALAMASI
  const ilkAdxIdx = 2 * period - 1;
  if (n > ilkAdxIdx) {
    let toplamDx = 0;
    let sayi = 0;
    for (let i = period; i <= ilkAdxIdx; i++) {
      if (Number.isFinite(dx[i])) { toplamDx += dx[i]!; sayi++; }
    }
    if (sayi > 0) {
      adx[ilkAdxIdx] = toplamDx / sayi;
      for (let i = ilkAdxIdx + 1; i < n; i++) {
        if (Number.isFinite(dx[i]) && Number.isFinite(adx[i - 1])) {
          adx[i] = (adx[i - 1]! * (period - 1) + dx[i]!) / period;
        }
      }
    }
  }

  return { plusDi, minusDi, adx };
}
