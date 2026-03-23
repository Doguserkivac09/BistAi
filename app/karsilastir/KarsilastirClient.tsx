'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { X, Plus, BarChart2, TrendingUp, TrendingDown, Minus, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignalBadge } from '@/components/SignalBadge';
import { BIST_SYMBOLS } from '@/types';
import type { OHLCVCandle, StockSignal, SignalSeverity, SignalDirection } from '@/types';
import { fetchOHLCVClient } from '@/lib/api-client';
import { detectAllSignals } from '@/lib/signals';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HisseData {
  sembol: string;
  candles: OHLCVCandle[];
  signals: StockSignal[];
  error: string | null;
}

type SlotState =
  | { status: 'empty' }
  | { status: 'loading'; sembol: string }
  | { status: 'loaded'; data: HisseData }
  | { status: 'error'; sembol: string; message: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SLOTS = 3;
const SLOT_COLORS = ['blue', 'emerald', 'amber'] as const;
type SlotColor = (typeof SLOT_COLORS)[number];

const SLOT_COLOR_CLASSES: Record<SlotColor, { line: string; badge: string; border: string; text: string }> = {
  blue: {
    line: 'stroke-blue-400',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    border: 'border-blue-500/40',
    text: 'text-blue-400',
  },
  emerald: {
    line: 'stroke-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
  },
  amber: {
    line: 'stroke-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
  },
};

const severityRank: Record<SignalSeverity, number> = { güçlü: 3, orta: 2, zayıf: 1 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sadece volume > 0 olan mumları döndürür (hafta sonu / tatil filtresi) */
function tradingDays(candles: OHLCVCandle[]): OHLCVCandle[] {
  return candles.filter((c) => (c.volume ?? 0) > 0);
}

function getLastClose(candles: OHLCVCandle[]): number | null {
  const td = tradingDays(candles);
  return td.length > 0 ? (td[td.length - 1]?.close ?? null) : null;
}

/** Son gerçek işlem günü indeksini döndürür (volume > 0 olan son mum) */
function lastTradingIdx(candles: OHLCVCandle[]): number {
  for (let i = candles.length - 1; i >= 0; i--) {
    if ((candles[i]?.volume ?? 0) > 0) return i;
  }
  return candles.length - 1; // fallback
}

function getLastTradingDate(candles: OHLCVCandle[]): string | null {
  if (!candles.length) return null;
  const idx = lastTradingIdx(candles);
  const last = candles[idx]!;
  const raw = typeof last.date === 'string' ? last.date : new Date((last.date as number) * 1000).toISOString().slice(0, 10);
  const d = new Date(raw + 'T00:00:00');
  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function getDailyChangePct(candles: OHLCVCandle[]): number | null {
  const idx = lastTradingIdx(candles);
  if (idx < 1) return null;
  const curr = candles[idx]?.close;
  const prev = candles[idx - 1]?.close;
  if (!prev || !curr || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function get90DayChangePct(candles: OHLCVCandle[]): number | null {
  if (candles.length < 2) return null;
  const first = candles[0]?.close;
  const last = candles[candles.length - 1]?.close;
  if (!first || !last || first === 0) return null;
  return ((last - first) / first) * 100;
}

function computeRSI(candles: OHLCVCandle[], period = 14): number | null {
  const td = tradingDays(candles);
  if (td.length < period + 1) return null;
  const closes = td.map((c) => c.close);
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function get30DayVolatility(candles: OHLCVCandle[]): number | null {
  const last30 = tradingDays(candles).slice(-30);
  if (last30.length < 5) return null;
  const returns = last30.slice(1).map((c, i) => {
    const prev = last30[i]!.close;
    return prev > 0 ? ((c.close - prev) / prev) * 100 : 0;
  });
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

function getAvgVolume(candles: OHLCVCandle[]): number | null {
  const last20 = tradingDays(candles).slice(-20);
  if (!last20.length) return null;
  return last20.reduce((s, c) => s + c.volume, 0) / last20.length;
}

function formatVolume(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return String(Math.round(v));
}

function getStrongestSignal(signals: StockSignal[]): StockSignal | null {
  if (signals.length === 0) return null;
  return signals.reduce((best, s) =>
    (severityRank[s.severity] ?? 0) > (severityRank[best.severity] ?? 0) ? s : best
  );
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Normalize candles to 100-base for chart
function normalizeCandles(candles: OHLCVCandle[]): { date: string; value: number }[] {
  if (candles.length === 0) return [];
  const base = candles[0]?.close;
  if (!base || base === 0) return [];
  return candles.map((c) => ({
    date: typeof c.date === 'string' ? c.date : new Date(c.date * 1000).toISOString().slice(0, 10),
    value: (c.close / base) * 100,
  }));
}

// ─── Symbol Autocomplete Input ────────────────────────────────────────────────

interface SymbolInputProps {
  onSelect: (sembol: string) => void;
  excluded: string[];
  placeholder?: string;
}

function SymbolInput({ onSelect, excluded, placeholder = 'Hisse ara... (örn. AKBNK)' }: SymbolInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.length >= 1
    ? BIST_SYMBOLS.filter(
        (s) => s.toLowerCase().includes(query.toLowerCase()) && !excluded.includes(s)
      ).slice(0, 12)
    : [];

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function handleSelect(sembol: string) {
    onSelect(sembol);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors"
        />
      </div>

      {open && filtered.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1.5 w-full rounded-xl border border-border bg-surface shadow-xl overflow-hidden animate-fade-in-up-sm">
            {filtered.map((s) => (
              <button
                key={s}
                onMouseDown={() => handleSelect(s)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
              >
                <BarChart2 className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                {s}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

// ─── Slot Card (empty/loading/loaded/error) ───────────────────────────────────

interface SlotCardProps {
  index: number;
  state: SlotState;
  color: SlotColor;
  onSelect: (sembol: string) => void;
  onRemove: () => void;
  excluded: string[];
}

function SlotCard({ index, state, color, onSelect, onRemove, excluded }: SlotCardProps) {
  const colorCls = SLOT_COLOR_CLASSES[color];

  if (state.status === 'empty') {
    return (
      <div
        className={`rounded-xl border border-dashed border-border bg-surface/30 p-4 flex flex-col gap-3 animate-fade-in-up-sm stagger-${index + 1}`}
      >
        <div className="flex items-center gap-2">
          <div className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold', colorCls.badge)}>
            {index + 1}
          </div>
          <span className="text-sm text-text-muted">Hisse {index + 1}</span>
        </div>
        <SymbolInput onSelect={onSelect} excluded={excluded} />
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
          <Plus className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs text-text-muted">Karşılaştırmak için bir hisse seçin</span>
        </div>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className={cn('rounded-xl border bg-surface/50 p-4 animate-fade-in-up-sm', colorCls.border)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold', colorCls.badge)}>
              {index + 1}
            </div>
            <span className={cn('text-sm font-semibold', colorCls.text)}>{state.sembol}</span>
          </div>
          <button onClick={onRemove} className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-white/5" style={{ width: `${70 + i * 10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-surface/50 p-4 animate-fade-in-up-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-red-400">{state.sembol}</span>
          <button onClick={onRemove} className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span className="text-xs text-red-300">{state.message}</span>
        </div>
      </div>
    );
  }

  // loaded
  const { data } = state;
  const dailyPct   = getDailyChangePct(data.candles);
  const change90   = get90DayChangePct(data.candles);
  const rsi        = computeRSI(data.candles);
  const lastDate   = getLastTradingDate(data.candles);
  const isPositiveDay = dailyPct !== null && dailyPct >= 0;

  const rsiColor = rsi === null ? 'text-text-secondary'
    : rsi >= 70 ? 'text-red-400'
    : rsi <= 30 ? 'text-emerald-400'
    : 'text-text-primary';

  return (
    <div className={cn('rounded-xl border bg-surface/60 p-4 animate-fade-in-up-sm', colorCls.border)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold', colorCls.badge)}>
            {index + 1}
          </div>
          <a href={`/hisse/${data.sembol}`} className={cn('text-base font-bold hover:underline', colorCls.text)}>
            {data.sembol}
          </a>
        </div>
        <button onClick={onRemove} className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <p className="text-xs text-text-muted mb-0.5">RSI (14)</p>
          <p className={cn('font-semibold tabular-nums', rsiColor)}>
            {rsi !== null ? rsi.toFixed(1) : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-xs text-text-muted">Günlük</p>
            {lastDate && <p className="text-[10px] text-text-muted/60">{lastDate}</p>}
          </div>
          <p className={cn('font-semibold tabular-nums', dailyPct === null ? 'text-text-secondary' : isPositiveDay ? 'text-bullish' : 'text-bearish')}>
            {formatPct(dailyPct)}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <p className="text-xs text-text-muted mb-0.5">90 Günlük</p>
          <p className={cn('font-semibold tabular-nums', change90 === null ? 'text-text-secondary' : change90 >= 0 ? 'text-bullish' : 'text-bearish')}>
            {formatPct(change90)}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <p className="text-xs text-text-muted mb-0.5">Sinyal</p>
          <p className="font-semibold text-text-primary tabular-nums">{data.signals.length} adet</p>
        </div>
      </div>
    </div>
  );
}

// ─── Normalized Price Chart (SVG) ─────────────────────────────────────────────

interface NormalizedPoint {
  x: number;
  y: number;
}

interface ChartSeries {
  sembol: string;
  color: SlotColor;
  points: NormalizedPoint[];
}

function NormalizedPriceChart({ series }: { series: ChartSeries[] }) {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) return null;

  const W = 800;
  const H = 240;
  const PAD = { top: 16, right: 24, bottom: 36, left: 48 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Collect all values to get global min/max
  const allValues = series.flatMap((s) => s.points.map((p) => p.y));
  if (allValues.length === 0) return null;

  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  // Max total points across series
  const maxLen = Math.max(...series.map((s) => s.points.length), 1);

  function toSvg(x: number, y: number): string {
    const svgX = PAD.left + (x / (maxLen - 1 || 1)) * innerW;
    const svgY = PAD.top + (1 - (y - minVal) / range) * innerH;
    return `${svgX.toFixed(1)},${svgY.toFixed(1)}`;
  }

  // Y axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minVal + t * range);

  // X axis ticks (first, mid, last)
  const firstSeries = series.find((s) => s.points.length > 0);
  const xTickIndices = firstSeries
    ? [0, Math.floor((firstSeries.points.length - 1) / 2), firstSeries.points.length - 1]
    : [];

  const COLOR_STROKE: Record<SlotColor, string> = {
    blue: '#60a5fa',
    emerald: '#34d399',
    amber: '#fbbf24',
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 320, height: 'auto' }}
        aria-label="Normalize edilmiş fiyat grafiği"
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const svgY = PAD.top + (1 - (tick - minVal) / range) * innerH;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={svgY}
                x2={W - PAD.right}
                y2={svgY}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={svgY + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(255,255,255,0.3)"
              >
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* X axis labels */}
        {firstSeries && xTickIndices.map((idx) => {
          const pt = firstSeries.points[idx];
          if (!pt) return null;
          const svgX = PAD.left + (idx / (firstSeries.points.length - 1 || 1)) * innerW;
          // date is stored as index, get from original — we only show position label
          return (
            <text
              key={idx}
              x={svgX}
              y={H - PAD.bottom + 16}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(255,255,255,0.3)"
            >
              {idx === 0 ? '-90g' : idx === xTickIndices[1] ? '-45g' : 'Bugün'}
            </text>
          );
        })}

        {/* Series lines */}
        {series.map((s) => {
          if (s.points.length < 2) return null;
          const d = s.points
            .map((p, i) => {
              const coord = toSvg(i, p.y);
              return `${i === 0 ? 'M' : 'L'} ${coord}`;
            })
            .join(' ');
          return (
            <path
              key={s.sembol}
              d={d}
              fill="none"
              stroke={COLOR_STROKE[s.color]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* Legend */}
        {series.map((s, i) => (
          <g key={s.sembol} transform={`translate(${PAD.left + i * 80}, ${H - 8})`}>
            <line x1="0" y1="0" x2="16" y2="0" stroke={COLOR_STROKE[s.color]} strokeWidth="2" />
            <text x="20" y="4" fontSize="11" fill={COLOR_STROKE[s.color]} fontWeight="600">
              {s.sembol}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Comparison Table ─────────────────────────────────────────────────────────

interface MetricRow {
  label: string;
  getValue: (data: HisseData) => number | null;
  format: (v: number | null) => string;
  higherIsBetter: boolean;
}

const METRICS: MetricRow[] = [
  {
    label: 'Son İşlem Günü Değişim %',
    getValue: (d) => getDailyChangePct(d.candles),
    format: formatPct,
    higherIsBetter: true,
  },
  {
    label: '90 Günlük Değişim %',
    getValue: (d) => get90DayChangePct(d.candles),
    format: formatPct,
    higherIsBetter: true,
  },
  {
    label: 'RSI (14)',
    getValue: (d) => computeRSI(d.candles),
    format: (v) => v === null ? '—' : v.toFixed(1),
    higherIsBetter: false, // düşük RSI = daha ucuz/oversold, yüksek = pahalı
  },
  {
    label: '30g Volatilite %',
    getValue: (d) => get30DayVolatility(d.candles),
    format: (v) => v === null ? '—' : v.toFixed(2) + '%',
    higherIsBetter: false, // düşük volatilite daha istikrarlı
  },
  {
    label: 'Ort. Hacim (20g)',
    getValue: (d) => getAvgVolume(d.candles),
    format: formatVolume,
    higherIsBetter: true,
  },
  {
    label: 'Sinyal Sayısı',
    getValue: (d) => d.signals.length,
    format: (v) => (v === null ? '—' : String(v)),
    higherIsBetter: true,
  },
  {
    label: 'Güçlü Sinyal Sayısı',
    getValue: (d) => d.signals.filter((s) => s.severity === 'güçlü').length,
    format: (v) => (v === null ? '—' : String(v)),
    higherIsBetter: true,
  },
];

function ComparisonTable({ loadedSlots }: { loadedSlots: Array<{ data: HisseData; color: SlotColor }> }) {
  if (loadedSlots.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/80">
            <th className="px-4 py-3 text-left font-medium text-text-muted">Metrik</th>
            {loadedSlots.map(({ data, color }) => (
              <th key={data.sembol} className={cn('px-4 py-3 text-center font-bold', SLOT_COLOR_CLASSES[color].text)}>
                {data.sembol}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric, mIdx) => {
            const values = loadedSlots.map(({ data }) => metric.getValue(data));
            const nonNull = values.filter((v): v is number => v !== null);
            const best = nonNull.length > 0
              ? metric.higherIsBetter ? Math.max(...nonNull) : Math.min(...nonNull)
              : null;
            const worst = nonNull.length > 0
              ? metric.higherIsBetter ? Math.min(...nonNull) : Math.max(...nonNull)
              : null;

            return (
              <tr
                key={metric.label}
                className={cn(
                  'border-b border-border/50 transition-colors hover:bg-white/[0.02]',
                  mIdx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'
                )}
              >
                <td className="px-4 py-3 font-medium text-text-secondary">{metric.label}</td>
                {values.map((v, i) => {
                  const isBest = v !== null && best !== null && v === best && nonNull.length > 1;
                  const isWorst = v !== null && worst !== null && v === worst && nonNull.length > 1;
                  const numericVal = metric.getValue(loadedSlots[i]!.data);

                  return (
                    <td
                      key={i}
                      className={cn(
                        'px-4 py-3 text-center tabular-nums font-medium',
                        isBest && 'text-emerald-400',
                        isWorst && !isBest && 'text-red-400',
                        !isBest && !isWorst && 'text-text-primary'
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {metric.format(numericVal)}
                        {isBest && <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 rounded px-1">EN İYİ</span>}
                        {isWorst && !isBest && <span className="text-[10px] font-semibold text-red-500 bg-red-500/10 rounded px-1">EN KÖTÜ</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Signal Direction Icon ─────────────────────────────────────────────────────

function DirectionIcon({ direction }: { direction: SignalDirection }) {
  if (direction === 'yukari') return <TrendingUp className="h-3.5 w-3.5 text-bullish" />;
  if (direction === 'asagi') return <TrendingDown className="h-3.5 w-3.5 text-bearish" />;
  return <Minus className="h-3.5 w-3.5 text-text-muted" />;
}

// ─── Signals Section ──────────────────────────────────────────────────────────

function SignalsSection({ loadedSlots }: { loadedSlots: Array<{ data: HisseData; color: SlotColor }> }) {
  if (loadedSlots.length === 0) return null;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {loadedSlots.map(({ data, color }) => {
        const colorCls = SLOT_COLOR_CLASSES[color];
        const strongest = getStrongestSignal(data.signals);

        return (
          <div
            key={data.sembol}
            className={cn('rounded-xl border bg-surface/50 p-4 animate-fade-in-up-sm', colorCls.border)}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className={cn('text-sm font-bold', colorCls.text)}>{data.sembol}</span>
              <span className="text-xs text-text-muted">— {data.signals.length} sinyal</span>
              {strongest && (
                <span className={cn('ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold', colorCls.badge)}>
                  En güçlü: {strongest.severity}
                </span>
              )}
            </div>

            {data.signals.length === 0 ? (
              <p className="text-xs text-text-muted py-2">Bu hisse için tespit edilen sinyal yok.</p>
            ) : (
              <div className="space-y-2">
                {data.signals.map((sig) => (
                  <div
                    key={`${sig.type}-${sig.direction}`}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2"
                  >
                    <DirectionIcon direction={sig.direction} />
                    <span className="flex-1 text-xs text-text-primary truncate">{sig.type}</span>
                    <SeverityBadge severity={sig.severity} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: SignalSeverity }) {
  const cls =
    severity === 'güçlü'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : severity === 'orta'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';

  const labels: Record<SignalSeverity, string> = { güçlü: 'Güçlü', orta: 'Orta', zayıf: 'Zayıf' };

  return (
    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold', cls)}>
      {labels[severity]}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KarsilastirClient() {
  const searchParams = useSearchParams();

  const [slots, setSlots] = useState<SlotState[]>([
    { status: 'empty' },
    { status: 'empty' },
    { status: 'empty' },
  ]);

  const loadedSlots = slots
    .map((s, i) => (s.status === 'loaded' ? { data: s.data, color: SLOT_COLORS[i]! } : null))
    .filter((s): s is { data: HisseData; color: SlotColor } => s !== null);

  const loadingCount = slots.filter((s) => s.status === 'loading').length;

  const selectedSembols = slots
    .filter((s): s is { status: 'loaded'; data: HisseData } | { status: 'loading'; sembol: string } | { status: 'error'; sembol: string; message: string } =>
      s.status === 'loaded' || s.status === 'loading' || s.status === 'error'
    )
    .map((s) =>
      s.status === 'loaded' ? s.data.sembol : s.sembol
    );

  const handleSelect = useCallback(async (slotIndex: number, sembol: string) => {
    // Find next empty slot if not specified
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = { status: 'loading', sembol };
      return next;
    });

    try {
      const candles = await fetchOHLCVClient(sembol, 90);
      if (candles.length === 0) {
        setSlots((prev) => {
          const next = [...prev];
          next[slotIndex] = { status: 'error', sembol, message: 'Bu hisse için veri bulunamadı.' };
          return next;
        });
        return;
      }
      const signals = detectAllSignals(sembol, candles);
      setSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = { status: 'loaded', data: { sembol, candles, signals, error: null } };
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Veri yüklenemedi.';
      setSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = { status: 'error', sembol, message };
        return next;
      });
    }
  }, []);

  const handleRemove = useCallback((slotIndex: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = { status: 'empty' };
      return next;
    });
  }, []);

  // URL'den ?semboller=THYAO,ASELS,SISE parametresini oku ve otomatik yükle
  useEffect(() => {
    const param = searchParams.get('semboller');
    if (!param) return;
    const semboller = param
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => (BIST_SYMBOLS as readonly string[]).includes(s))
      .slice(0, MAX_SLOTS);
    semboller.forEach((sembol, i) => {
      handleSelect(i, sembol);
    });
  // Sadece ilk mount'ta çalışsın
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build chart series from loaded slots
  const chartSeries: ChartSeries[] = loadedSlots.map(({ data, color }, i) => ({
    sembol: data.sembol,
    color,
    points: normalizeCandles(data.candles).map((pt, j) => ({ x: j, y: pt.value })),
  }));

  const hasAnyData = loadedSlots.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 animate-fade-in-up-sm">
          <h1 className="text-2xl font-bold text-text-primary">Hisse Karşılaştırma</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Maksimum 3 hisse seçerek fiyat, sinyal ve performans metriklerini yan yana karşılaştırın.
          </p>
        </div>

        {/* Slot cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot, i) => (
            <SlotCard
              key={i}
              index={i}
              state={slot}
              color={SLOT_COLORS[i]!}
              onSelect={(sembol) => handleSelect(i, sembol)}
              onRemove={() => handleRemove(i)}
              excluded={selectedSembols}
            />
          ))}
        </div>

        {/* Loading indicator */}
        {loadingCount > 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface/50 px-4 py-3 animate-fade-in">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-text-secondary">
              {loadingCount} hisse verisi yükleniyor...
            </span>
          </div>
        )}

        {hasAnyData && (
            <div className="space-y-8 animate-fade-in-up">
              {/* Comparison Table */}
              <section>
                <h2 className="mb-3 text-lg font-semibold text-text-primary">Metrik Karşılaştırması</h2>
                <ComparisonTable loadedSlots={loadedSlots} />
              </section>

              {/* Price Chart */}
              {chartSeries.some((s) => s.points.length > 1) && (
                <section>
                  <h2 className="mb-1 text-lg font-semibold text-text-primary">
                    Normalize Fiyat Grafiği
                  </h2>
                  <p className="mb-3 text-xs text-text-muted">
                    90 günlük fiyat hareketi, başlangıç fiyatı = 100 baz alınarak normalize edildi.
                  </p>
                  <div className="rounded-xl border border-border bg-surface/50 p-4">
                    <NormalizedPriceChart series={chartSeries} />
                  </div>
                </section>
              )}

              {/* Signals */}
              <section>
                <h2 className="mb-3 text-lg font-semibold text-text-primary">Sinyal Karşılaştırması</h2>
                <SignalsSection loadedSlots={loadedSlots} />
              </section>
            </div>
          )}

          {!hasAnyData && loadingCount === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface/20 p-10 text-center animate-fade-in">
              <BarChart2 className="mx-auto mb-3 h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-secondary">
                Karşılaştırmak için yukarıdan en az bir hisse seçin.
              </p>
            </div>
          )}
      </main>
    </div>
  );
}
