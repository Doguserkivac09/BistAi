'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal, X, ChevronDown, TrendingUp, TrendingDown, Minus, BarChart2, RefreshCw } from 'lucide-react';
import { SECTORS } from '@/lib/sectors';

// ── Tipler ────────────────────────────────────────────────────────────────────

interface ScreenerResult {
  sembol: string;
  signals: Array<{ type: string; direction: string; severity: string; candlesAgo?: number }>;
  signalCount: number;
  changePercent: number | null;
  rsi: number | null;
  lastVolume: number | null;
  sector: string | null;
  sectorName: string | null;
}

interface Filters {
  sector: string;
  signalType: string;
  severity: string;
  rsiMin: string;
  rsiMax: string;
  changeMin: string;
  changeMax: string;
  volumeMin: string;
}

const EMPTY_FILTERS: Filters = {
  sector: '', signalType: '', severity: '',
  rsiMin: '', rsiMax: '', changeMin: '', changeMax: '', volumeMin: '',
};

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

// ── Yardımcı bileşenler ───────────────────────────────────────────────────────

function formatVolume(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}Md`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

function RsiBar({ rsi }: { rsi: number | null }) {
  if (rsi === null) return <span className="text-text-muted text-xs">—</span>;
  const color = rsi < 30 ? 'text-blue-400' : rsi > 70 ? 'text-red-400' : 'text-text-primary';
  const barColor = rsi < 30 ? 'bg-blue-500' : rsi > 70 ? 'bg-red-500' : 'bg-primary';
  return (
    <div className="flex items-center gap-1.5 min-w-[70px]">
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${rsi}%` }} />
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

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────

export default function ScreenerPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  function setFilter<K extends keyof Filters>(key: K, val: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const runScreener = useCallback(async (f: Filters) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setHasSearched(true);

    const params = new URLSearchParams();
    if (f.sector)     params.set('sector', f.sector);
    if (f.signalType) params.set('signalType', f.signalType);
    if (f.severity)   params.set('severity', f.severity);
    if (f.rsiMin)     params.set('rsiMin', f.rsiMin);
    if (f.rsiMax)     params.set('rsiMax', f.rsiMax);
    if (f.changeMin)  params.set('changeMin', f.changeMin);
    if (f.changeMax)  params.set('changeMax', f.changeMax);
    if (f.volumeMin)  params.set('volumeMin', f.volumeMin);
    params.set('limit', '200');

    try {
      const res = await fetch(`/api/screener?${params}`, { signal: ctrl.signal });
      const data = await res.json();
      if (!ctrl.signal.aborted) {
        setResults(data.results ?? []);
        setTotal(data.count ?? 0);
      }
    } catch {
      if (!ctrl.signal.aborted) setResults([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  // Her filtre değişikliğinde otomatik tara (debounced)
  useEffect(() => {
    const timer = setTimeout(() => runScreener(filters), 400);
    return () => clearTimeout(timer);
  }, [filters, runScreener]);

  // İlk yüklemede boş filtrelerle tara (tüm hisseleri göster)
  useEffect(() => { runScreener(EMPTY_FILTERS); }, [runScreener]);

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Başlık ── */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
              <SlidersHorizontal className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">Özel Screener</h1>
              <p className="text-sm text-text-muted">295 BIST hissesini filtrele — RSI, sektör, sinyal, hacim</p>
            </div>
          </div>
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

            </div>
          </aside>

          {/* ── Sağ: Sonuçlar ── */}
          <div className="flex-1 min-w-0">

            {/* Araç çubuğu */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters((p) => !p)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-text-primary transition lg:hidden"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtreler {activeFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
                </button>
                {hasSearched && !loading && (
                  <span className="text-sm text-text-muted">
                    <span className="font-semibold text-text-primary">{total}</span> sonuç
                  </span>
                )}
              </div>
              <button
                onClick={() => runScreener(filters)}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-text-primary transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Tarıyor...' : 'Yenile'}
              </button>
            </div>

            {/* Sonuç listesi */}
            {loading && results.length === 0 ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl border border-border bg-surface/40 animate-pulse" />
                ))}
              </div>
            ) : results.length === 0 && hasSearched ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface/30 py-16">
                <Search className="h-10 w-10 text-text-muted/40 mb-3" />
                <p className="text-text-muted">Filtrelere uyan hisse bulunamadı</p>
                <button onClick={resetFilters} className="mt-3 text-sm text-primary hover:underline">
                  Filtreleri temizle
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((r) => (
                  <ScreenerRow key={r.sembol} result={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sonuç satırı ──────────────────────────────────────────────────────────────

function ScreenerRow({ result }: { result: ScreenerResult }) {
  const { sembol, signals, changePercent, rsi, lastVolume, sectorName } = result;

  const changePct = changePercent ?? 0;
  const changeColor = changePct > 0 ? 'text-emerald-400' : changePct < 0 ? 'text-red-400' : 'text-text-muted';
  const ChangeIcon = changePct > 0 ? TrendingUp : changePct < 0 ? TrendingDown : Minus;

  // En güçlü sinyali öne çıkar
  const topSignal = signals.sort((a, b) => {
    const order = { güçlü: 3, orta: 2, zayıf: 1 } as Record<string, number>;
    return (order[b.severity] ?? 0) - (order[a.severity] ?? 0);
  })[0];

  return (
    <Link
      href={`/hisse/${sembol}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-surface/50 px-4 py-3 transition hover:border-primary/30 hover:bg-surface"
    >
      {/* Sembol + sektör */}
      <div className="w-24 shrink-0">
        <p className="font-semibold text-text-primary">{sembol}</p>
        {sectorName && (
          <p className="text-[10px] text-text-muted truncate">{sectorName}</p>
        )}
      </div>

      {/* Değişim */}
      <div className={`flex w-16 shrink-0 items-center gap-1 text-sm font-medium ${changeColor}`}>
        <ChangeIcon className="h-3.5 w-3.5" />
        {changePct !== 0 ? `${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
      </div>

      {/* RSI */}
      <div className="hidden w-24 shrink-0 sm:block">
        <RsiBar rsi={rsi} />
      </div>

      {/* Hacim */}
      <div className="hidden w-16 shrink-0 text-xs text-text-muted lg:block">
        <BarChart2 className="inline h-3 w-3 mr-0.5" />
        {formatVolume(lastVolume)}
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
          </>
        ) : null}
      </div>
    </Link>
  );
}
