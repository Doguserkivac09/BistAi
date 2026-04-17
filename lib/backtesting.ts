/**
 * Backtesting Engine — Geçmiş sinyallerin performans analizi.
 * Makro koşullarına göre sinyal başarısını ölçer.
 *
 * Phase 7.1
 *
 * Sorular cevaplar:
 * - "Makro pozitifken teknik sinyaller ne kadar başarılı?"
 * - "Hangi sinyal tipi hangi piyasa koşulunda en iyi çalışıyor?"
 * - "Risk yüksekken AL sinyalleri tuttu mu?"
 */

import type { SignalPerformanceRecord } from './performance-types';

// ── Sabitler ────────────────────────────────────────────────────────

/**
 * BIST gidiş-dönüş komisyon maliyeti (decimal kesir).
 * Alış ~%0.2 + Satış ~%0.2 = ~%0.4 toplam.
 * Getiri hesaplamalarında her işlemden düşülür.
 */
const COMMISSION_ROUNDTRIP = 0.004;

/**
 * Her sinyal tipinin "doğal vadesi" — o sinyalin anlamlı sonuç verdiği ufuk.
 * Örn: Altın Çapraz bir trend değişim sinyali → 30 gün beklenir.
 * Hacim Anomalisi kısa vadeli momentum → 3 gün yeterli.
 */
export const SIGNAL_HORIZONS: Record<string, '3d' | '7d' | '14d' | '30d'> = {
  'Altın Çapraz':             '30d',
  'Ölüm Çaprazı':             '30d',
  'Trend Başlangıcı':         '14d',
  'Destek/Direnç Kırılımı':  '14d',
  'MACD Kesişimi':            '7d',
  'RSI Uyumsuzluğu':          '7d',
  'Bollinger Sıkışması':      '7d',
  'RSI Seviyesi':              '3d',
  'Hacim Anomalisi':           '3d',
};

export function getCanonicalHorizon(signalType: string): '3d' | '7d' | '14d' | '30d' {
  return SIGNAL_HORIZONS[signalType] ?? '7d';
}

// ── Türler ──────────────────────────────────────────────────────────

/** Equity curve veri noktası */
export interface EquityPoint {
  /** YYYY-MM-DD */
  date: string;
  /** Normalize edilmiş equity (100 = başlangıç) */
  equity: number;
}

export interface BacktestResult {
  /** Test edilen filtre açıklaması */
  filterDescription: string;
  /** Toplam sinyal sayısı */
  totalSignals: number;
  /** Yeterli örneklem var mı? (min 10) */
  sufficientSample: boolean;
  /** Kazanma oranları (horizonlara göre) */
  winRates: {
    '3d': number | null;
    '7d': number | null;
    '14d': number | null;
    '30d': number | null;
  };
  /** Ortalama getiri (%) */
  avgReturns: {
    '3d': number | null;
    '7d': number | null;
    '14d': number | null;
    '30d': number | null;
  };
  /** Sinyal tipine özgü "doğal vade" ve o vadenin metrikleri */
  canonicalHorizon: '3d' | '7d' | '14d' | '30d';
  canonicalWinRate: number | null;
  canonicalAvgReturn: number | null;
  /** Maksimum olumlu hareket (MFE) ortalaması */
  avgMfe: number | null;
  /** Maksimum olumsuz hareket (MAE) ortalaması */
  avgMae: number | null;
  /** Beklenen getiri (expectancy) */
  expectancy: number | null;
  /** Profit factor */
  profitFactor: number | null;
  /**
   * Maksimum Drawdown (%) — 7 günlük net getirilerin kümülatif seyrindeki
   * tepe-den-dip en büyük düşüş. Negatif değer (örn: -12.5 = %12.5 drawdown).
   */
  maxDrawdown: number | null;
  /**
   * Sharpe Ratio — risk-ağırlıklı getiri ölçütü.
   * (Ort. net getiri - risksiz faiz) / Std. sapma
   * >1 iyi, >2 çok iyi, <0 kötü.
   */
  sharpeRatio: number | null;
  /**
   * İstatistiksel anlamlılık — tek örneklem t-testi (H₀: ort. getiri = 0).
   * pValue < 0.05 → istatistiksel olarak anlamlı edge var.
   * tStat: t istatistiği; pValue: yaklaşık p-değeri (iki kuyruklu).
   */
  tStat: number | null;
  pValue: number | null;
}

export interface BacktestComparison {
  /** Karşılaştırma açıklaması */
  title: string;
  /** Filtre A sonuçları */
  groupA: BacktestResult;
  /** Filtre B sonuçları */
  groupB: BacktestResult;
  /** A'nın B'ye göre avantajı */
  advantage: {
    winRateDiff: number | null;  // A - B kazanma oranı farkı
    returnDiff: number | null;   // A - B getiri farkı
    better: 'A' | 'B' | 'equal';
  };
}

export interface BacktestFilter {
  signalType?: string;
  direction?: 'yukari' | 'asagi';
  regime?: string;
  /** Makro skor aralığı (snapshot'lardan) */
  macroScoreRange?: { min: number; max: number };
  /** Tarih aralığı */
  dateRange?: { start: string; end: string };
  /** Sembol */
  sembol?: string;
}

// ── Ana Backtest Fonksiyonları ───────────────────────────────────────

/**
 * Filtrelere göre sinyal performansını analiz eder.
 */
export function runBacktest(
  records: SignalPerformanceRecord[],
  filter?: BacktestFilter
): BacktestResult {
  // Filtrele
  const filtered = applyFilter(records, filter);
  const filterDesc = describeFilter(filter);

  const canonicalHorizon = getCanonicalHorizon(filter?.signalType ?? '');

  const emptyResult = (count: number): BacktestResult => ({
    filterDescription: filterDesc,
    totalSignals: count,
    sufficientSample: false,
    winRates: { '3d': null, '7d': null, '14d': null, '30d': null },
    avgReturns: { '3d': null, '7d': null, '14d': null, '30d': null },
    avgMfe: null,
    avgMae: null,
    expectancy: null,
    profitFactor: null,
    maxDrawdown: null,
    sharpeRatio: null,
    tStat: null,
    pValue: null,
    canonicalHorizon,
    canonicalWinRate: null,
    canonicalAvgReturn: null,
  });

  if (filtered.length < 10) return emptyResult(filtered.length);

  // Sadece değerlendirilmiş sinyalleri al
  const evaluated = filtered.filter((r) => r.evaluated);
  if (evaluated.length < 10) return emptyResult(evaluated.length);

  const canonicalField = `return_${canonicalHorizon}` as 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d';

  return {
    filterDescription: filterDesc,
    totalSignals: evaluated.length,
    sufficientSample: true,
    winRates: {
      '3d':  calculateWinRate(evaluated, 'return_3d'),
      '7d':  calculateWinRate(evaluated, 'return_7d'),
      '14d': calculateWinRate(evaluated, 'return_14d'),
      '30d': calculateWinRate(evaluated, 'return_30d'),
    },
    avgReturns: {
      '3d':  calculateAvgReturn(evaluated, 'return_3d'),
      '7d':  calculateAvgReturn(evaluated, 'return_7d'),
      '14d': calculateAvgReturn(evaluated, 'return_14d'),
      '30d': calculateAvgReturn(evaluated, 'return_30d'),
    },
    avgMfe: calculateAvg(evaluated, 'mfe'),
    avgMae: calculateAvg(evaluated, 'mae'),
    expectancy: calculateExpectancy(evaluated),
    profitFactor: calculateProfitFactor(evaluated),
    maxDrawdown: calculateMaxDrawdown(evaluated),
    sharpeRatio: calculateSharpeRatio(evaluated),
    ...calculateTTest(evaluated),
    canonicalHorizon,
    canonicalWinRate: calculateWinRate(evaluated, canonicalField),
    canonicalAvgReturn: calculateAvgReturn(evaluated, canonicalField),
  };
}

/**
 * İki farklı koşulu karşılaştırır.
 * Örn: "Makro pozitifken vs negatifken AL sinyalleri"
 */
export function compareBacktests(
  records: SignalPerformanceRecord[],
  filterA: BacktestFilter,
  filterB: BacktestFilter,
  title: string
): BacktestComparison {
  const groupA = runBacktest(records, filterA);
  const groupB = runBacktest(records, filterB);

  const winRateA = groupA.winRates['7d'];
  const winRateB = groupB.winRates['7d'];
  const returnA = groupA.avgReturns['7d'];
  const returnB = groupB.avgReturns['7d'];

  const winRateDiff = winRateA !== null && winRateB !== null
    ? roundTo(winRateA - winRateB, 2) : null;
  const returnDiff = returnA !== null && returnB !== null
    ? roundTo(returnA - returnB, 2) : null;

  let better: 'A' | 'B' | 'equal' = 'equal';
  if (winRateDiff !== null) {
    if (winRateDiff > 2) better = 'A';
    else if (winRateDiff < -2) better = 'B';
  }

  return {
    title,
    groupA,
    groupB,
    advantage: { winRateDiff, returnDiff, better },
  };
}

/**
 * Random giriş baseline — sinyalsiz rastgele alım/satım başarı oranı.
 *
 * Yöntem: Tüm evaluate edilmiş kayıtların return_7d değerlerini karıştır,
 * N adet rastgele seç (monte carlo yok, basit bootstrap) → medyan başarı oranı.
 *
 * Bu, "sinyal gerçekten coin atışından iyi mi?" sorusunu cevaplar.
 * Beklenen baseline: yaklaşık %50 (fiyat yarın yukarı mı aşağı mı?).
 *
 * Dönüş:
 * - randomWinRate: rastgele giriş yapıldığında beklenen başarı oranı
 * - signalEdge: sinyal win rate - random win rate (pozitif = edge var)
 */
export function computeRandomBaseline(
  records: SignalPerformanceRecord[],
  horizon: '3d' | '7d' | '14d' | '30d' = '7d',
): { randomWinRate: number | null; signalEdge: number | null } {
  const field: 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d' =
    horizon === '3d'  ? 'return_3d'  :
    horizon === '7d'  ? 'return_7d'  :
    horizon === '14d' ? 'return_14d' :
                        'return_30d';

  const evaluated = records.filter(
    (r) => r.evaluated && r[field] != null
  );
  if (evaluated.length < 10) return { randomWinRate: null, signalEdge: null };

  // Tüm getirileri karıştır → baseline win rate
  const allReturns = evaluated
    .map((r) => r[field] as number | null)
    .filter((v): v is number => v != null);

  const baselineWinRate = allReturns.filter((v) => v > 0).length / allReturns.length;

  const signalWinRate = calculateWinRate(evaluated, field);
  const signalEdge = signalWinRate !== null
    ? roundTo(signalWinRate - baselineWinRate, 4)
    : null;

  return {
    randomWinRate: roundTo(baselineWinRate, 4),
    signalEdge,
  };
}

/**
 * Hazır karşılaştırmalar: makro koşullarına göre sinyal performansı.
 */
export function generateStandardComparisons(
  records: SignalPerformanceRecord[]
): BacktestComparison[] {
  const comparisons: BacktestComparison[] = [];

  // 1. Bull vs Bear rejimde sinyal performansı
  comparisons.push(
    compareBacktests(
      records,
      { regime: 'bull_trend', direction: 'yukari' },
      { regime: 'bear_trend', direction: 'yukari' },
      'Boğa vs Ayı piyasasında AL sinyalleri'
    )
  );

  // 2. Sinyal tiplerine göre karşılaştırma
  const signalTypes = ['RSI Uyumsuzluğu', 'Hacim Anomalisi', 'Trend Başlangıcı', 'Kırılım'];
  for (const type of signalTypes) {
    const typeRecords = records.filter((r) => r.signal_type === type);
    if (typeRecords.length >= 20) {
      comparisons.push(
        compareBacktests(
          typeRecords,
          { regime: 'bull_trend' },
          { regime: 'bear_trend' },
          `${type}: Boğa vs Ayı piyasası`
        )
      );
    }
  }

  return comparisons;
}

/**
 * Sinyal tipi × rejim performans matrisi.
 * Her kombinasyon için win rate ve ortalama getiri.
 */
export function generatePerformanceMatrix(
  records: SignalPerformanceRecord[]
): PerformanceMatrixRow[] {
  const signalTypes = Array.from(new Set(records.map((r) => r.signal_type)));
  const regimes = ['bull_trend', 'bear_trend', 'sideways'];
  const matrix: PerformanceMatrixRow[] = [];

  for (const type of signalTypes) {
    const row: PerformanceMatrixRow = {
      signalType: type,
      regimes: {},
      overall: runBacktest(records, { signalType: type }),
    };

    for (const regime of regimes) {
      row.regimes[regime] = runBacktest(records, { signalType: type, regime });
    }

    matrix.push(row);
  }

  return matrix;
}

export interface PerformanceMatrixRow {
  signalType: string;
  regimes: Record<string, BacktestResult>;
  overall: BacktestResult;
}

// ── Filtreleme ──────────────────────────────────────────────────────

function applyFilter(
  records: SignalPerformanceRecord[],
  filter?: BacktestFilter
): SignalPerformanceRecord[] {
  if (!filter) return records;

  let result = records;

  if (filter.signalType) {
    result = result.filter((r) => r.signal_type === filter.signalType);
  }
  if (filter.direction) {
    result = result.filter((r) => r.direction === filter.direction);
  }
  if (filter.regime) {
    result = result.filter((r) => r.regime === filter.regime);
  }
  if (filter.sembol) {
    result = result.filter((r) => r.sembol === filter.sembol);
  }
  if (filter.dateRange) {
    const start = new Date(filter.dateRange.start).getTime();
    const end = new Date(filter.dateRange.end).getTime();
    result = result.filter((r) => {
      const t = new Date(r.entry_time).getTime();
      return t >= start && t <= end;
    });
  }

  return result;
}

function describeFilter(filter?: BacktestFilter): string {
  if (!filter) return 'Tüm sinyaller';

  const parts: string[] = [];
  if (filter.signalType) parts.push(`Tip: ${filter.signalType}`);
  if (filter.direction) parts.push(`Yön: ${filter.direction}`);
  if (filter.regime) parts.push(`Rejim: ${filter.regime}`);
  if (filter.sembol) parts.push(`Sembol: ${filter.sembol}`);
  if (filter.dateRange) parts.push(`Tarih: ${filter.dateRange.start} — ${filter.dateRange.end}`);

  return parts.length > 0 ? parts.join(', ') : 'Tüm sinyaller';
}

// ── Hesaplama Yardımcıları ──────────────────────────────────────────

function calculateWinRate(
  records: SignalPerformanceRecord[],
  field: 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'
): number | null {
  const valid = records.filter((r) => r[field] != null);
  if (valid.length === 0) return null;

  const wins = valid.filter((r) => {
    const ret = r[field]!;
    // Komisyon düşüldükten sonra pozitif kalan = gerçek kazanan
    // evaluate-engine convention: ret decimal kesir (0.05 = %5)
    return (ret - COMMISSION_ROUNDTRIP) > 0;
  });

  return roundTo((wins.length / valid.length) * 100, 1);
}

function calculateAvgReturn(
  records: SignalPerformanceRecord[],
  field: 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'
): number | null {
  const valid = records.filter((r) => r[field] != null);
  if (valid.length === 0) return null;

  const sum = valid.reduce((s, r) => s + (r[field] ?? 0), 0);
  // Komisyonu ortalamadan düş — her işlem başına ~%0.4 maliyet
  return roundTo((sum / valid.length - COMMISSION_ROUNDTRIP) * 100, 2);
}

function calculateAvg(
  records: SignalPerformanceRecord[],
  field: 'mfe' | 'mae'
): number | null {
  const valid = records.filter((r) => r[field] != null);
  if (valid.length === 0) return null;

  const sum = valid.reduce((s, r) => s + (r[field] ?? 0), 0);
  return roundTo((sum / valid.length) * 100, 2);
}

/**
 * Tek örneklem t-testi: H₀ — ortalama net getiri = 0.
 * t = (mean / (std / sqrt(n)))
 * p-value: normal dağılım yaklaşımı (n > 30 için güvenilir).
 * İki kuyruklu test.
 */
function calculateTTest(records: SignalPerformanceRecord[]): { tStat: number | null; pValue: number | null } {
  const valid = records.filter((r) => r.return_7d != null);
  if (valid.length < 30) return { tStat: null, pValue: null };

  const nets = valid.map((r) => r.return_7d! - COMMISSION_ROUNDTRIP);
  const n    = nets.length;
  const mean = nets.reduce((s, r) => s + r, 0) / n;
  const variance = nets.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);

  if (se === 0) return { tStat: null, pValue: null };
  const t = mean / se;

  // İki kuyruklu p-value — standart normal CDF yaklaşımı (Abramowitz & Stegun)
  const pValue = 2 * (1 - normalCDF(Math.abs(t)));

  return { tStat: roundTo(t, 3), pValue: roundTo(pValue, 6) };
}

/** Standart normal kümülatif dağılım fonksiyonu (yaklaşım) */
function normalCDF(z: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t2 = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t2 + a4) * t2 + a3) * t2 + a2) * t2 + a1) * t2 * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Sharpe Ratio — (Ort. net getiri - Risksiz faiz) / Std. sapma
 *
 * Risksiz faiz: Türkiye mevduat faizi ~%45/yıl → 7 günde: 45%/52 ≈ %0.865.
 * Decimal kesir olarak: 0.00865. Sinyal başına 7 günlük getiri kullanılır.
 * >1 iyi, >2 çok iyi, <0 kayıplar risksiz faizi bile karşılamıyor.
 */
function calculateSharpeRatio(records: SignalPerformanceRecord[]): number | null {
  const valid = records.filter((r) => r.return_7d != null);
  if (valid.length < 10) return null;

  // TCMB politika faizi ~%45/yıl → 7 günlük risksiz getiri
  const RISK_FREE_7D = 0.45 / 52;

  const nets = valid.map((r) => r.return_7d! - COMMISSION_ROUNDTRIP);
  const mean = nets.reduce((s, r) => s + r, 0) / nets.length;
  const variance = nets.reduce((s, r) => s + (r - mean) ** 2, 0) / (nets.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return null;
  return roundTo((mean - RISK_FREE_7D) / stdDev, 3);
}

/**
 * Kümülatif equity curve — 7 günlük net getirileri tarih sırasına göre
 * birleştirir. Başlangıç değeri 100, her nokta bir işlem günü.
 *
 * Metodoloji: Sinyalleri entry_time'a göre sıralar; günlük gruplama yaparak
 * aynı günde birden fazla sinyal varsa ortalama alır. Sonuç lightweight-charts
 * Line serisi formatında {date, value} dizi olarak döner.
 */
export function calculateEquityCurve(records: SignalPerformanceRecord[]): EquityPoint[] {
  const valid = records
    .filter((r) => r.return_7d != null)
    .sort((a, b) => new Date(a.entry_time).getTime() - new Date(b.entry_time).getTime());

  if (valid.length < 2) return [];

  // Günlük ortalama getiri
  const byDate = new Map<string, number[]>();
  for (const r of valid) {
    const date = r.entry_time.slice(0, 10);
    const net  = r.return_7d! - COMMISSION_ROUNDTRIP;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(net);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  const points: EquityPoint[] = [];
  let equity = 100;

  for (const date of sortedDates) {
    const rets = byDate.get(date)!;
    const avgRet = rets.reduce((s, r) => s + r, 0) / rets.length;
    equity *= (1 + avgRet);
    points.push({ date, equity: roundTo(equity, 2) });
  }

  return points;
}

/**
 * R-multiple beklentisi (Van Tharp formülü):
 *   E = WinRate × (AvgWin / AvgLoss) − LossRate
 *
 * Ort. Getiri'den farklı, risk-ağırlıklı bir metrik:
 * "+0.34" → her birim ortalama kayıp başına 0.34 birim beklenen kazanç.
 * 0 üstü = sistem edge'i var, 0 altı = kaybettiren sistem.
 */
function calculateExpectancy(records: SignalPerformanceRecord[]): number | null {
  const valid = records.filter((r) => r.return_7d != null);
  if (valid.length === 0) return null;

  const wins: number[] = [];
  const losses: number[] = [];

  for (const r of valid) {
    // Komisyon düşülmüş net getiri
    const ret = r.return_7d! - COMMISSION_ROUNDTRIP;
    if (ret > 0) wins.push(ret);
    else if (ret < 0) losses.push(Math.abs(ret));
  }

  if (wins.length === 0 || losses.length === 0) return null;

  const winRate = wins.length / valid.length;
  const avgWin  = wins.reduce((s, w) => s + w, 0) / wins.length;
  const avgLoss = losses.reduce((s, l) => s + l, 0) / losses.length;

  if (avgLoss === 0) return null;

  // R = avgWin / avgLoss (ödül / risk oranı)
  return roundTo(winRate * (avgWin / avgLoss) - (1 - winRate), 3);
}

function calculateProfitFactor(records: SignalPerformanceRecord[]): number | null {
  const valid = records.filter((r) => r.return_7d != null);
  if (valid.length === 0) return null;

  let grossProfit = 0;
  let grossLoss = 0;

  for (const r of valid) {
    // Komisyon düşülmüş net getiri
    const ret = r.return_7d! - COMMISSION_ROUNDTRIP;
    if (ret > 0) grossProfit += ret;
    else grossLoss += Math.abs(ret);
  }

  if (grossLoss === 0) return grossProfit > 0 ? 999 : null;
  return roundTo(grossProfit / grossLoss, 2);
}

/**
 * Maksimum Drawdown — günlük ortalama net getiriler üzerinden kümülatif
 * en büyük tepe-den-dip düşüş (%).
 *
 * Metodoloji: Sinyalleri entry tarihine göre günlük gruplar, her gün için
 * ortalama net getiri alır (calculateEquityCurve ile aynı), ardından
 * kümülatif equity serisindeki en büyük ardışık düşüşü bulur.
 * Bireysel sinyal yığılmasını önler.
 */
function calculateMaxDrawdown(records: SignalPerformanceRecord[]): number | null {
  const valid = records.filter((r) => r.return_7d != null);
  if (valid.length < 2) return null;

  // Günlük ortalama net getiri (calculateEquityCurve ile aynı metodoloji)
  const byDate = new Map<string, number[]>();
  for (const r of valid) {
    const date = r.entry_time.slice(0, 10);
    const net  = r.return_7d! - COMMISSION_ROUNDTRIP;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(net);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  if (sortedDates.length < 2) return null;

  let peak = 1.0;
  let equity = 1.0;
  let maxDD = 0;

  for (const date of sortedDates) {
    const rets = byDate.get(date)!;
    const avgRet = rets.reduce((s, r) => s + r, 0) / rets.length;
    equity *= (1 + avgRet);
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  // Yüzde olarak döndür (negatif, örn: -12.5)
  return roundTo(maxDD * 100, 2);
}

function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}
