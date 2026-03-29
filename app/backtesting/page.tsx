'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, RefreshCw, TrendingUp, TrendingDown, Target, Activity,
  Scale, AlertTriangle, ArrowUp, ArrowDown, Minus, Filter,
  Download, ChevronDown, ChevronRight, HelpCircle, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  BacktestResult,
  BacktestComparison,
  PerformanceMatrixRow,
} from '@/lib/backtesting';

// ── Türler ──────────────────────────────────────────────────────────

type Horizon = '3d' | '7d' | '14d';

interface BacktestingData {
  summary: BacktestResult;
  matrix: PerformanceMatrixRow[];
  comparisons: BacktestComparison[];
  totalRecords: number;
}

// ── Sabitler ────────────────────────────────────────────────────────

const HORIZON_LABELS: Record<Horizon, string> = {
  '3d':  '3 Günlük',
  '7d':  '7 Günlük',
  '14d': '14 Günlük',
};

const REGIME_LABELS: Record<string, string> = {
  bull_trend: 'Boğa',
  bear_trend: 'Ayı',
  sideways:   'Yatay',
  unknown:    'Belirsiz',
};

const SIGNAL_TYPES = [
  'RSI Uyumsuzluğu',
  'Hacim Anomalisi',
  'Trend Başlangıcı',
  'Destek/Direnç Kırılımı',
  'MACD Kesişimi',
  'RSI Seviyesi',
  'Altın Çapraz',
  'Bollinger Sıkışması',
];

// ── Yardımcılar ─────────────────────────────────────────────────────

function regimeLabel(r: string): string {
  return REGIME_LABELS[r] ?? r;
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

function fmt(val: number | null | undefined, suffix = ''): string {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(1)}${suffix}`;
}

function fmtPct(val: number | null | undefined, showSign = false): string {
  if (val === null || val === undefined) return '—';
  const sign = showSign && val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

/** R-multiple beklentisi — "0 = yok, +0.35 = her birim kayıp başına 0.35 kazanç" */
function fmtR(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}R`;
}

function exportCSV(matrix: PerformanceMatrixRow[], regimeKeys: string[], horizon: Horizon) {
  const headers = ['Sinyal Tipi', ...regimeKeys.map(r => `${regimeLabel(r)} WR%`), 'Genel WR%', 'Genel Getiri%', 'n'];
  const rows = matrix.map(row => [
    `"${row.signalType}"`,
    ...regimeKeys.map(r => (row.regimes[r]?.winRates[horizon] ?? null) !== null ? row.regimes[r]!.winRates[horizon]!.toFixed(1) : '—'),
    row.overall.winRates[horizon] !== null ? row.overall.winRates[horizon]!.toFixed(1) : '—',
    row.overall.avgReturns[horizon] !== null ? row.overall.avgReturns[horizon]!.toFixed(1) : '—',
    String(row.overall.totalSignals),
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `bistai-backtest-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Horizon Tabs ────────────────────────────────────────────────────

function HorizonTabs({ horizon, setHorizon }: { horizon: Horizon; setHorizon: (h: Horizon) => void }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-surface/50 p-1 gap-0.5">
      {(['3d', '7d', '14d'] as Horizon[]).map((h) => (
        <button
          key={h}
          onClick={() => setHorizon(h)}
          className={`relative rounded-lg px-5 py-1.5 text-sm font-semibold transition-colors ${
            horizon === h ? 'text-white' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {horizon === h && (
            <motion.div
              layoutId="horizon-bg"
              className="absolute inset-0 rounded-lg bg-primary"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-10">
            <span className="sm:hidden">{h.toUpperCase()}</span>
            <span className="hidden sm:inline">{HORIZON_LABELS[h]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Info Row ────────────────────────────────────────────────────────

function InfoRow({
  total, days, lastFetch,
}: { total: number; days: number; lastFetch: Date | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface/30 px-4 py-2.5 text-sm text-text-secondary">
      <span className="flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold text-text-primary">{total}</span> sinyal analiz edildi
      </span>
      <span className="text-text-muted">·</span>
      <span>Son <span className="font-semibold text-text-primary">{days}</span> gün</span>
      {lastFetch && (
        <>
          <span className="text-text-muted">·</span>
          <span>
            Güncelleme:{' '}
            <span className="font-mono text-text-primary">
              {lastFetch.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        </>
      )}
    </div>
  );
}

// ── Win/Loss Dağılım Barı ───────────────────────────────────────────

function WinLossBar({ total, winRate }: { total: number; winRate: number | null }) {
  if (winRate === null || total === 0) return null;
  const winPct  = Math.round(winRate);
  const lossPct = 100 - winPct;
  const winN    = Math.round(total * winPct / 100);
  const lossN   = total - winN;

  return (
    <div className="mb-6">
      <p className="mb-2 text-xs text-text-muted uppercase tracking-wide font-semibold">Kazanan / Kaybeden Dağılımı</p>
      <div className="h-8 w-full rounded-xl overflow-hidden flex text-xs font-semibold">
        <div
          className="flex items-center justify-center bg-green-500/65 text-white transition-all duration-700"
          style={{ width: `${winPct}%` }}
        >
          {winPct >= 18 ? `${winPct}% Kazanan` : ''}
        </div>
        <div
          className="flex items-center justify-center bg-red-500/55 text-white transition-all duration-700"
          style={{ width: `${lossPct}%` }}
        >
          {lossPct >= 18 ? `${lossPct}% Kaybeden` : ''}
        </div>
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] text-text-muted">
        <span className="text-green-400">{winN} kazanan sinyal</span>
        <span className="text-red-400">{lossN} kaybeden sinyal</span>
      </div>
    </div>
  );
}

// ── Risk/Reward Barı ────────────────────────────────────────────────

function RiskRewardBar({
  mfe, mae, expectancy,
}: { mfe: number | null; mae: number | null; expectancy: number | null }) {
  if (mfe === null || mae === null) return null;
  const absMae  = Math.abs(mae);
  const total   = mfe + absMae || 1;
  const mfePct  = (mfe  / total) * 100;
  const maePct  = (absMae / total) * 100;
  const rr      = absMae > 0 ? mfe / absMae : null;
  const rrColor = rr !== null
    ? rr >= 1.5 ? 'text-green-400' : rr >= 1 ? 'text-yellow-400' : 'text-red-400'
    : 'text-text-secondary';

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface/50 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Risk / Reward Görselleştirmesi</p>
        <div className="flex items-center gap-4 text-xs">
          {rr !== null && (
            <span className="text-text-muted">
              R/R Oranı: <span className={`font-bold ${rrColor}`}>{rr.toFixed(2)}</span>
            </span>
          )}
          {expectancy !== null && (
            <span className="text-text-muted">
              Expectancy:{' '}
              <span className={`font-bold ${expectancy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtR(expectancy)}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="flex h-7 w-full overflow-hidden rounded-lg">
          <div
            className="flex items-center justify-end pr-2 bg-red-500/45 transition-all duration-700"
            style={{ width: `${maePct}%` }}
          >
            <span className="text-[10px] text-red-200 font-mono">{fmt(mae, '%')}</span>
          </div>
          <div
            className="flex items-center justify-start pl-2 bg-green-500/50 transition-all duration-700"
            style={{ width: `${mfePct}%` }}
          >
            <span className="text-[10px] text-green-200 font-mono">+{fmt(mfe, '%')}</span>
          </div>
        </div>
        {/* Sıfır çizgisi */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/30"
          style={{ left: `${maePct}%` }}
        />
      </div>

      <div className="flex justify-between mt-2 text-[10px] text-text-muted px-0.5">
        <span className="text-red-400">◄ Maks. Zarar (MAE)</span>
        <span>0</span>
        <span className="text-green-400">Maks. Kazanç (MFE) ►</span>
      </div>
    </div>
  );
}

// ── Boş Durum ───────────────────────────────────────────────────────

function EmptyStateImproved() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mb-4 mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <BarChart3 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-text-primary">Henüz Yeterli Backtest Verisi Yok</h2>
        <p className="mb-6 text-sm text-text-secondary leading-relaxed">
          Sinyal performansını analiz etmek için geçmişte tarama yapılmış ve değerlendirilmiş
          sinyaller gerekiyor. En az 10 sinyal birikmelidir.
        </p>

        <div className="mb-6 rounded-xl border border-border bg-surface/50 p-4 text-left">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Nasıl Başlanır?
          </p>
          {[
            'Sinyal Tarama sayfasından bir tarama başlat',
            '7–14 gün sonra fiyat verisi değerlendirilir',
            'Bu sayfa otomatik olarak dolmaya başlar',
          ].map((step, i) => (
            <div key={i} className="mb-2 flex items-start gap-3 last:mb-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="text-sm text-text-secondary">{step}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-3">
          <Link
            href="/tarama"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/80"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Taramaya Git
          </Link>
          <button
            onClick={() => setShowHelp(v => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary/40 hover:text-text-primary"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Nasıl Çalışır?
          </button>
        </div>

        <AnimatePresence>
          {showHelp && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: 'hidden' }}
              className="mt-4 rounded-xl border border-border bg-surface/30 p-4 text-left"
            >
              <p className="text-xs leading-relaxed text-text-secondary">
                BistAI her tarama yaptığınızda sinyallerin o anki fiyatını kaydeder.
                3, 7 ve 14 gün sonra fiyatlar tekrar kontrol edilerek sinyalin başarılı olup
                olmadığı değerlendirilir. Bu veriler birikerek hangi sinyalin hangi piyasa
                koşulunda daha başarılı olduğunu ortaya koyar.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Filter Bar ──────────────────────────────────────────────────────

function FilterBar({
  days, setDays,
  direction, setDirection,
  regime, setRegime,
  signalTypeFilter, setSignalTypeFilter,
}: {
  days: number;              setDays: (d: number) => void;
  direction: '' | 'yukari' | 'asagi'; setDirection: (d: '' | 'yukari' | 'asagi') => void;
  regime: string;            setRegime: (r: string) => void;
  signalTypeFilter: string;  setSignalTypeFilter: (s: string) => void;
}) {
  const dayOptions = [
    { value: 30,  label: '30G'  },
    { value: 90,  label: '90G'  },
    { value: 180, label: '180G' },
    { value: 365, label: '1Y'   },
  ];
  const dirOptions = [
    { value: '',       label: 'Tümü'    },
    { value: 'yukari', label: '↑ AL'    },
    { value: 'asagi',  label: '↓ SAT'   },
  ];
  const regimeOptions = [
    { value: '',           label: 'Tümü'  },
    { value: 'bull_trend', label: '🐂 Boğa' },
    { value: 'bear_trend', label: '🐻 Ayı'  },
    { value: 'sideways',   label: '→ Yatay' },
  ];

  const activeCount = [direction !== '', regime !== '', signalTypeFilter !== ''].filter(Boolean).length;

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Filter className="h-4 w-4 shrink-0 text-text-secondary" />

        {/* Dönem */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted whitespace-nowrap">Dönem:</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
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

        {/* Yön */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted whitespace-nowrap">Yön:</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {dirOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDirection(opt.value as '' | 'yukari' | 'asagi')}
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

        {/* Rejim */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted whitespace-nowrap">Rejim:</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {regimeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRegime(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  regime === opt.value
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sinyal tipi */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted whitespace-nowrap">Sinyal:</span>
          <select
            value={signalTypeFilter}
            onChange={(e) => setSignalTypeFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary focus:outline-none cursor-pointer"
          >
            <option value="">Tümü</option>
            {SIGNAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Aktif filtre sayısı */}
        {activeCount > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {activeCount} filtre aktif
          </span>
        )}
      </div>
    </div>
  );
}

// ── Summary Cards ───────────────────────────────────────────────────

function SummaryCards({
  summary, total, horizon,
}: { summary: BacktestResult; total: number; horizon: Horizon }) {
  const wr  = summary.winRates[horizon];
  const ret = summary.avgReturns[horizon];

  const cards = [
    {
      label: 'Toplam Sinyal',
      value: String(total),
      icon: Activity,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/25',
    },
    {
      label: `Win Rate (${HORIZON_LABELS[horizon]})`,
      value: fmtPct(wr),
      icon: Target,
      color: winRateColor(wr),
      bg: wr !== null && wr >= 55 ? 'bg-green-500/10 border-green-500/25'
        : wr !== null && wr >= 45 ? 'bg-yellow-500/10 border-yellow-500/25'
        : 'bg-red-500/10 border-red-500/25',
    },
    {
      label: `Ort. Getiri (${HORIZON_LABELS[horizon]})`,
      value: fmtPct(ret, true),
      icon: TrendingUp,
      color: ret !== null && ret > 0 ? 'text-green-400' : 'text-red-400',
      bg: ret !== null && ret > 0 ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20',
    },
    {
      label: 'Expectancy (R)',
      value: fmtR(summary.expectancy),
      icon: Scale,
      color: summary.expectancy !== null && summary.expectancy > 0 ? 'text-green-400' : 'text-red-400',
      bg: summary.expectancy !== null && summary.expectancy > 0 ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20',
    },
    {
      label: 'Profit Factor',
      value: fmt(summary.profitFactor),
      icon: BarChart3,
      color: summary.profitFactor !== null && summary.profitFactor > 1 ? 'text-green-400' : 'text-red-400',
      bg: summary.profitFactor !== null && summary.profitFactor > 1 ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20',
    },
    {
      label: 'Ort. MFE (Maks. Kazanç)',
      value: summary.avgMfe !== null ? `+${fmt(summary.avgMfe, '%')}` : '—',
      icon: TrendingUp,
      color: 'text-green-400',
      bg: 'bg-green-500/8 border-green-500/20',
    },
    {
      label: 'Ort. MAE (Maks. Zarar)',
      value: summary.avgMae !== null ? fmt(summary.avgMae, '%') : '—',
      icon: TrendingDown,
      color: 'text-red-400',
      bg: 'bg-red-500/8 border-red-500/20',
    },
  ];

  return (
    <motion.div
      key={horizon}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-3.5 ${card.bg}`}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
            <span className="text-[10px] leading-tight text-text-secondary">{card.label}</span>
          </div>
          <p className={`text-xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </motion.div>
  );
}

// ── Expanded Row Panel ──────────────────────────────────────────────

function ExpandedRowPanel({ row }: { row: PerformanceMatrixRow }) {
  const overall = row.overall;
  const rr = overall.avgMae !== null && overall.avgMfe !== null && Math.abs(overall.avgMae) > 0
    ? overall.avgMfe / Math.abs(overall.avgMae)
    : null;
  const rrColor = rr !== null
    ? rr >= 1.5 ? 'text-green-400' : rr >= 1 ? 'text-yellow-400' : 'text-red-400'
    : '';

  return (
    <div className="bg-surface/80 border-t border-border px-4 py-4">
      <p className="mb-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">
        {row.signalType} — Tüm Horizonlar Detayı
      </p>

      {/* Horizon tablosu */}
      <div className="overflow-x-auto mb-3">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="pr-6 pb-2 text-left text-xs font-medium text-text-muted" />
              {(['3d', '7d', '14d'] as Horizon[]).map((h) => (
                <th key={h} className="px-4 pb-2 text-center text-xs font-semibold text-text-primary">
                  {HORIZON_LABELS[h]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="pr-6 py-1 text-xs text-text-muted">Win Rate</td>
              {(['3d', '7d', '14d'] as Horizon[]).map((h) => (
                <td key={h} className={`px-4 py-1 text-center text-sm font-bold ${winRateColor(overall.winRates[h])}`}>
                  {fmtPct(overall.winRates[h])}
                </td>
              ))}
            </tr>
            <tr>
              <td className="pr-6 py-1 text-xs text-text-muted">Ort. Getiri</td>
              {(['3d', '7d', '14d'] as Horizon[]).map((h) => {
                const v = overall.avgReturns[h];
                return (
                  <td key={h} className={`px-4 py-1 text-center text-sm font-semibold ${v !== null && v > 0 ? 'text-green-400' : v !== null && v < 0 ? 'text-red-400' : 'text-text-secondary'}`}>
                    {fmtPct(v, true)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* MFE / MAE / R:R satırı */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        {overall.avgMfe !== null && (
          <span>MFE ort: <span className="font-semibold text-green-400">+{fmt(overall.avgMfe, '%')}</span></span>
        )}
        {overall.avgMae !== null && (
          <span>MAE ort: <span className="font-semibold text-red-400">{fmt(overall.avgMae, '%')}</span></span>
        )}
        {rr !== null && (
          <span>R/R: <span className={`font-bold ${rrColor}`}>{rr.toFixed(2)}</span></span>
        )}
        {overall.expectancy !== null && (
          <span>Expectancy: <span className={`font-semibold ${overall.expectancy >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtR(overall.expectancy)}</span></span>
        )}
        <span className="text-text-muted">n={overall.totalSignals}</span>
      </div>
    </div>
  );
}

// ── Matrix Cell ─────────────────────────────────────────────────────

function MatrixCell({
  result, highlight, horizon,
}: { result?: BacktestResult; highlight?: boolean; horizon: Horizon }) {
  if (!result || !result.sufficientSample) {
    return (
      <td className={`px-4 py-3 text-center ${highlight ? 'bg-white/5 border-l border-border' : ''}`}>
        <span className="text-text-secondary">—</span>
        {result && <div className="text-[10px] text-text-secondary">n={result.totalSignals}</div>}
      </td>
    );
  }

  const wr  = result.winRates[horizon];
  const ret = result.avgReturns[horizon];

  return (
    <td className={`px-4 py-3 text-center ${winRateBg(wr)} ${highlight ? 'border-l border-border' : ''}`}>
      <div className={`text-base font-bold ${winRateColor(wr)}`}>{fmtPct(wr)}</div>
      <div className="text-[11px] text-text-secondary">getiri: {fmtPct(ret, true)}</div>
      <div className="text-[10px] text-text-secondary">n={result.totalSignals}</div>
    </td>
  );
}

// ── Performance Matrix ──────────────────────────────────────────────

function PerformanceMatrix({
  matrix, horizon, expandedRow, setExpandedRow, signalTypeFilter,
}: {
  matrix: PerformanceMatrixRow[];
  horizon: Horizon;
  expandedRow: string | null;
  setExpandedRow: (r: string | null) => void;
  signalTypeFilter: string;
}) {
  if (matrix.length === 0) return null;

  const regimeKeys = Array.from(new Set(matrix.flatMap((row) => Object.keys(row.regimes)))).sort();
  const totalCols  = regimeKeys.length + 2; // sinyal tipi + rejimler + genel

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <BarChart3 className="h-5 w-5 text-primary" />
          Sinyal Tipi × Rejim Performans Matrisi
        </h2>
        <button
          onClick={() => exportCSV(matrix, regimeKeys, horizon)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-primary/40 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          CSV İndir
        </button>
      </div>
      <p className="mb-3 text-xs text-text-secondary">
        Win rate ({HORIZON_LABELS[horizon]}) · Satıra tıkla → detayları gör · Yeşil &gt;55% · Sarı 45–55% · Kırmızı &lt;45%
      </p>

      <p className="mb-1 text-[10px] text-text-secondary sm:hidden">← Kaydırarak tüm tabloyu görebilirsiniz →</p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary">Sinyal Tipi</th>
              {regimeKeys.map((regime) => (
                <th key={regime} className="px-4 py-3 text-center text-xs font-medium text-text-secondary">
                  {regimeLabel(regime)}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-medium text-text-primary">Genel</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const isExpanded    = expandedRow === row.signalType;
              const isHighlighted = signalTypeFilter === row.signalType;
              return (
                <>
                  <tr
                    key={row.signalType}
                    onClick={() => setExpandedRow(isExpanded ? null : row.signalType)}
                    className={`border-b border-border cursor-pointer transition-colors hover:bg-white/3 ${
                      isHighlighted ? 'ring-1 ring-inset ring-primary/40 bg-primary/5' : ''
                    } ${isExpanded ? 'bg-white/5' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      <div className="flex items-center gap-2">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
                        }
                        {row.signalType}
                      </div>
                    </td>
                    {regimeKeys.map((regime) => (
                      <MatrixCell key={regime} result={row.regimes[regime]} horizon={horizon} />
                    ))}
                    <MatrixCell result={row.overall} highlight horizon={horizon} />
                  </tr>
                  <tr key={`${row.signalType}-detail`}>
                    <td colSpan={totalCols} className="p-0 border-0">
                      <div
                        className="overflow-hidden transition-all duration-300"
                        style={{ maxHeight: isExpanded ? '400px' : '0' }}
                      >
                        <ExpandedRowPanel row={row} />
                      </div>
                    </td>
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Comparison Cards ─────────────────────────────────────────────────

function ComparisonCard({
  comparison, horizon,
}: { comparison: BacktestComparison; horizon: Horizon }) {
  const { groupA, groupB, advantage } = comparison;
  const aHas = groupA.sufficientSample;
  const bHas = groupB.sufficientSample;

  const Icon = advantage.better === 'A' ? ArrowUp : advantage.better === 'B' ? ArrowDown : Minus;
  const col  = advantage.better === 'A' ? 'text-green-400' : advantage.better === 'B' ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{comparison.title}</h3>

      <div className="grid grid-cols-2 gap-3">
        {[
          { result: groupA, hasSample: aHas },
          { result: groupB, hasSample: bHas },
        ].map(({ result, hasSample }, i) => (
          <div key={i} className="rounded-lg border border-border bg-white/5 p-3">
            <div className="mb-2 text-xs font-medium text-text-secondary">{result.filterDescription}</div>
            {hasSample ? (
              <>
                <div className={`text-xl font-bold ${winRateColor(result.winRates[horizon])}`}>
                  {fmtPct(result.winRates[horizon])}
                </div>
                <div className="text-[11px] text-text-secondary mt-0.5">
                  getiri: {fmtPct(result.avgReturns[horizon], true)} · n={result.totalSignals}
                </div>
              </>
            ) : (
              <div className="text-sm text-text-secondary">Yetersiz veri (n={result.totalSignals})</div>
            )}
          </div>
        ))}
      </div>

      {aHas && bHas && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-border bg-white/5 py-2">
          <Icon className={`h-4 w-4 ${col}`} />
          <span className={`text-sm font-medium ${col}`}>
            {advantage.better === 'equal'
              ? 'Eşit performans'
              : `${advantage.better === 'A' ? groupA.filterDescription : groupB.filterDescription} avantajlı`}
          </span>
          {advantage.winRateDiff !== null && (
            <span className="text-xs text-text-secondary">
              ({advantage.winRateDiff > 0 ? '+' : ''}{advantage.winRateDiff.toFixed(1)}% WR)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ComparisonCards({
  comparisons, horizon,
}: { comparisons: BacktestComparison[]; horizon: Horizon }) {
  if (comparisons.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Scale className="h-5 w-5 text-primary" />
        Karşılaştırmalar
        <span className="ml-1 text-sm font-normal text-text-muted">· {HORIZON_LABELS[horizon]}</span>
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {comparisons.map((comp, i) => (
          <ComparisonCard key={i} comparison={comp} horizon={horizon} />
        ))}
      </div>
    </div>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────

export default function BacktestingPage() {
  const [data,    setData]    = useState<BacktestingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // Filtreler
  const [days,             setDays]             = useState(90);
  const [direction,        setDirection]        = useState<'' | 'yukari' | 'asagi'>('');
  const [regime,           setRegime]           = useState('');
  const [signalTypeFilter, setSignalTypeFilter] = useState('');

  // UI state
  const [horizon,     setHorizon]     = useState<Horizon>('7d');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (direction) params.set('direction', direction);
      if (regime)    params.set('regime', regime);
      const res = await fetch(`/api/backtesting?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const json: BacktestingData = await res.json();
      setData(json);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri alınamadı');
    } finally {
      setLoading(false);
    }
  }, [days, direction, regime]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Expand row sıfırlama filtre değişince
  useEffect(() => { setExpandedRow(null); }, [signalTypeFilter]);

  return (
    <div className="container mx-auto px-4 py-6">

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Backtest Analizi</h1>
            <p className="text-sm text-text-secondary">Geçmiş sinyallerin performans raporu</p>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
          {/* Horizon Tabs */}
          <HorizonTabs horizon={horizon} setHorizon={setHorizon} />
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <FilterBar
        days={days}              setDays={setDays}
        direction={direction}    setDirection={setDirection}
        regime={regime}          setRegime={setRegime}
        signalTypeFilter={signalTypeFilter} setSignalTypeFilter={setSignalTypeFilter}
      />

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <Skeleton className="h-10 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-8 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-6 w-64 mb-2" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-6 w-48 mb-2" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="mx-auto max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="mb-4 text-red-300">{error}</p>
          <button
            onClick={() => void fetchData()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary/80"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Boş durum */}
      {!loading && !error && data && data.totalRecords === 0 && (
        <EmptyStateImproved />
      )}

      {/* Veri bölümleri */}
      {!loading && !error && data && data.totalRecords > 0 && (
        <>
          {/* İstatistik satırı */}
          <InfoRow total={data.totalRecords} days={days} lastFetch={lastFetch} />

          {/* Özet kartlar */}
          <SummaryCards summary={data.summary} total={data.totalRecords} horizon={horizon} />

          {/* Win/Loss dağılım barı */}
          <WinLossBar total={data.totalRecords} winRate={data.summary.winRates[horizon]} />

          {/* MFE/MAE Risk Reward */}
          <RiskRewardBar
            mfe={data.summary.avgMfe}
            mae={data.summary.avgMae}
            expectancy={data.summary.expectancy}
          />

          {/* Performans matrisi */}
          <PerformanceMatrix
            matrix={data.matrix}
            horizon={horizon}
            expandedRow={expandedRow}
            setExpandedRow={setExpandedRow}
            signalTypeFilter={signalTypeFilter}
          />

          {/* Karşılaştırmalar */}
          <ComparisonCards comparisons={data.comparisons} horizon={horizon} />
        </>
      )}
    </div>
  );
}
