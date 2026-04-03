'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StockCard } from '@/components/StockCard';
import { Button } from '@/components/ui/button';
import { BIST_SYMBOLS } from '@/types';
import type { SignalTypeFilter, DirectionFilter, StockSignal, OHLCVCandle, SignalSeverity } from '@/types';
import { fetchOHLCVClient } from '@/lib/api-client';
import { detectAllSignals, computeConfluence } from '@/lib/signals';
import { computeSectorMomentum, getSector, getSectorId, SECTORS } from '@/lib/sectors';
import type { SectorMomentum, SectorId } from '@/lib/sectors';
import { useSearchParams } from 'next/navigation';
import {
  Search, RefreshCw, Zap, TrendingUp, TrendingDown, Activity,
  Settings, LayoutGrid, List, X, ChevronDown, BarChart2,
} from 'lucide-react';
import { saveSignalPerformance } from '@/lib/performance';
import { ScanProgress } from '@/components/ScanProgress';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortBy = 'confluence' | 'winrate' | 'severity' | 'change' | 'alpha';

interface ScanResult {
  sembol: string;
  signals: StockSignal[];
  candles: OHLCVCandle[];
  changePercent?: number;  // Yahoo meta.regularMarketChangePercent — gün sonu %0.00 sorununu önler
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNAL_TYPE_OPTIONS: { value: SignalTypeFilter; label: string }[] = [
  { value: 'Tümü',              label: 'Tümü'      },
  { value: 'RSI Uyumsuzluğu',   label: 'RSI Div'   },
  { value: 'Hacim Anomalisi',   label: 'Hacim'     },
  { value: 'Trend Başlangıcı',  label: 'Trend'     },
  { value: 'Kırılım',           label: 'Kırılım'   },
  { value: 'MACD Kesişimi',     label: 'MACD'      },
  { value: 'RSI Seviyesi',      label: 'RSI OB/OS' },
  { value: 'Altın Çapraz',      label: 'Çapraz'    },
  { value: 'Bollinger Sıkışması', label: 'Bollinger' },
];

const SCANNABLE_SIGNALS: { type: string; label: string; color: string; activeColor: string }[] = [
  { type: 'RSI Uyumsuzluğu',       label: 'RSI Div',   color: 'text-violet-400 border-violet-500/40 bg-violet-500/10',    activeColor: 'text-violet-300 border-violet-400 bg-violet-500/25 ring-1 ring-violet-500/50'   },
  { type: 'Hacim Anomalisi',        label: 'Hacim',     color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',      activeColor: 'text-amber-300 border-amber-400 bg-amber-500/25 ring-1 ring-amber-500/50'     },
  { type: 'Trend Başlangıcı',       label: 'Trend',     color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10', activeColor: 'text-emerald-300 border-emerald-400 bg-emerald-500/25 ring-1 ring-emerald-500/50' },
  { type: 'Destek/Direnç Kırılımı', label: 'Kırılım',   color: 'text-sky-400 border-sky-500/40 bg-sky-500/10',            activeColor: 'text-sky-300 border-sky-400 bg-sky-500/25 ring-1 ring-sky-500/50'             },
  { type: 'MACD Kesişimi',          label: 'MACD',      color: 'text-blue-400 border-blue-500/40 bg-blue-500/10',         activeColor: 'text-blue-300 border-blue-400 bg-blue-500/25 ring-1 ring-blue-500/50'         },
  { type: 'RSI Seviyesi',           label: 'RSI OB/OS', color: 'text-rose-400 border-rose-500/40 bg-rose-500/10',         activeColor: 'text-rose-300 border-rose-400 bg-rose-500/25 ring-1 ring-rose-500/50'         },
  { type: 'Altın Çapraz',           label: 'Çapraz',    color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',   activeColor: 'text-yellow-300 border-yellow-400 bg-yellow-500/25 ring-1 ring-yellow-500/50'   },
  { type: 'Bollinger Sıkışması',    label: 'Bollinger', color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',         activeColor: 'text-cyan-300 border-cyan-400 bg-cyan-500/25 ring-1 ring-cyan-500/50'         },
];

const ALL_SIGNAL_TYPES = SCANNABLE_SIGNALS.map(s => s.type);
const SCAN_PREFS_KEY   = 'bistai_scan_signal_prefs';
const SCAN_CACHE_KEY   = 'bistai_scan_results';
const SCAN_CACHE_TTL_MS = 10 * 60 * 1000;

const DIRECTION_OPTIONS: { value: DirectionFilter; label: string; icon: React.ElementType }[] = [
  { value: 'Tümü',   label: 'Tümü',   icon: Activity     },
  { value: 'Yukarı', label: 'Yukarı', icon: TrendingUp   },
  { value: 'Aşağı',  label: 'Aşağı',  icon: TrendingDown },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'confluence', label: 'Güven Skoru'   },
  { value: 'winrate',    label: 'Win Rate'       },
  { value: 'severity',   label: 'Sinyal Gücü'   },
  { value: 'change',     label: 'Fiyat Değişimi' },
  { value: 'alpha',      label: 'Alfabetik'      },
];

const TYPE_LABEL_MAP: Partial<Record<SignalTypeFilter, string>> = {
  Kırılım: 'Destek/Direnç Kırılımı',
};

const MAX_SIGNALS_PER_STOCK = 3;

const PRESETS: { label: string; types: string[] }[] = [
  { label: '⚡ Güçlü AL',   types: ['RSI Uyumsuzluğu', 'MACD Kesişimi', 'Trend Başlangıcı', 'Altın Çapraz'] },
  { label: '📊 RSI + MACD', types: ['RSI Uyumsuzluğu', 'MACD Kesişimi'] },
  { label: '🔥 Tümü',       types: ALL_SIGNAL_TYPES },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const severityRank: Record<SignalSeverity, number> = { zayıf: 1, orta: 2, güçlü: 3 };

function getDailyChange(candles: OHLCVCandle[], changePercent?: number): number {
  // Yahoo meta.regularMarketChangePercent varsa kullan — gün sonu %0.00 sorununu önler
  if (changePercent !== undefined) return changePercent / 100;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (!last || !prev || prev.close === 0) return 0;
  return (last.close - prev.close) / prev.close;
}

function getSortScore(
  r: ScanResult,
  sortBy: SortBy,
  winRateMap: Map<string, { rate: number; sampleSize: number }>,
): number {
  if (!r.signals.length) return 0;
  const primary = r.signals[0]!;
  switch (sortBy) {
    case 'confluence':
      return r.signals.length > 1
        ? computeConfluence(r.signals).score
        : (severityRank[primary.severity as SignalSeverity] ?? 0) * 20;
    case 'winrate': {
      const wr = winRateMap.get(primary.type);
      return wr ? wr.rate : 0;
    }
    case 'severity': return severityRank[primary.severity as SignalSeverity] ?? 0;
    case 'change':   return getDailyChange(r.candles, r.changePercent);
    default:         return 0;
  }
}

function filterAndSortResults(
  results: ScanResult[],
  signalFilter: SignalTypeFilter,
  directionFilter: DirectionFilter,
  smartFilters: { onlyWeeklyAligned: boolean; onlyStrong: boolean; onlyHighConfluence: boolean },
  sortBy: SortBy,
  winRateMap: Map<string, { rate: number; sampleSize: number }>,
): ScanResult[] {
  let out = results
    .map((r) => {
      let signals = r.signals;
      if (signalFilter !== 'Tümü') {
        const typeLabel = TYPE_LABEL_MAP[signalFilter] ?? signalFilter;
        signals = signals.filter(s => s.type === typeLabel);
      }
      if (directionFilter !== 'Tümü') {
        const dir = directionFilter === 'Yukarı' ? 'yukari' : 'asagi';
        signals = signals.filter(s => s.direction === dir);
      }
      if (smartFilters.onlyWeeklyAligned) signals = signals.filter(s => s.weeklyAligned === true);
      if (smartFilters.onlyStrong)        signals = signals.filter(s => s.severity === 'güçlü');
      if (signals.length === 0) return { ...r, signals };

      const byType = new Map<string, StockSignal>();
      for (const sig of signals) {
        const existing = byType.get(sig.type);
        const sr = severityRank[sig.severity as SignalSeverity] ?? 0;
        const er = existing ? (severityRank[existing.severity as SignalSeverity] ?? 0) : -1;
        if (!existing || sr > er) byType.set(sig.type, sig);
      }
      const top = Array.from(byType.values())
        .sort((a, b) => (severityRank[b.severity as SignalSeverity] ?? 0) - (severityRank[a.severity as SignalSeverity] ?? 0))
        .slice(0, MAX_SIGNALS_PER_STOCK);
      return { ...r, signals: top };
    })
    .filter(r => r.signals.length > 0);

  if (smartFilters.onlyHighConfluence) {
    out = out.filter(r => r.signals.length >= 2 && computeConfluence(r.signals).score >= 65);
  }

  if (sortBy === 'alpha') {
    out.sort((a, b) => a.sembol.localeCompare(b.sembol));
  } else {
    out.sort((a, b) => getSortScore(b, sortBy, winRateMap) - getSortScore(a, sortBy, winRateMap));
  }
  return out;
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-border bg-surface text-text-secondary hover:border-primary/40 hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

// ─── SortDropdown ─────────────────────────────────────────────────────────────

function SortDropdown({ value, onChange }: { value: SortBy; onChange: (v: SortBy) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = SORT_OPTIONS.find(o => o.value === value)?.label ?? 'Sırala';

  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-text-primary"
      >
        <BarChart2 className="h-3 w-3" />
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          >
            {SORT_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-white/5 ${
                  value === o.value ? 'font-semibold text-primary' : 'text-text-secondary'
                }`}
              >
                <span className="w-3">{value === o.value ? '✓' : ''}</span>
                {o.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── MacroBanner ──────────────────────────────────────────────────────────────

function MacroBanner({ score, wind, onDismiss }: { score: number; wind: string; onDismiss: () => void }) {
  const windLabel = wind === 'strong_positive' ? 'Güçlü Pozitif'
    : wind === 'positive' ? 'Pozitif'
    : wind === 'neutral'  ? 'Nötr'
    : wind === 'negative' ? 'Negatif'
    : 'Güçlü Negatif';

  const { cls, emoji, advice } =
    score >= 30  ? { cls: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300', emoji: '🟢', advice: 'AL sinyalleri daha güvenilir' } :
    score >= 0   ? { cls: 'border-sky-500/20 bg-sky-500/5 text-sky-300',             emoji: '🔵', advice: 'Piyasa nötr — dikkatli değerlendirin' } :
    score >= -30 ? { cls: 'border-yellow-500/30 bg-yellow-500/8 text-yellow-300',    emoji: '🟡', advice: 'Volatilite yüksek — risk yönetimine dikkat' } :
                   { cls: 'border-red-500/30 bg-red-500/8 text-red-300',             emoji: '🔴', advice: 'SAT baskısı güçlü — pozisyon açmadan önce düşünün' };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm ${cls}`}
    >
      <span>
        {emoji}{' '}
        <span className="font-semibold">Makro Rüzgar: {windLabel} ({score > 0 ? '+' : ''}{score})</span>
        {' — '}{advice}
      </span>
      <button onClick={onDismiss} className="ml-3 shrink-0 opacity-50 transition-opacity hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

// ─── ScanSummary ──────────────────────────────────────────────────────────────

function ScanSummary({ total, signalCount, strongCount, midCount, weakCount, alCount, satCount, avgWinRate }: {
  total: number; signalCount: number; strongCount: number; midCount: number;
  weakCount: number; alCount: number; satCount: number; avgWinRate: number | null;
}) {
  const totalSev = strongCount + midCount + weakCount;
  const sp = totalSev > 0 ? (strongCount / totalSev) * 100 : 0;
  const mp = totalSev > 0 ? (midCount    / totalSev) * 100 : 0;
  const wp = totalSev > 0 ? (weakCount   / totalSev) * 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 space-y-2">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
        {[
          { label: 'Hisse Tarandı',  value: total,       color: 'text-text-primary' },
          { label: 'Sinyal Bulundu', value: signalCount,  color: 'text-primary'      },
          { label: 'AL Sinyali',     value: alCount,      color: 'text-emerald-400'  },
          { label: 'SAT Sinyali',    value: satCount,     color: 'text-red-400'      },
          { label: 'Güçlü Sinyal',   value: strongCount,  color: 'text-amber-400'    },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center bg-surface py-3.5">
            <span className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</span>
            <span className="mt-0.5 text-[10px] text-text-secondary">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface/50 px-4 py-2.5">
        <span className="shrink-0 text-[10px] font-medium text-text-secondary">Dağılım</span>
        <div className="flex h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-border/50">
          <div className="bg-emerald-500/70 transition-all" style={{ width: `${sp}%` }} title={`Güçlü: ${strongCount}`} />
          <div className="bg-yellow-500/60 transition-all" style={{ width: `${mp}%` }} title={`Orta: ${midCount}`} />
          <div className="bg-zinc-500/40 transition-all"  style={{ width: `${wp}%` }} title={`Zayıf: ${weakCount}`} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
          <span className="text-emerald-400">● Güçlü {strongCount}</span>
          <span className="text-yellow-400">● Orta {midCount}</span>
          <span className="text-zinc-400">● Zayıf {weakCount}</span>
          {avgWinRate !== null && (
            <>
              <span className="text-border/80">·</span>
              <span className="font-semibold text-blue-400">Ort. Win Rate %{Math.round(avgWinRate * 100)}</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  onScan, selectedTypes, onToggleType, onPreset,
}: {
  onScan: () => void;
  selectedTypes: string[];
  onToggleType: (type: string) => void;
  onPreset: (types: string[]) => void;
}) {
  const allSelected = selectedTypes.length === ALL_SIGNAL_TYPES.length;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Radar */}
      <div className="relative mb-10 h-36 w-36">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-primary/20"
            style={{ margin: `${i * 14}px` }}
            animate={{ opacity: [0.15, 0.45, 0.15], scale: [1, 1.04, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
          />
        ))}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{ background: 'linear-gradient(#0c0c18, #0c0c18) padding-box, conic-gradient(from 0deg, transparent 75%, #6366f1 100%) border-box' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Search className="h-6 w-6 text-primary" />
          </div>
        </div>
        {[45, 135, 250].map((deg, i) => (
          <motion.div
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-primary"
            style={{ top: '50%', left: '50%', transform: `rotate(${deg}deg) translateX(52px) translateY(-50%)` }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
          />
        ))}
      </div>

      <h2 className="mb-2 text-xl font-semibold text-text-primary">
        {BIST_SYMBOLS.length} BIST Hissesi Taranmayı Bekliyor
      </h2>
      <p className="mb-6 max-w-sm text-sm text-text-secondary">
        Hazır bir preset ile hızla başla ya da hangi sinyalleri arayacağını kendin seç.
      </p>

      {/* Preset buttons */}
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => onPreset(p.types)}
            className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 active:scale-95"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Signal chip selector */}
      <div className="mb-2 flex flex-wrap justify-center gap-2">
        {SCANNABLE_SIGNALS.map((s, i) => {
          const active = selectedTypes.includes(s.type);
          return (
            <motion.button
              key={s.type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              whileTap={{ scale: 0.93 }}
              onClick={() => onToggleType(s.type)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                active ? s.activeColor : 'border-white/10 bg-white/[0.03] text-white/30 hover:border-white/20 hover:text-white/50'
              }`}
            >
              {s.label}
            </motion.button>
          );
        })}
      </div>

      <button
        onClick={() => {
          if (allSelected) {
            SCANNABLE_SIGNALS.forEach(s => { if (selectedTypes.includes(s.type)) onToggleType(s.type); });
          } else {
            SCANNABLE_SIGNALS.forEach(s => { if (!selectedTypes.includes(s.type)) onToggleType(s.type); });
          }
        }}
        className="mb-7 text-xs text-white/25 underline underline-offset-2 transition-colors hover:text-white/50"
      >
        {allSelected ? 'Tümünü kaldır' : 'Tümünü seç'}
      </button>

      <Button size="lg" onClick={onScan} disabled={selectedTypes.length === 0} className="gap-2 px-8 text-base">
        <Zap className="h-5 w-5" />
        {selectedTypes.length === ALL_SIGNAL_TYPES.length ? 'Tümünü Tara' : `${selectedTypes.length} Sinyal ile Tara`}
      </Button>
    </div>
  );
}

// ─── TaramaPage ───────────────────────────────────────────────────────────────

function TaramaPageInner() {
  const searchParams = useSearchParams();
  const sektorParam   = searchParams.get('sektor');
  const excludeParam  = searchParams.get('exclude');
  const excludeSet    = new Set(excludeParam ? excludeParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : []);

  // Filter state
  const [signalType,         setSignalType]         = useState<SignalTypeFilter>('Tümü');
  const [direction,          setDirection]          = useState<DirectionFilter>('Tümü');
  const [onlyWeeklyAligned,  setOnlyWeeklyAligned]  = useState(false);
  const [onlyStrong,         setOnlyStrong]         = useState(false);
  const [onlyHighConfluence, setOnlyHighConfluence] = useState(false);
  const [onlyStrongSectors,  setOnlyStrongSectors]  = useState(false);
  const [selectedSector,     setSelectedSector]     = useState<SectorId | ''>('');
  const [sortBy,             setSortBy]             = useState<SortBy>('confluence');
  const [viewMode,           setViewMode]           = useState<'grid' | 'list'>('grid');
  const [searchQuery,        setSearchQuery]        = useState('');

  // Scan state
  const [results,       setResults]       = useState<ScanResult[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [scanProgress,  setScanProgress]  = useState({ current: 0, total: 0, symbol: '' });
  const [failedSymbols, setFailedSymbols] = useState<string[]>([]);
  const [scannedCount,  setScannedCount]  = useState(0);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(ALL_SIGNAL_TYPES);
  const [sectorMap,     setSectorMap]     = useState<Map<string, SectorMomentum>>(new Map());

  // Data state
  const [macroScore,           setMacroScore]           = useState<{ score: number; wind: string } | null>(null);
  const [winRateMap,           setWinRateMap]           = useState<Map<string, { rate: number; sampleSize: number }>>(new Map());
  const [macroBannerDismissed, setMacroBannerDismissed] = useState(false);
  const explanationCache = useRef<Map<string, string>>(new Map());

  // Load prefs
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCAN_PREFS_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const valid = parsed.filter(t => ALL_SIGNAL_TYPES.includes(t));
        if (valid.length > 0) setSelectedTypes(valid);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      try { localStorage.setItem(SCAN_PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Restore scan cache
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(SCAN_CACHE_KEY);
      if (cached) {
        const { results: cr, scannedCount: cc, ts } = JSON.parse(cached);
        if (Date.now() - ts < SCAN_CACHE_TTL_MS) {
          setResults(cr);
          setScannedCount(cc);
        } else {
          sessionStorage.removeItem(SCAN_CACHE_KEY);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch macro
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch('/api/macro', { signal: controller.signal })
      .then(r => r.json())
      .then(data => { if (!cancelled && data.score) setMacroScore({ score: data.score.score, wind: data.score.wind }); })
      .catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, []);

  // Fetch win rates
  useEffect(() => {
    let cancelled = false;
    fetch('/api/signal-stats')
      .then(r => r.ok ? r.json() : [])
      .then((stats: Array<{ signal_type: string; sufficient_sample: boolean; total_signals: number; horizon_7d: { win_rate: number | null } | null }>) => {
        if (cancelled || !Array.isArray(stats)) return;
        const agg = new Map<string, { totalWR: number; totalN: number }>();
        for (const s of stats) {
          if (!s.sufficient_sample || !s.horizon_7d?.win_rate) continue;
          const cur = agg.get(s.signal_type) ?? { totalWR: 0, totalN: 0 };
          agg.set(s.signal_type, { totalWR: cur.totalWR + s.horizon_7d.win_rate * s.total_signals, totalN: cur.totalN + s.total_signals });
        }
        const result = new Map<string, { rate: number; sampleSize: number }>();
        agg.forEach(({ totalWR, totalN }, type) => { result.set(type, { rate: totalWR / totalN, sampleSize: totalN }); });
        setWinRateMap(result);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Core scan
  const scanSymbols = useCallback(async (symbols: string[], types: string[]) => {
    setLoading(true);
    setError(null);
    const failed: string[] = [];
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 200;

    try {
      const all: ScanResult[] = [...results];
      const allScanned: Array<{ sembol: string; candles: OHLCVCandle[] }> = [];
      setScanProgress({ current: 0, total: symbols.length, symbol: '' });
      let completed = 0;

      for (let batchStart = 0; batchStart < symbols.length; batchStart += BATCH_SIZE) {
        const batch = symbols.slice(batchStart, batchStart + BATCH_SIZE);
        const needsLongHistory = types.length === 0 || types.includes('Altın Çapraz');
        const days = needsLongHistory ? 252 : 90;

        const batchResults = await Promise.allSettled(
          batch.map(async (sembol) => {
            const { candles, changePercent } = await fetchOHLCVClient(sembol, days);
            let signals: ReturnType<typeof detectAllSignals> = [];
            try {
              signals = detectAllSignals(sembol, candles, { types });
            } catch {
              // Sinyal tespiti başarısız — boş sinyal ile devam et
            }
            return { sembol, signals, candles, changePercent };
          }),
        );

        for (const result of batchResults) {
          completed++;
          if (result.status === 'fulfilled') {
            const { sembol, signals, candles } = result.value;
            setScanProgress({ current: completed, total: symbols.length, symbol: sembol });
            allScanned.push({ sembol, candles });
            if (signals.length > 0) {
              for (const signal of signals) saveSignalPerformance({ userId: null, signal, candles }).catch(() => {});
              const idx = all.findIndex(r => r.sembol === sembol);
              if (idx >= 0) all[idx] = { sembol, signals, candles };
              else all.push({ sembol, signals, candles });
            }
          } else {
            const sembol = batch[batchResults.indexOf(result)] ?? '?';
            failed.push(sembol);
            setScanProgress({ current: completed, total: symbols.length, symbol: sembol });
          }
        }
        if (batchStart + BATCH_SIZE < symbols.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }

      setResults(all);
      setFailedSymbols(failed);
      setScannedCount(symbols.length);
      setSectorMap(computeSectorMomentum(allScanned));
      try {
        sessionStorage.setItem(SCAN_CACHE_KEY, JSON.stringify({ results: all, scannedCount: symbols.length, ts: Date.now() }));
      } catch { /* ignore */ }

      const signalCount = all.reduce((sum, r) => sum + r.signals.length, 0);
      if (failed.length > 60) {
        // Çoğunluk başarısız → muhtemelen Yahoo rate limit
        toast.error(`Tarama başarısız: ${failed.length} sembol alınamadı. Yahoo Finance geçici kota aşıldı — 1-2 dakika bekleyip tekrar dene.`);
      } else if (failed.length > 0) {
        toast.warning(`Tarama tamamlandı. ${failed.length} sembol başarısız oldu.`);
      } else {
        toast.success(`Tarama tamamlandı! ${signalCount} sinyal bulundu.`);
      }
    } finally {
      setLoading(false);
    }
  }, [results]);

  const runScan = useCallback(() => {
    setResults([]); setFailedSymbols([]); setScannedCount(0);
    try { sessionStorage.removeItem(SCAN_CACHE_KEY); } catch { /* ignore */ }
    scanSymbols([...BIST_SYMBOLS], selectedTypes);
  }, [scanSymbols, selectedTypes]);

  const retryFailed = useCallback(() => {
    scanSymbols(failedSymbols, selectedTypes);
  }, [scanSymbols, failedSymbols, selectedTypes]);

  const resetToEmptyState = useCallback(() => {
    setResults([]); setFailedSymbols([]); setScannedCount(0);
    try { sessionStorage.removeItem(SCAN_CACHE_KEY); } catch { /* ignore */ }
  }, []);

  const clearFilters = useCallback(() => {
    setSignalType('Tümü'); setDirection('Tümü');
    setOnlyWeeklyAligned(false); setOnlyStrong(false); setOnlyHighConfluence(false); setOnlyStrongSectors(false); setSelectedSector('');
    setSearchQuery('');
  }, []);

  const applyPreset = useCallback((types: string[]) => {
    setSelectedTypes(types);
    try { localStorage.setItem(SCAN_PREFS_KEY, JSON.stringify(types)); } catch { /* ignore */ }
    setResults([]); setFailedSymbols([]); setScannedCount(0);
    try { sessionStorage.removeItem(SCAN_CACHE_KEY); } catch { /* ignore */ }
    scanSymbols([...BIST_SYMBOLS], types);
  }, [scanSymbols]);

  // Derived stats
  const hasScanResults = results.length > 0;
  const signalCount = results.reduce((sum, r) => sum + r.signals.length, 0);
  const strongCount = results.reduce((sum, r) => sum + r.signals.filter(s => s.severity === 'güçlü').length, 0);
  const midCount    = results.reduce((sum, r) => sum + r.signals.filter(s => s.severity === 'orta').length, 0);
  const weakCount   = results.reduce((sum, r) => sum + r.signals.filter(s => s.severity === 'zayıf').length, 0);
  const alCount     = results.reduce((sum, r) => sum + r.signals.filter(s => s.direction === 'yukari').length, 0);
  const satCount    = results.reduce((sum, r) => sum + r.signals.filter(s => s.direction === 'asagi').length, 0);

  let avgWinRate: number | null = null;
  if (winRateMap.size > 0) {
    let totalWR = 0, totalN = 0;
    for (const r of results) {
      for (const s of r.signals) {
        const wr = winRateMap.get(s.type);
        if (wr && wr.sampleSize >= 20) { totalWR += wr.rate * wr.sampleSize; totalN += wr.sampleSize; }
      }
    }
    if (totalN > 0) avgWinRate = totalWR / totalN;
  }

  const smartFilters = { onlyWeeklyAligned, onlyStrong, onlyHighConfluence };
  const rawDisplayList = loading ? [] : filterAndSortResults(results, signalType, direction, smartFilters, sortBy, winRateMap);
  // Sektör URL param filtresi + sembol arama
  const searchUpper = searchQuery.trim().toUpperCase();
  const filteredBySearch = searchUpper
    ? rawDisplayList.filter(r => r.sembol.includes(searchUpper))
    : rawDisplayList;
  const filteredBySectorParam = sektorParam
    ? filteredBySearch.filter(r => getSectorId(r.sembol) === sektorParam)
    : filteredBySearch;
  const filteredBySectorDropdown = selectedSector
    ? filteredBySectorParam.filter(r => getSectorId(r.sembol) === selectedSector)
    : filteredBySectorParam;
  const filteredByExclude = excludeSet.size > 0
    ? filteredBySectorDropdown.filter((r) => !excludeSet.has(r.sembol))
    : filteredBySectorDropdown;
  const displayList = onlyStrongSectors
    ? filteredByExclude.filter(r => {
        const hasBullish = r.signals.some(s => s.direction === 'yukari');
        if (!hasBullish) return true;
        const sector = sectorMap.get(getSector(r.sembol).id);
        return !sector || sector.direction !== 'asagi';
      })
    : filteredByExclude;
  const activeFilterCount = [signalType !== 'Tümü', direction !== 'Tümü', onlyWeeklyAligned, onlyStrong, onlyHighConfluence, onlyStrongSectors, !!selectedSector, !!searchUpper, excludeSet.size > 0].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">

        {/* ── Row 1: Title + view/sort/scan controls ── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-text-primary">Sinyal Tarama</h1>

          <div className="flex flex-wrap items-center gap-2">
            {/* View mode */}
            {hasScanResults && (
              <div className="flex overflow-hidden rounded-lg border border-border">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                  title="Grid görünümü"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                  title="Liste görünümü"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            )}

            {hasScanResults && <SortDropdown value={sortBy} onChange={setSortBy} />}

            {hasScanResults ? (
              <div className="flex items-center gap-1">
                <Button onClick={runScan} disabled={loading} size="sm" className="gap-2">
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Taranıyor...' : 'Yeniden Tara'}
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={resetToEmptyState} title="Sinyal seçimini değiştir">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button onClick={runScan} disabled={loading} className="gap-2">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? 'Taranıyor...' : 'Tümünü Tara'}
              </Button>
            )}
          </div>
        </div>

        {/* ── Row 2: Filter chips ── */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {/* Hisse arama */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hisse ara..."
              className="w-32 rounded-full border border-border bg-surface pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="h-5 w-px bg-border" />

          <div className="flex flex-wrap gap-1.5">
            {SIGNAL_TYPE_OPTIONS.map(o => (
              <Chip key={o.value} active={signalType === o.value} onClick={() => setSignalType(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>

          <div className="h-5 w-px bg-border" />

          <div className="flex gap-1.5">
            {DIRECTION_OPTIONS.map(o => (
              <Chip key={o.value} active={direction === o.value} onClick={() => setDirection(o.value)}>
                <span className="flex items-center gap-1">
                  <o.icon className="h-3 w-3" />
                  {o.label}
                </span>
              </Chip>
            ))}
          </div>

          {hasScanResults && (
            <>
              <div className="h-5 w-px bg-border" />
              {/* Sektör dropdown */}
              <select
                value={selectedSector}
                onChange={e => setSelectedSector(e.target.value as SectorId | '')}
                className="h-7 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary focus:border-primary focus:outline-none"
              >
                <option value="">Tüm Sektörler</option>
                {(Object.values(SECTORS) as { id: string; shortName: string }[]).map(s => (
                  <option key={s.id} value={s.id}>{s.shortName}</option>
                ))}
              </select>
              <div className="h-5 w-px bg-border" />
              <Chip active={onlyWeeklyAligned}  onClick={() => setOnlyWeeklyAligned(v => !v)}>W✓ Haftalık</Chip>
              <Chip active={onlyStrong}          onClick={() => setOnlyStrong(v => !v)}>Güçlü</Chip>
              <Chip active={onlyHighConfluence}  onClick={() => setOnlyHighConfluence(v => !v)}>Yüksek Güven</Chip>
              <Chip active={onlyStrongSectors}   onClick={() => setOnlyStrongSectors(v => !v)}>Güçlü Sektör</Chip>
            </>
          )}
        </div>

        {/* Sektör filtre bandı */}
        {sektorParam && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/8 px-4 py-2.5 text-sm text-primary">
            <span>
              <BarChart2 className="inline h-3.5 w-3.5 mr-1.5 align-text-bottom" />
              Sektör filtresi aktif: <span className="font-semibold uppercase">{sektorParam}</span>
              {' '}· Sadece bu sektördeki hisseler gösteriliyor
            </span>
            <a href="/tarama" className="ml-3 shrink-0 text-xs opacity-60 hover:opacity-100 transition-opacity">Tüm hisseler →</a>
          </div>
        )}

        {/* Portföy dışı fırsatlar bandı */}
        {excludeSet.size > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/8 px-4 py-2.5 text-sm text-violet-400">
            <span>
              Portföyündeki <span className="font-semibold">{excludeSet.size} hisse</span> filtrelendi · Yalnızca portföy dışı fırsatlar gösteriliyor
            </span>
            <a href="/tarama" className="ml-3 shrink-0 text-xs opacity-60 hover:opacity-100 transition-opacity">Tüm hisseler →</a>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-bearish/50 bg-bearish/10 px-4 py-3 text-sm text-bearish">{error}</div>
        )}

        {loading && (
          <ScanProgress current={scanProgress.current} total={scanProgress.total} symbol={scanProgress.symbol} />
        )}

        {!loading && failedSymbols.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-4 py-3">
            <span className="text-sm text-yellow-400">{failedSymbols.length} sembol taranamadı: {failedSymbols.join(', ')}</span>
            <Button variant="outline" size="sm" onClick={retryFailed} className="ml-3 gap-1 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20">
              <RefreshCw className="h-3 w-3" /> Tekrar Dene
            </Button>
          </div>
        )}

        {/* Macro banner */}
        <AnimatePresence>
          {!loading && hasScanResults && macroScore && !macroBannerDismissed && (
            <MacroBanner score={macroScore.score} wind={macroScore.wind} onDismiss={() => setMacroBannerDismissed(true)} />
          )}
        </AnimatePresence>

        {!loading && hasScanResults && (
          <ScanSummary
            total={scannedCount} signalCount={signalCount} strongCount={strongCount}
            midCount={midCount} weakCount={weakCount} alCount={alCount}
            satCount={satCount} avgWinRate={avgWinRate}
          />
        )}

        {/* Active filter counter */}
        {!loading && hasScanResults && activeFilterCount > 0 && displayList.length > 0 && (
          <div className="mb-3 flex items-center justify-between text-xs text-text-secondary">
            <span>{displayList.length} sonuç gösteriliyor · {activeFilterCount} filtre aktif</span>
            <button onClick={clearFilters} className="flex items-center gap-1 text-primary transition-opacity hover:opacity-70">
              <X className="h-3 w-3" /> Filtreleri Temizle
            </button>
          </div>
        )}

        {!loading && !hasScanResults && (
          <EmptyState onScan={runScan} selectedTypes={selectedTypes} onToggleType={toggleType} onPreset={applyPreset} />
        )}

        {!loading && hasScanResults && displayList.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-xl border border-border bg-surface/50 p-8 text-center text-text-secondary"
          >
            Seçilen filtreye uygun sinyal bulunamadı.{' '}
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="ml-1 text-primary underline underline-offset-2">Filtreleri temizle</button>
            )}
          </motion.div>
        )}

        {!loading && displayList.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'flex flex-col gap-2'}
          >
            <AnimatePresence>
              {displayList.map((r) => {
                const primarySig = r.signals[0]!;
                return (
                  <motion.div
                    key={r.sembol}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <StockCard
                      signal={primarySig}
                      candleData={r.candles}
                      allSignals={r.signals}
                      macroScore={macroScore}
                      winRate={winRateMap.get(primarySig.type) ?? null}
                      sectorMomentum={sectorMap.get(getSector(r.sembol).id) ?? null}
                      viewMode={viewMode}
                      marketChangePercent={r.changePercent}
                      cachedExplanation={explanationCache.current.get(`${r.sembol}:${primarySig.type}`) ?? null}
                      onExplanationLoaded={(text) => explanationCache.current.set(`${r.sembol}:${primarySig.type}`, text)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  );
}

import { Suspense } from 'react';
export default function TaramaPage() {
  return (
    <Suspense>
      <TaramaPageInner />
    </Suspense>
  );
}
