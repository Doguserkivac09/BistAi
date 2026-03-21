'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  Scale,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Filter,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  BacktestResult,
  BacktestComparison,
  PerformanceMatrixRow,
} from '@/lib/backtesting';

// ── Types ──────────────────────────────────────────────────────────

interface BacktestingData {
  summary: BacktestResult;
  matrix: PerformanceMatrixRow[];
  comparisons: BacktestComparison[];
  totalRecords: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

const REGIME_LABELS: Record<string, string> = {
  bull_trend: 'Boğa',
  bear_trend: 'Ayı',
  sideways: 'Yatay',
  unknown: 'Belirsiz',
};

function regimeLabel(regime: string): string {
  return REGIME_LABELS[regime] ?? regime;
}

function winRateColor(rate: number | null): string {
  if (rate === null) return 'text-text-secondary';
  if (rate >= 55) return 'text-green-400';
  if (rate >= 45) return 'text-yellow-400';
  return 'text-red-400';
}

function winRateBg(rate: number | null): string {
  if (rate === null) return 'bg-white/5';
  if (rate >= 55) return 'bg-green-500/10';
  if (rate >= 45) return 'bg-yellow-500/10';
  return 'bg-red-500/10';
}

function fmt(val: number | null, suffix = ''): string {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(1)}${suffix}`;
}

function fmtPct(val: number | null): string {
  return fmt(val, '%');
}

// ── Backtesting Page ────────────────────────────────────────────────

export default function BacktestingPage() {
  const [data, setData] = useState<BacktestingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtreler
  const [days, setDays] = useState(90);
  const [direction, setDirection] = useState<'' | 'yukari' | 'asagi'>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (direction) params.set('direction', direction);
      const res = await fetch(`/api/backtesting?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const json: BacktestingData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri alınamadı');
    } finally {
      setLoading(false);
    }
  }, [days, direction]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Backtest Analizi
            </h1>
            <p className="text-sm text-text-secondary">
              Geçmiş sinyallerin performans raporu
            </p>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Filtreler */}
      <FilterBar
        days={days}
        setDays={setDays}
        direction={direction}
        setDirection={setDirection}
      />

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          {/* Summary cards skeleton */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          {/* Matrix skeleton */}
          <Skeleton className="h-6 w-64 mb-2" />
          <Skeleton className="h-48 rounded-lg" />
          {/* Comparison skeleton */}
          <Skeleton className="h-6 w-48 mb-2" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="mx-auto max-w-md rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="mb-4 text-red-300">{error}</p>
          <button
            onClick={fetchData}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary/80"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* No Data */}
      {!loading && !error && data && data.totalRecords === 0 && (
        <div className="mx-auto max-w-lg rounded-lg border border-border bg-surface p-10 text-center">
          <BarChart3 className="mx-auto mb-4 h-12 w-12 text-text-secondary" />
          <h2 className="mb-2 text-lg font-semibold text-text-primary">
            Henüz Yeterli Veri Yok
          </h2>
          <p className="text-sm text-text-secondary">
            Backtest analizi için en az 10 değerlendirilmiş sinyal gerekiyor.
            Tarama sayfasından sinyal toplayın ve 14+ gün bekleyin.
          </p>
        </div>
      )}

      {/* Data Sections */}
      {!loading && !error && data && data.totalRecords > 0 && (
        <>
          {/* A) Özet Kartları */}
          <SummaryCards summary={data.summary} total={data.totalRecords} />

          {/* B) Performans Matrisi */}
          <PerformanceMatrix matrix={data.matrix} />

          {/* C) Karşılaştırma Kartları */}
          <ComparisonCards comparisons={data.comparisons} />
        </>
      )}
    </div>
  );
}

// ── Filter Bar ──────────────────────────────────────────────────────

function FilterBar({
  days,
  setDays,
  direction,
  setDirection,
}: {
  days: number;
  setDays: (d: number) => void;
  direction: '' | 'yukari' | 'asagi';
  setDirection: (d: '' | 'yukari' | 'asagi') => void;
}) {
  const dayOptions = [
    { value: 30, label: '30 Gün' },
    { value: 90, label: '90 Gün' },
    { value: 180, label: '180 Gün' },
    { value: 365, label: '1 Yıl' },
  ];

  const dirOptions = [
    { value: '', label: 'Tümü' },
    { value: 'yukari', label: 'Sadece AL' },
    { value: 'asagi', label: 'Sadece SAT' },
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4">
      <Filter className="h-4 w-4 text-text-secondary" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Dönem:</span>
        <div className="flex rounded-lg border border-border">
          {dayOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                days === opt.value
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Yön:</span>
        <div className="flex rounded-lg border border-border">
          {dirOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                setDirection(opt.value as '' | 'yukari' | 'asagi')
              }
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                direction === opt.value
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Summary Cards ───────────────────────────────────────────────────

function SummaryCards({
  summary,
  total,
}: {
  summary: BacktestResult;
  total: number;
}) {
  const cards = [
    {
      label: 'Toplam Sinyal',
      value: String(total),
      icon: Activity,
      color: 'text-blue-400',
    },
    {
      label: 'Win Rate (7g)',
      value: fmtPct(summary.winRates['7d']),
      icon: Target,
      color: winRateColor(summary.winRates['7d']),
    },
    {
      label: 'Ort. Getiri (7g)',
      value: fmtPct(summary.avgReturns['7d']),
      icon: TrendingUp,
      color:
        summary.avgReturns['7d'] !== null && summary.avgReturns['7d']! > 0
          ? 'text-green-400'
          : 'text-red-400',
    },
    {
      label: 'Expectancy',
      value: fmtPct(summary.expectancy),
      icon: Scale,
      color:
        summary.expectancy !== null && summary.expectancy > 0
          ? 'text-green-400'
          : 'text-red-400',
    },
    {
      label: 'Profit Factor',
      value: fmt(summary.profitFactor),
      icon: BarChart3,
      color:
        summary.profitFactor !== null && summary.profitFactor > 1
          ? 'text-green-400'
          : 'text-red-400',
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-surface p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <card.icon className={`h-4 w-4 ${card.color}`} />
            <span className="text-xs text-text-secondary">{card.label}</span>
          </div>
          <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Performance Matrix ──────────────────────────────────────────────

function PerformanceMatrix({ matrix }: { matrix: PerformanceMatrixRow[] }) {
  if (matrix.length === 0) return null;

  // Collect all regime keys
  const regimeKeys = Array.from(
    new Set(matrix.flatMap((row) => Object.keys(row.regimes)))
  ).sort();

  return (
    <div className="mb-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
        <BarChart3 className="h-5 w-5 text-primary" />
        Sinyal Tipi × Rejim Performans Matrisi
      </h2>
      <p className="mb-4 text-xs text-text-secondary">
        Win rate (7 gün) • Yeşil &gt;55% • Sarı 45-55% • Kırmızı &lt;45%
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary">
                Sinyal Tipi
              </th>
              {regimeKeys.map((regime) => (
                <th
                  key={regime}
                  className="px-4 py-3 text-center text-xs font-medium text-text-secondary"
                >
                  {regimeLabel(regime)}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-medium text-text-primary">
                Genel
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr
                key={row.signalType}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-3 font-medium text-text-primary">
                  {row.signalType}
                </td>
                {regimeKeys.map((regime) => {
                  const result = row.regimes[regime];
                  return (
                    <MatrixCell key={regime} result={result} />
                  );
                })}
                <MatrixCell result={row.overall} highlight />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixCell({
  result,
  highlight,
}: {
  result?: BacktestResult;
  highlight?: boolean;
}) {
  if (!result || !result.sufficientSample) {
    return (
      <td
        className={`px-4 py-3 text-center ${
          highlight ? 'bg-white/5' : ''
        }`}
      >
        <span className="text-text-secondary">—</span>
        {result && (
          <div className="text-[10px] text-text-secondary">
            n={result.totalSignals}
          </div>
        )}
      </td>
    );
  }

  const wr = result.winRates['7d'];
  const ret = result.avgReturns['7d'];

  return (
    <td
      className={`px-4 py-3 text-center ${winRateBg(wr)} ${
        highlight ? 'border-l border-border' : ''
      }`}
    >
      <div className={`text-base font-bold ${winRateColor(wr)}`}>
        {fmtPct(wr)}
      </div>
      <div className="text-[11px] text-text-secondary">
        getiri: {fmtPct(ret)}
      </div>
      <div className="text-[10px] text-text-secondary">
        n={result.totalSignals}
      </div>
    </td>
  );
}

// ── Comparison Cards ────────────────────────────────────────────────

function ComparisonCards({
  comparisons,
}: {
  comparisons: BacktestComparison[];
}) {
  if (comparisons.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Scale className="h-5 w-5 text-primary" />
        Karşılaştırmalar
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        {comparisons.map((comp, i) => (
          <ComparisonCard key={i} comparison={comp} />
        ))}
      </div>
    </div>
  );
}

function ComparisonCard({
  comparison,
}: {
  comparison: BacktestComparison;
}) {
  const { groupA, groupB, advantage } = comparison;
  const aHasSample = groupA.sufficientSample;
  const bHasSample = groupB.sufficientSample;

  const AdvantageIcon =
    advantage.better === 'A'
      ? ArrowUp
      : advantage.better === 'B'
      ? ArrowDown
      : Minus;

  const advantageColor =
    advantage.better === 'A'
      ? 'text-green-400'
      : advantage.better === 'B'
      ? 'text-red-400'
      : 'text-yellow-400';

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">
        {comparison.title}
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Group A */}
        <div className="rounded-lg border border-border bg-white/5 p-3">
          <div className="mb-2 text-xs font-medium text-text-secondary">
            {groupA.filterDescription}
          </div>
          {aHasSample ? (
            <>
              <div className={`text-lg font-bold ${winRateColor(groupA.winRates['7d'])}`}>
                {fmtPct(groupA.winRates['7d'])}
              </div>
              <div className="text-[11px] text-text-secondary">
                getiri: {fmtPct(groupA.avgReturns['7d'])} • n={groupA.totalSignals}
              </div>
            </>
          ) : (
            <div className="text-sm text-text-secondary">
              Yetersiz veri (n={groupA.totalSignals})
            </div>
          )}
        </div>

        {/* Group B */}
        <div className="rounded-lg border border-border bg-white/5 p-3">
          <div className="mb-2 text-xs font-medium text-text-secondary">
            {groupB.filterDescription}
          </div>
          {bHasSample ? (
            <>
              <div className={`text-lg font-bold ${winRateColor(groupB.winRates['7d'])}`}>
                {fmtPct(groupB.winRates['7d'])}
              </div>
              <div className="text-[11px] text-text-secondary">
                getiri: {fmtPct(groupB.avgReturns['7d'])} • n={groupB.totalSignals}
              </div>
            </>
          ) : (
            <div className="text-sm text-text-secondary">
              Yetersiz veri (n={groupB.totalSignals})
            </div>
          )}
        </div>
      </div>

      {/* Advantage */}
      {aHasSample && bHasSample && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-border bg-white/5 py-2">
          <AdvantageIcon className={`h-4 w-4 ${advantageColor}`} />
          <span className={`text-sm font-medium ${advantageColor}`}>
            {advantage.better === 'equal'
              ? 'Eşit performans'
              : `${advantage.better === 'A' ? groupA.filterDescription : groupB.filterDescription} avantajlı`}
          </span>
          {advantage.winRateDiff !== null && (
            <span className="text-xs text-text-secondary">
              ({advantage.winRateDiff > 0 ? '+' : ''}
              {advantage.winRateDiff.toFixed(1)}% WR)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
