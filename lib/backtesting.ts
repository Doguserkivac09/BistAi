/**
 * Backtesting Engine — Geçmiş sinyallerin performans analizi.
 * Makro koşullarına göre sinyal başarısını ölçer.
 *
 * Phase 7.1 — Temel engine
 * v2 (2026-04-18): Canonical horizon, Wilson 95% CI, t-test, return_30d, n=30 eşik
 */

import type { SignalPerformanceRecord } from './performance-types';

// ── Sabitler ────────────────────────────────────────────────────────

/** BIST retail komisyon tahmini (round-trip): alış + satış ≈ %0.4 */
const COMMISSION_ROUNDTRIP = 0.004;

/** Yeterli örneklem alt sınırı — merkezi limit teoremi için min 30 */
const MIN_SAMPLE = 30;

/** Sinyal tipinin "ömrü" — hangi horizon için değerlendirilmeli */
export const SIGNAL_HORIZONS: Record<string, Horizon> = {
  'RSI Seviyesi':           '3d',
  'Hacim Anomalisi':        '3d',
  'MACD Kesişimi':          '7d',
  'RSI Uyumsuzluğu':        '7d',
  'Bollinger Sıkışması':    '7d',
  'Trend Başlangıcı':       '14d',
  'Destek/Direnç Kırılımı': '14d',
  'Altın Çapraz':           '30d',
  'Ölüm Çaprazı':           '30d',
};

export function getCanonicalHorizon(signalType: string | undefined): Horizon {
  if (!signalType) return '7d';
  return SIGNAL_HORIZONS[signalType] ?? '7d';
}

// ── Türler ──────────────────────────────────────────────────────────

export type Horizon = '3d' | '7d' | '14d' | '30d';

type ReturnField = 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d';

function horizonField(h: Horizon): ReturnField {
  switch (h) {
    case '3d':  return 'return_3d';
    case '7d':  return 'return_7d';
    case '14d': return 'return_14d';
    case '30d': return 'return_30d';
  }
}

export interface BacktestResult {
  /** Test edilen filtre açıklaması */
  filterDescription: string;
  /** Toplam sinyal sayısı */
  totalSignals: number;
  /** Yeterli örneklem var mı? (min 30 — merkezi limit teoremi) */
  sufficientSample: boolean;
  /** Kazanma oranları (horizonlara göre, %) */
  winRates: {
    '3d':  number | null;
    '7d':  number | null;
    '14d': number | null;
    '30d': number | null;
  };
  /** Ortalama getiri (%) */
  avgReturns: {
    '3d':  number | null;
    '7d':  number | null;
    '14d': number | null;
    '30d': number | null;
  };
  /** Maksimum olumlu hareket (MFE) ortalaması */
  avgMfe: number | null;
  /** Maksimum olumsuz hareket (MAE) ortalaması */
  avgMae: number | null;
  /** Beklenen getiri (expectancy, 7g) */
  expectancy: number | null;
  /** Profit factor (7g) */
  profitFactor: number | null;
  /** Wilson 95% güven aralığı — 7g win rate için (yüzde) */
  winRateCI: { lower: number; upper: number } | null;
  /** t-istatistiği — 7g net getiri (komisyon sonrası) */
  tStat: number | null;
  /** p-değeri (iki-yanlı). n<50 ise null (güvenilmez) */
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

// ── Boş sonuç helper ────────────────────────────────────────────────

function emptyResult(filterDesc: string, n: number): BacktestResult {
  return {
    filterDescription: filterDesc,
    totalSignals: n,
    sufficientSample: false,
    winRates:   { '3d': null, '7d': null, '14d': null, '30d': null },
    avgReturns: { '3d': null, '7d': null, '14d': null, '30d': null },
    avgMfe: null,
    avgMae: null,
    expectancy: null,
    profitFactor: null,
    winRateCI: null,
    tStat: null,
    pValue: null,
  };
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

  if (filtered.length < MIN_SAMPLE) {
    return emptyResult(filterDesc, filtered.length);
  }

  // Sadece değerlendirilmiş sinyalleri al
  const evaluated = filtered.filter((r) => r.evaluated);
  if (evaluated.length < MIN_SAMPLE) {
    return emptyResult(filterDesc, evaluated.length);
  }

  const wr7 = calculateWinRate(evaluated, 'return_7d');
  const ci  = wr7 !== null ? wilsonCI(wr7 / 100, evaluated.filter((r) => r.return_7d != null).length) : null;
  const tt  = calculateTTest(evaluated, 'return_7d');

  return {
    filterDescription: filterDesc,
    totalSignals: evaluated.length,
    sufficientSample: true,
    winRates: {
      '3d':  calculateWinRate(evaluated, 'return_3d'),
      '7d':  wr7,
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
    winRateCI: ci,
    tStat: tt.tStat,
    pValue: tt.pValue,
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
  const signalTypes = ['RSI Uyumsuzluğu', 'Hacim Anomalisi', 'Trend Başlangıcı', 'Destek/Direnç Kırılımı'];
  for (const type of signalTypes) {
    const typeRecords = records.filter((r) => r.signal_type === type);
    if (typeRecords.length >= MIN_SAMPLE) {
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
  field: ReturnField
): number | null {
  const valid = records.filter((r) => r[field] != null);
  if (valid.length === 0) return null;

  const wins = valid.filter((r) => {
    const ret = r[field]!;
    return r.direction === 'yukari' ? ret > 0 : r.direction === 'asagi' ? ret < 0 : ret > 0;
  });

  return roundTo((wins.length / valid.length) * 100, 1);
}

function calculateAvgReturn(
  records: SignalPerformanceRecord[],
  field: ReturnField
): number | null {
  const valid = records.filter((r) => r[field] != null);
  if (valid.length === 0) return null;

  const sum = valid.reduce((s, r) => s + (r[field] ?? 0), 0);
  return roundTo((sum / valid.length) * 100, 2);
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

function calculateExpectancy(records: SignalPerformanceRecord[]): number | null {
  const valid = records.filter((r) => r.return_7d != null);
  if (valid.length === 0) return null;

  const wins: number[] = [];
  const losses: number[] = [];

  for (const r of valid) {
    const ret = r.return_7d!;
    const isWin = r.direction === 'yukari' ? ret > 0 : r.direction === 'asagi' ? ret < 0 : ret > 0;
    if (isWin) wins.push(Math.abs(ret));
    else losses.push(Math.abs(ret));
  }

  if (wins.length === 0 && losses.length === 0) return null;

  const winRate = wins.length / valid.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, w) => s + w, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, l) => s + l, 0) / losses.length : 0;

  return roundTo((winRate * avgWin - (1 - winRate) * avgLoss) * 100, 2);
}

function calculateProfitFactor(records: SignalPerformanceRecord[]): number | null {
  const valid = records.filter((r) => r.return_7d != null);
  if (valid.length === 0) return null;

  let grossProfit = 0;
  let grossLoss = 0;

  for (const r of valid) {
    const ret = r.return_7d!;
    const isWin = r.direction === 'yukari' ? ret > 0 : r.direction === 'asagi' ? ret < 0 : ret > 0;
    if (isWin) grossProfit += Math.abs(ret);
    else grossLoss += Math.abs(ret);
  }

  if (grossLoss === 0) return grossProfit > 0 ? 999 : null;
  return roundTo(grossProfit / grossLoss, 2);
}

// ── İstatistiksel Testler ────────────────────────────────────────────

/**
 * Wilson 95% güven aralığı — küçük örneklemlerde normal CI'den daha iyi.
 * p: oran (0-1), n: örneklem büyüklüğü.
 * Dönüş: { lower, upper } yüzde cinsinden.
 */
function wilsonCI(p: number, n: number): { lower: number; upper: number } | null {
  if (n < 10) return null;
  const z = 1.96; // 95%
  const denom  = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lower: roundTo((center - margin) * 100, 1),
    upper: roundTo((center + margin) * 100, 1),
  };
}

/**
 * Normal CDF — Abramowitz & Stegun 26.2.17 yaklaşımı.
 * |z| ≥ 1 için güvenilir, küçük z için de makul.
 */
function normalCDF(z: number): number {
  const b1 =  0.319381530;
  const b2 = -0.356563782;
  const b3 =  1.781477937;
  const b4 = -1.821255978;
  const b5 =  1.330274429;
  const p  =  0.2316419;
  const c  =  0.39894228; // 1/√(2π)
  if (z === 0) return 0.5;
  const absZ = Math.abs(z);
  const t = 1 / (1 + p * absZ);
  const cdf = 1 - c * Math.exp(-absZ * absZ / 2) *
    (t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5)))));
  return z > 0 ? cdf : 1 - cdf;
}

/**
 * Tek-örneklem t-testi — net getirinin (komisyon sonrası) sıfırdan anlamlı farklı olup olmadığı.
 * n<30'da null. n<50'de pValue güvenilmez (tStat döner, pValue null).
 */
function calculateTTest(
  records: SignalPerformanceRecord[],
  field: ReturnField
): { tStat: number | null; pValue: number | null } {
  const valid = records.filter((r) => r[field] != null);
  const n = valid.length;
  if (n < MIN_SAMPLE) return { tStat: null, pValue: null };

  // Yöne göre net getiri: yukari→ret, asagi→-ret; sonra komisyon düş
  const nets = valid.map((r) => {
    const raw = r[field] as number;
    const adjusted = r.direction === 'asagi' ? -raw : raw;
    return adjusted - COMMISSION_ROUNDTRIP;
  });

  const mean = nets.reduce((s, v) => s + v, 0) / n;
  const variance = nets.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  if (se === 0 || !Number.isFinite(se)) return { tStat: null, pValue: null };

  const t = mean / se;

  // n<50'de normal CDF yaklaşımı güvenilmez — tStat göster, pValue null
  if (n < 50) return { tStat: roundTo(t, 3), pValue: null };

  const pValue = 2 * (1 - normalCDF(Math.abs(t)));
  return { tStat: roundTo(t, 3), pValue: roundTo(pValue, 6) };
}

function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}
