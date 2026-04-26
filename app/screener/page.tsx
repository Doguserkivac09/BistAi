'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronUp, ArrowUpDown,
  TrendingUp, TrendingDown, Minus, BarChart2, RefreshCw, Clock, Star, Zap, Target,
  Download, Share2, Mountain,
} from 'lucide-react';
import { SECTORS } from '@/lib/sectors';
import { BIST_SYMBOLS } from '@/types';
import { createClient } from '@/lib/supabase';
import { toast } from 'sonner';

// ── Tipler ────────────────────────────────────────────────────────────────────

interface ScreenerResult {
  sembol: string;
  signals: Array<{ type: string; direction: string; severity: string; candlesAgo?: number; weeklyAligned?: boolean }>;
  signalCount: number;
  changePercent: number | null;
  rsi: number | null;
  lastVolume: number | null;
  lastClose: number | null;
  confluenceScore: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  relVol5: number | null;
  dominantDir: 'yukari' | 'asagi' | 'karisik' | null;
  anyMtf: boolean;
  sector: string | null;
  sectorName: string | null;
}

interface ScreenerResponse {
  ok: boolean;
  count: number;
  totalMatched: number;
  capped: boolean;
  latestScannedAt: string | null;
  results: ScreenerResult[];
}

interface Filters {
  sector: string;
  signalType: string;
  severity: string;
  direction: '' | 'yukari' | 'asagi';
  mtfOnly: boolean;
  rsiMin: string;
  rsiMax: string;
  changeMin: string;
  changeMax: string;
  volumeMin: string;
  confluenceMin: string;
  near52wHigh: string; // "tepeye %X içinde" (X = mesafe)
  near52wLow: string;  // "diptan %X içinde"
  relVol5Min: string;  // örn 1.5 = "ortalamanın 1.5 katı"
}

const EMPTY_FILTERS: Filters = {
  sector: '', signalType: '', severity: '', direction: '', mtfOnly: false,
  rsiMin: '', rsiMax: '', changeMin: '', changeMax: '', volumeMin: '',
  confluenceMin: '', near52wHigh: '', near52wLow: '', relVol5Min: '',
};

// Hazır preset'ler — tek tıkta yaygın taramalar
const PRESETS: Array<{ key: string; label: string; emoji: string; filters: Partial<Filters> }> = [
  {
    key: 'asiri-satim',
    label: 'Aşırı Satım Fırsatı',
    emoji: '🟦',
    filters: { rsiMax: '30', confluenceMin: '40', volumeMin: '5000000' },
  },
  {
    key: 'tepe-patlama',
    label: 'Tepe Patlaması',
    emoji: '🚀',
    filters: { signalType: 'Destek/Direnç Kırılımı', severity: 'güçlü', direction: 'yukari', volumeMin: '5000000' },
  },
  {
    key: 'hacim-patlama',
    label: 'Hacim Patlaması',
    emoji: '📊',
    filters: { signalType: 'Hacim Anomalisi', severity: 'güçlü', volumeMin: '10000000' },
  },
  {
    key: 'altin-capraz',
    label: 'Altın Çapraz',
    emoji: '✨',
    filters: { signalType: 'Altın Çapraz', direction: 'yukari' },
  },
  {
    key: 'yuksek-confluence',
    label: 'Yüksek Confluence',
    emoji: '🎯',
    filters: { confluenceMin: '60', volumeMin: '5000000' },
  },
  {
    key: 'mtf-aligned',
    label: 'MTF Uyumlu (Haftalık ✓)',
    emoji: '✓',
    filters: { mtfOnly: true, confluenceMin: '40' },
  },
  {
    key: 'tepe-yakin',
    label: '52H Tepe Yakın',
    emoji: '🏔️',
    filters: { near52wHigh: '3', volumeMin: '5000000' },
  },
  {
    key: 'dip-yakin',
    label: '52H Dip Yakın',
    emoji: '⛰️',
    filters: { near52wLow: '8', confluenceMin: '40' },
  },
];

const SIGNAL_TYPES = [
  'RSI Uyumsuzluğu', 'Hacim Anomalisi', 'Trend Başlangıcı',
  'Destek/Direnç Kırılımı', 'MACD Kesişimi', 'RSI Seviyesi',
  'Altın Çapraz', 'Bollinger Sıkışması',
];

const SEVERITY_OPTIONS = [
  { value: 'güçlü', label: 'Güçlü', color: 'text-emerald-400' },
  { value: 'orta',  label: 'Orta',  color: 'text-yellow-400' },
  { value: 'zayıf', label: 'Zayıf', color: 'text-gray-400' },
];

const VOLUME_PRESETS = [
  { label: '1M+',  value: '1000000' },
  { label: '5M+',  value: '5000000' },
  { label: '10M+', value: '10000000' },
  { label: '50M+', value: '50000000' },
];

const RSI_PRESETS = [
  { label: 'Aşırı Satım (<30)',  rsiMin: '', rsiMax: '30' },
  { label: 'Normal (30-70)',     rsiMin: '30', rsiMax: '70' },
  { label: 'Aşırı Alım (>70)',  rsiMin: '70', rsiMax: '' },
];

const SECTOR_OPTIONS = Object.values(SECTORS).map((s) => ({
  value: s.id,
  label: s.shortName,
}));

const TOTAL_BIST = BIST_SYMBOLS.length;

// ── Sıralama ──────────────────────────────────────────────────────────────────

type SortKey = 'sembol' | 'change' | 'rsi' | 'volume' | 'price' | 'signalCount' | 'confluence' | 'relVol5' | 'pct52High';
type SortDir = 'asc' | 'desc';

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function formatVolume(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}Md`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

function formatPrice(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100)  return v.toFixed(1);
  return v.toFixed(2);
}

function dataAgeText(iso: string | null): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function RsiBar({ rsi }: { rsi: number | null }) {
  if (rsi === null) return <span className="text-text-muted text-xs">—</span>;
  const color = rsi < 30 ? 'text-blue-400' : rsi > 70 ? 'text-red-400' : 'text-text-primary';
  const barColor = rsi < 30 ? 'bg-blue-500' : rsi > 70 ? 'bg-red-500' : 'bg-primary';
  return (
    <div className="flex items-center gap-1.5 min-w-[70px]">
      <div className="relative flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${rsi}%` }} />
        {/* 30 / 70 eşik çizgileri */}
        <div className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: '30%' }} />
        <div className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: '70%' }} />
      </div>
      <span className={`text-xs font-mono ${color}`}>{rsi.toFixed(0)}</span>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const cls = severity === 'güçlü' ? 'bg-emerald-400'
    : severity === 'orta' ? 'bg-yellow-400'
    : 'bg-gray-500';
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function FilterSelect({
  label, value, onChange, options, placeholder,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2 pr-8 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
      </div>
    </div>
  );
}

function FilterInput({
  label, value, onChange, placeholder, type = 'number',
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
    </div>
  );
}

function SortHeader({
  label, sortKey, current, dir, onSort, className,
}: {
  label: string; sortKey: SortKey;
  current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition ${
        active ? 'text-primary' : 'text-text-muted hover:text-text-primary'
      } ${className ?? ''}`}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────

export default function ScreenerPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalMatched, setTotalMatched] = useState(0);
  const [capped, setCapped] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('confluence');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [watchlistIds, setWatchlistIds] = useState<Map<string, string>>(new Map());
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  function setFilter<K extends keyof Filters>(key: K, val: Filters[K]) {
    setActivePreset(null); // manuel değişiklik preset'i sıfırlar
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  function applyPreset(key: string) {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    if (activePreset === key) {
      setActivePreset(null);
      setFilters(EMPTY_FILTERS);
      return;
    }
    setActivePreset(key);
    setFilters({ ...EMPTY_FILTERS, ...p.filters });
  }

  const activeFilterCount = Object.entries(filters).filter(([, v]) =>
    typeof v === 'boolean' ? v : Boolean(v)
  ).length;

  // Auth + watchlist (soft login)
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setLoggedIn(true);
        const res = await fetch('/api/watchlist');
        if (!res.ok) return;
        const json = await res.json() as { id: string; sembol?: string }[];
        setWatchlist(new Set(json.map((r) => r.sembol ?? '')));
        setWatchlistIds(new Map(json.map((r) => [r.sembol ?? '', r.id])));
      } catch { /* sessizce */ }
    })();
  }, []);

  const handleWatchlistToggle = useCallback(async (sembol: string) => {
    if (!loggedIn) {
      toast.info('İzleme listesi için giriş yapın');
      return;
    }
    const isIn = watchlist.has(sembol);
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (isIn) next.delete(sembol); else next.add(sembol);
      return next;
    });
    try {
      if (isIn) {
        const id = watchlistIds.get(sembol);
        if (id) await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' });
        setWatchlistIds((p) => { const n = new Map(p); n.delete(sembol); return n; });
      } else {
        const res = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sembol }),
        });
        const j = await res.json() as { id?: string };
        if (j.id) setWatchlistIds((p) => new Map(p).set(sembol, j.id!));
      }
    } catch {
      setWatchlist((prev) => {
        const next = new Set(prev);
        if (isIn) next.add(sembol); else next.delete(sembol);
        return next;
      });
      toast.error('İşlem başarısız');
    }
  }, [loggedIn, watchlist, watchlistIds]);

  const runScreener = useCallback(async (f: Filters) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setHasSearched(true);

    const params = new URLSearchParams();
    if (f.sector)        params.set('sector', f.sector);
    if (f.signalType)    params.set('signalType', f.signalType);
    if (f.severity)      params.set('severity', f.severity);
    if (f.direction)     params.set('direction', f.direction);
    if (f.mtfOnly)       params.set('mtfOnly', '1');
    if (f.rsiMin)        params.set('rsiMin', f.rsiMin);
    if (f.rsiMax)        params.set('rsiMax', f.rsiMax);
    if (f.changeMin)     params.set('changeMin', f.changeMin);
    if (f.changeMax)     params.set('changeMax', f.changeMax);
    if (f.volumeMin)     params.set('volumeMin', f.volumeMin);
    if (f.confluenceMin) params.set('confluenceMin', f.confluenceMin);
    if (f.near52wHigh)   params.set('near52wHigh', f.near52wHigh);
    if (f.near52wLow)    params.set('near52wLow', f.near52wLow);
    if (f.relVol5Min)    params.set('relVol5Min', f.relVol5Min);
    params.set('limit', '200');

    try {
      const res = await fetch(`/api/screener?${params}`, { signal: ctrl.signal });
      const data = await res.json() as ScreenerResponse;
      if (!ctrl.signal.aborted) {
        setResults(data.results ?? []);
        setTotalMatched(data.totalMatched ?? data.count ?? 0);
        setCapped(data.capped ?? false);
        setScannedAt(data.latestScannedAt ?? null);
      }
    } catch {
      if (!ctrl.signal.aborted) setResults([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  // ── URL persist ──────────────────────────────────────────────────────
  // Mount'ta URL'den filtreleri oku (paylaşılabilir/bookmark'lanabilir bağlantı)
  const didReadUrlRef = useRef(false);
  useEffect(() => {
    if (didReadUrlRef.current) return;
    didReadUrlRef.current = true;
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.toString().length === 0) return;
    setFilters({
      sector:        sp.get('sector')        ?? '',
      signalType:    sp.get('signalType')    ?? '',
      severity:      sp.get('severity')      ?? '',
      direction:     (sp.get('direction') as Filters['direction']) ?? '',
      mtfOnly:       sp.get('mtfOnly') === '1',
      rsiMin:        sp.get('rsiMin')        ?? '',
      rsiMax:        sp.get('rsiMax')        ?? '',
      changeMin:     sp.get('changeMin')     ?? '',
      changeMax:     sp.get('changeMax')     ?? '',
      volumeMin:     sp.get('volumeMin')     ?? '',
      confluenceMin: sp.get('confluenceMin') ?? '',
      near52wHigh:   sp.get('near52wHigh')   ?? '',
      near52wLow:    sp.get('near52wLow')    ?? '',
      relVol5Min:    sp.get('relVol5Min')    ?? '',
    });
  }, []);

  // Filtre değiştikçe URL'i güncelle (replaceState — history kirliliği yok)
  useEffect(() => {
    if (!didReadUrlRef.current) return;
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams();
    if (filters.sector)        sp.set('sector', filters.sector);
    if (filters.signalType)    sp.set('signalType', filters.signalType);
    if (filters.severity)      sp.set('severity', filters.severity);
    if (filters.direction)     sp.set('direction', filters.direction);
    if (filters.mtfOnly)       sp.set('mtfOnly', '1');
    if (filters.rsiMin)        sp.set('rsiMin', filters.rsiMin);
    if (filters.rsiMax)        sp.set('rsiMax', filters.rsiMax);
    if (filters.changeMin)     sp.set('changeMin', filters.changeMin);
    if (filters.changeMax)     sp.set('changeMax', filters.changeMax);
    if (filters.volumeMin)     sp.set('volumeMin', filters.volumeMin);
    if (filters.confluenceMin) sp.set('confluenceMin', filters.confluenceMin);
    if (filters.near52wHigh)   sp.set('near52wHigh', filters.near52wHigh);
    if (filters.near52wLow)    sp.set('near52wLow', filters.near52wLow);
    if (filters.relVol5Min)    sp.set('relVol5Min', filters.relVol5Min);
    const qs = sp.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [filters]);

  // Tek useEffect — filtre değişince debounced çalışır, ilk render'da da bir kez tetiklenir (B4 fix).
  useEffect(() => {
    const timer = setTimeout(() => runScreener(filters), 300);
    return () => clearTimeout(timer);
  }, [filters, runScreener]);

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  // Client-side sıralama
  const sortedResults = useMemo(() => {
    const arr = [...results];
    const dirMul = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av = pickSortValue(a, sortKey);
      const bv = pickSortValue(b, sortKey);
      // null'ları her zaman sona at
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dirMul;
      }
      return ((av as number) - (bv as number)) * dirMul;
    });
    return arr;
  }, [results, sortKey, sortDir]);

  function handleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir(k === 'sembol' ? 'asc' : 'desc');
    }
  }

  // CSV indir — görünür/sıralı sonuçları
  function downloadCsv() {
    if (sortedResults.length === 0) {
      toast.info('İndirilecek sonuç yok');
      return;
    }
    const headers = [
      'Sembol', 'Sektör', 'Fiyat', 'Değişim%', 'RSI', 'Hacim',
      'Confluence', 'relVol5', '52H_Tepe%', '52H_Dip%', 'Yön', 'MTF', 'TopSinyal',
    ];
    const rows = sortedResults.map((r) => {
      const top = [...r.signals].sort((a, b) => {
        const order = { güçlü: 3, orta: 2, zayıf: 1 } as Record<string, number>;
        return (order[b.severity] ?? 0) - (order[a.severity] ?? 0);
      })[0];
      return [
        r.sembol,
        r.sectorName ?? '',
        r.lastClose ?? '',
        r.changePercent !== null ? r.changePercent.toFixed(2) : '',
        r.rsi !== null ? r.rsi.toFixed(0) : '',
        r.lastVolume ?? '',
        r.confluenceScore ?? '',
        r.relVol5 ?? '',
        r.pctFrom52wHigh !== null ? r.pctFrom52wHigh.toFixed(2) : '',
        r.pctFrom52wLow  !== null ? r.pctFrom52wLow.toFixed(2)  : '',
        r.dominantDir === 'yukari' ? 'AL' : r.dominantDir === 'asagi' ? 'SAT' : r.dominantDir === 'karisik' ? 'KARIŞIK' : '',
        r.anyMtf ? 'EVET' : '',
        top ? `${top.type} (${top.severity})` : '',
      ];
    });
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // BOM + ; ayraç (Excel TR locale uyumlu)
    const csv = '﻿' + [headers, ...rows].map((r) => r.map(escape).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bistai-screener-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${sortedResults.length} satır indirildi`);
  }

  // Bağlantıyı kopyala (URL persist sayesinde filtreler dahil)
  async function copyShareLink() {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Bağlantı kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Başlık ── */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
              <SlidersHorizontal className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">Çok Kriterli BIST Tarama</h1>
              <p className="text-sm text-text-muted">
                {TOTAL_BIST} BIST hissesini sektör · RSI · sinyal · confluence · MTF filtrelerinde tara
              </p>
            </div>
          </div>
        </div>

        {/* ── Hazır Preset Bar ── */}
        <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
          <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider shrink-0 mr-1">Hızlı Tarama:</span>
          {PRESETS.map((p) => {
            const isActive = activePreset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition shrink-0 ${
                  isActive
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-surface/40 text-text-secondary hover:border-primary/40 hover:text-text-primary'
                }`}
              >
                <span>{p.emoji}</span>
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Sol: Filtreler ── */}
          <aside className={`lg:w-72 shrink-0 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="rounded-xl border border-border bg-surface/60 backdrop-blur-sm p-4 space-y-5 sticky top-4">

              {/* Filtre başlığı */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Filtreler</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-red-400 transition"
                  >
                    <X className="h-3 w-3" /> Temizle ({activeFilterCount})
                  </button>
                )}
              </div>

              {/* Sektör */}
              <FilterSelect
                label="Sektör"
                value={filters.sector}
                onChange={(v) => setFilter('sector', v)}
                options={SECTOR_OPTIONS}
                placeholder="Tüm sektörler"
              />

              {/* Sinyal Tipi */}
              <FilterSelect
                label="Sinyal Tipi"
                value={filters.signalType}
                onChange={(v) => setFilter('signalType', v)}
                options={SIGNAL_TYPES.map((t) => ({ value: t, label: t }))}
                placeholder="Tüm sinyaller"
              />

              {/* Şiddet */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Sinyal Şiddeti</label>
                <div className="flex gap-2">
                  {SEVERITY_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setFilter('severity', filters.severity === s.value ? '' : s.value)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition ${
                        filters.severity === s.value
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border text-text-muted hover:border-border/80'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {filters.signalType && filters.severity && (
                  <p className="text-[10px] text-text-muted leading-snug pt-0.5">
                    Aynı sinyalde tipi <span className="text-text-secondary">{filters.signalType}</span> ve şiddeti{' '}
                    <span className="text-text-secondary">{filters.severity}</span> olan hisseler.
                  </p>
                )}
              </div>

              {/* RSI */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">RSI Aralığı</label>
                {/* Preset butonları */}
                <div className="flex flex-wrap gap-1.5">
                  {RSI_PRESETS.map((p) => {
                    const active = filters.rsiMin === p.rsiMin && filters.rsiMax === p.rsiMax;
                    return (
                      <button
                        key={p.label}
                        onClick={() => {
                          if (active) { setFilter('rsiMin', ''); setFilter('rsiMax', ''); }
                          else { setFilter('rsiMin', p.rsiMin); setFilter('rsiMax', p.rsiMax); }
                        }}
                        className={`rounded-md border px-2 py-1 text-[11px] transition ${
                          active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-text-muted hover:border-primary/40'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FilterInput label="Min" value={filters.rsiMin} onChange={(v) => setFilter('rsiMin', v)} placeholder="0" />
                  <FilterInput label="Max" value={filters.rsiMax} onChange={(v) => setFilter('rsiMax', v)} placeholder="100" />
                </div>
              </div>

              {/* Fiyat Değişimi */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Günlük Değişim %</label>
                <div className="grid grid-cols-2 gap-2">
                  <FilterInput label="Min %" value={filters.changeMin} onChange={(v) => setFilter('changeMin', v)} placeholder="-10" />
                  <FilterInput label="Max %" value={filters.changeMax} onChange={(v) => setFilter('changeMax', v)} placeholder="+10" />
                </div>
              </div>

              {/* Hacim */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Min. Hacim</label>
                <div className="flex flex-wrap gap-1.5">
                  {VOLUME_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setFilter('volumeMin', filters.volumeMin === p.value ? '' : p.value)}
                      className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                        filters.volumeMin === p.value ? 'border-primary bg-primary/15 text-primary' : 'border-border text-text-muted hover:border-primary/40'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Yön */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Yön</label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {([
                    { val: '',       label: 'Tümü'   },
                    { val: 'yukari', label: '↑ AL'   },
                    { val: 'asagi',  label: '↓ SAT'  },
                  ] as const).map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() => setFilter('direction', opt.val)}
                      className={`flex-1 px-2 py-1.5 text-xs font-medium transition ${
                        filters.direction === opt.val
                          ? (opt.val === 'yukari' ? 'bg-emerald-500/20 text-emerald-300'
                            : opt.val === 'asagi' ? 'bg-red-500/20 text-red-300'
                            : 'bg-primary/15 text-primary')
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Confluence */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                  Min. Confluence Skoru
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { val: '40', label: '40+ Orta'   },
                    { val: '60', label: '60+ Güçlü'  },
                    { val: '75', label: '75+ Yüksek' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() => setFilter('confluenceMin', filters.confluenceMin === opt.val ? '' : opt.val)}
                      className={`rounded-md border px-2 py-1 text-[11px] transition ${
                        filters.confluenceMin === opt.val
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border text-text-muted hover:border-primary/40'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-muted/80 leading-snug">
                  Birden fazla farklı kategorideki sinyalin aynı anda gerçekleşmesi
                </p>
              </div>

              {/* MTF — haftalık aligned */}
              <div className="pt-1">
                <button
                  onClick={() => setFilter('mtfOnly', !filters.mtfOnly)}
                  aria-pressed={filters.mtfOnly}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    filters.mtfOnly
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-border text-text-muted hover:text-text-primary'
                  }`}
                  title="Sadece haftalık trendle uyumlu (MTF) sinyalleri göster"
                >
                  <span>Sadece MTF Uyumlu (Haftalık ✓)</span>
                  <span>{filters.mtfOnly ? 'Açık' : 'Kapalı'}</span>
                </button>
              </div>

              {/* 52H Tepe/Dip Yakınlığı */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                  52 Hafta Tepe/Dip Yakınlığı
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { side: 'high', val: '3',  label: 'Tepe ≤%3'  },
                    { side: 'high', val: '7',  label: 'Tepe ≤%7'  },
                    { side: 'low',  val: '8',  label: 'Dip ≤%8'   },
                    { side: 'low',  val: '15', label: 'Dip ≤%15'  },
                  ] as const).map((opt) => {
                    const isHigh = opt.side === 'high';
                    const active = isHigh
                      ? filters.near52wHigh === opt.val
                      : filters.near52wLow  === opt.val;
                    return (
                      <button
                        key={`${opt.side}-${opt.val}`}
                        onClick={() => {
                          // Karşı tarafı temizle, mevcutu toggle et
                          if (isHigh) {
                            setFilter('near52wLow', '');
                            setFilter('near52wHigh', active ? '' : opt.val);
                          } else {
                            setFilter('near52wHigh', '');
                            setFilter('near52wLow', active ? '' : opt.val);
                          }
                        }}
                        className={`rounded-md border px-2 py-1 text-[11px] transition ${
                          active
                            ? (isHigh ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                       : 'border-blue-500/40 bg-blue-500/10 text-blue-300')
                            : 'border-border text-text-muted hover:border-primary/40'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-text-muted/80 leading-snug">
                  Tepe yakını = momentum gücü; dip yakını = dönüş fırsatı
                </p>
              </div>

              {/* Relative Volume (5g) */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                  Min. Bağıl Hacim (5g)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { val: '1.5', label: '1.5×' },
                    { val: '2',   label: '2×'   },
                    { val: '3',   label: '3×'   },
                  ] as const).map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() => setFilter('relVol5Min', filters.relVol5Min === opt.val ? '' : opt.val)}
                      className={`rounded-md border px-2 py-1 text-[11px] transition ${
                        filters.relVol5Min === opt.val
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border text-text-muted hover:border-primary/40'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-muted/80 leading-snug">
                  Son hacim, 5 günlük ortalamanın kaç katı? 1.5×+ = anormal aktivite
                </p>
              </div>

            </div>
          </aside>

          {/* ── Sağ: Sonuçlar ── */}
          <div className="flex-1 min-w-0">

            {/* Araç çubuğu */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowFilters((p) => !p)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-text-primary transition lg:hidden"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtreler {activeFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
                </button>
                {hasSearched && !loading && (
                  <span className="text-sm text-text-muted">
                    <span className="font-semibold text-text-primary">{results.length}</span>
                    {capped && <span> / {totalMatched}</span>}
                    {' '}sonuç
                  </span>
                )}
                {capped && (
                  <span
                    title={`Toplam ${totalMatched} eşleşti, ilk 200'ü gösteriliyor — filtreleri daraltın`}
                    className="text-[11px] rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300"
                  >
                    Limit: ilk 200
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {scannedAt && (
                  <span
                    title={`Veri taraması: ${new Date(scannedAt).toLocaleString('tr-TR')}`}
                    className="flex items-center gap-1 text-[11px] text-text-muted"
                  >
                    <Clock className="h-3 w-3" />
                    {dataAgeText(scannedAt)}
                  </span>
                )}
                <button
                  onClick={copyShareLink}
                  title="Bu filtre kombinasyonunu paylaşılabilir bağlantı olarak kopyala"
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-text-muted hover:text-text-primary transition"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Paylaş</span>
                </button>
                <button
                  onClick={downloadCsv}
                  disabled={sortedResults.length === 0}
                  title="Sonuçları CSV olarak indir (Excel uyumlu)"
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-text-muted hover:text-text-primary transition disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">CSV</span>
                </button>
                <button
                  onClick={() => runScreener(filters)}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-text-primary transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Tarıyor...' : 'Yenile'}
                </button>
              </div>
            </div>

            {/* Kolon başlıkları (sıralama) */}
            {hasSearched && results.length > 0 && (
              <div className="mb-2 flex items-center gap-3 px-4 py-2 rounded-lg border border-border/60 bg-surface/30">
                {loggedIn && <span className="w-5 shrink-0" />}
                <SortHeader label="Sembol"  sortKey="sembol"      current={sortKey} dir={sortDir} onSort={handleSort} className="w-20 shrink-0" />
                <SortHeader label="Fiyat"   sortKey="price"       current={sortKey} dir={sortDir} onSort={handleSort} className="w-14 shrink-0 hidden md:flex" />
                <SortHeader label="Değ %"   sortKey="change"      current={sortKey} dir={sortDir} onSort={handleSort} className="w-16 shrink-0" />
                <SortHeader label="RSI"     sortKey="rsi"         current={sortKey} dir={sortDir} onSort={handleSort} className="w-24 shrink-0 hidden sm:flex" />
                <SortHeader label="Hacim"   sortKey="volume"      current={sortKey} dir={sortDir} onSort={handleSort} className="w-14 shrink-0 hidden lg:flex" />
                <SortHeader label="rVol"    sortKey="relVol5"     current={sortKey} dir={sortDir} onSort={handleSort} className="w-12 shrink-0 hidden lg:flex" />
                <SortHeader label="52H"     sortKey="pct52High"   current={sortKey} dir={sortDir} onSort={handleSort} className="w-14 shrink-0 hidden xl:flex" />
                <SortHeader label="Conf"    sortKey="confluence"  current={sortKey} dir={sortDir} onSort={handleSort} className="w-12 shrink-0" />
                <SortHeader label="Sinyal"  sortKey="signalCount" current={sortKey} dir={sortDir} onSort={handleSort} className="flex-1" />
              </div>
            )}

            {/* Sonuç listesi */}
            {loading && results.length === 0 ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl border border-border bg-surface/40 animate-pulse" />
                ))}
              </div>
            ) : sortedResults.length === 0 && hasSearched ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface/30 py-16 text-center px-4">
                <Search className="h-10 w-10 text-text-muted/40 mb-3" />
                <p className="text-text-muted mb-1">Filtrelere uyan hisse bulunamadı</p>
                <p className="text-[11px] text-text-muted/70 mb-3 max-w-xs">
                  {activeFilterCount > 0
                    ? 'Filtreleri gevşetmeyi dene — örn. RSI aralığını genişlet veya hacim eşiğini düşür.'
                    : 'Veri henüz hazır değil olabilir, birazdan tekrar dene.'}
                </p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="text-sm text-primary hover:underline">
                    Tüm filtreleri temizle
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {sortedResults.map((r) => (
                  <ScreenerRow
                    key={r.sembol}
                    result={r}
                    loggedIn={loggedIn}
                    inWatchlist={watchlist.has(r.sembol)}
                    onWatchlistToggle={handleWatchlistToggle}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function pickSortValue(r: ScreenerResult, key: SortKey): number | string | null {
  switch (key) {
    case 'sembol':      return r.sembol;
    case 'change':      return r.changePercent;
    case 'rsi':         return r.rsi;
    case 'volume':      return r.lastVolume;
    case 'price':       return r.lastClose;
    case 'signalCount': return r.signalCount;
    case 'confluence':  return r.confluenceScore;
    case 'relVol5':     return r.relVol5;
    case 'pct52High':   return r.pctFrom52wHigh;
  }
}

// ── Sonuç satırı ──────────────────────────────────────────────────────────────

function ConfluenceBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-text-muted text-xs">—</span>;
  const cls =
    score >= 75 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
    score >= 60 ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
    score >= 40 ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25' :
                  'bg-white/5 text-text-muted border-border';
  return (
    <span className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold tabular-nums w-full ${cls}`}>
      {score}
    </span>
  );
}

function ScreenerRow({
  result, loggedIn, inWatchlist, onWatchlistToggle,
}: {
  result: ScreenerResult;
  loggedIn: boolean;
  inWatchlist: boolean;
  onWatchlistToggle: (sembol: string) => void;
}) {
  const { sembol, signals, changePercent, rsi, lastVolume, lastClose, sectorName, confluenceScore, dominantDir, anyMtf, relVol5, pctFrom52wHigh, pctFrom52wLow } = result;

  const changePct = changePercent;
  const effectivePct = changePct ?? 0;
  const changeColor = effectivePct > 0 ? 'text-emerald-400' : effectivePct < 0 ? 'text-red-400' : 'text-text-muted';
  const ChangeIcon = effectivePct > 0 ? TrendingUp : effectivePct < 0 ? TrendingDown : Minus;

  // En güçlü sinyali öne çıkar — kopya üzerinde sırala (B2: state mutasyonu önle)
  const sortedSignals = [...signals].sort((a, b) => {
    const order = { güçlü: 3, orta: 2, zayıf: 1 } as Record<string, number>;
    return (order[b.severity] ?? 0) - (order[a.severity] ?? 0);
  });
  const topSignal = sortedSignals[0];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/50 px-4 py-3 transition hover:border-primary/30 hover:bg-surface">

      {/* Watchlist yıldız */}
      {loggedIn && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWatchlistToggle(sembol); }}
          className="w-5 shrink-0 flex items-center justify-center"
          aria-label={inWatchlist ? 'İzleme listesinden çıkar' : 'İzleme listesine ekle'}
          title={inWatchlist ? 'İzleme listesinden çıkar' : 'İzleme listesine ekle'}
        >
          <Star
            className={`h-4 w-4 transition ${
              inWatchlist ? 'fill-amber-400 text-amber-400' : 'text-text-muted hover:text-amber-400'
            }`}
          />
        </button>
      )}

      <Link href={`/hisse/${sembol}`} className="flex flex-1 items-center gap-3 min-w-0">

        {/* Sembol + sektör + yön */}
        <div className="w-20 shrink-0">
          <div className="flex items-center gap-1">
            <p className="font-semibold text-text-primary">{sembol}</p>
            {dominantDir === 'yukari' && <span className="text-[10px] text-emerald-400" title="Yukarı yönlü sinyaller">↑</span>}
            {dominantDir === 'asagi'  && <span className="text-[10px] text-red-400"     title="Aşağı yönlü sinyaller">↓</span>}
            {dominantDir === 'karisik' && <span className="text-[10px] text-text-muted" title="Karışık yön">≷</span>}
          </div>
          {sectorName && (
            <p className="text-[10px] text-text-muted truncate">{sectorName}</p>
          )}
        </div>

        {/* Son fiyat */}
        <div className="hidden w-14 shrink-0 md:block text-sm font-mono text-text-primary tabular-nums">
          {formatPrice(lastClose)}
        </div>

        {/* Değişim */}
        <div className={`flex w-16 shrink-0 items-center gap-1 text-sm font-medium tabular-nums ${changeColor}`}>
          {changePct !== null && <ChangeIcon className="h-3.5 w-3.5" />}
          {changePct !== null ? `${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
        </div>

        {/* RSI */}
        <div className="hidden w-24 shrink-0 sm:block">
          <RsiBar rsi={rsi} />
        </div>

        {/* Hacim */}
        <div className="hidden w-14 shrink-0 text-xs text-text-muted lg:block tabular-nums">
          <BarChart2 className="inline h-3 w-3 mr-0.5" />
          {formatVolume(lastVolume)}
        </div>

        {/* Relative Volume (5g) */}
        <div className="hidden w-12 shrink-0 lg:block">
          {relVol5 !== null ? (
            <span
              title={`Son hacim, 5 günlük ortalamanın ${relVol5.toFixed(1)} katı`}
              className={`text-xs font-mono tabular-nums ${
                relVol5 >= 3   ? 'text-emerald-400 font-bold' :
                relVol5 >= 1.5 ? 'text-emerald-300' :
                relVol5 >= 1   ? 'text-text-secondary' :
                                 'text-text-muted'
              }`}
            >
              {relVol5.toFixed(1)}×
            </span>
          ) : (
            <span className="text-xs text-text-muted">—</span>
          )}
        </div>

        {/* 52H Tepe/Dip */}
        <div className="hidden w-14 shrink-0 xl:block">
          {pctFrom52wHigh !== null ? (
            (() => {
              const dHigh = Math.abs(pctFrom52wHigh);
              const dLow  = pctFrom52wLow ?? 999;
              const tepeYakin = dHigh <= dLow;
              const cls = tepeYakin
                ? (dHigh <= 3 ? 'text-emerald-400 font-bold' : dHigh <= 10 ? 'text-emerald-300' : 'text-text-muted')
                : (dLow  <= 8 ? 'text-blue-300 font-bold'    : 'text-text-muted');
              const Icon = tepeYakin ? Mountain : TrendingDown;
              const text = tepeYakin ? `−${dHigh.toFixed(0)}%` : `+${dLow.toFixed(0)}%`;
              const title = tepeYakin
                ? `52H tepeden ${dHigh.toFixed(1)}% aşağıda`
                : `52H dipten ${dLow.toFixed(1)}% yukarıda`;
              return (
                <span title={title} className={`flex items-center gap-0.5 text-[11px] font-mono tabular-nums ${cls}`}>
                  <Icon className="h-3 w-3 shrink-0" />
                  {text}
                </span>
              );
            })()
          ) : (
            <span className="text-xs text-text-muted">—</span>
          )}
        </div>

        {/* Confluence */}
        <div className="w-12 shrink-0">
          <ConfluenceBadge score={confluenceScore} />
        </div>

        {/* Sinyaller */}
        <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
          {signals.length === 0 ? (
            <span className="text-xs text-text-muted">Sinyal yok</span>
          ) : topSignal ? (
            <>
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${
                topSignal.severity === 'güçlü' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : topSignal.severity === 'orta' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                : 'border-border text-text-muted'
              }`}>
                <SeverityDot severity={topSignal.severity} />
                {topSignal.type}
              </span>
              {signals.length > 1 && (
                <span className="text-[11px] text-text-muted">+{signals.length - 1}</span>
              )}
              {anyMtf && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 text-[10px] text-emerald-300"
                  title="Haftalık trendle uyumlu (MTF)"
                >
                  <Target className="h-2.5 w-2.5" /> MTF
                </span>
              )}
            </>
          ) : null}
        </div>
      </Link>
    </div>
  );
}
