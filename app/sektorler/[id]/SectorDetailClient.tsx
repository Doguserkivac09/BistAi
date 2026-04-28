'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, TrendingUp, TrendingDown, BarChart2, RefreshCw, Clock,
  Award, AlertTriangle, ExternalLink, Star, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTORS, getSymbolsBySector } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';
import type { OHLCVCandle } from '@/types';

interface StockData {
  sembol:    string;
  change5d:  number | null;
  change20d: number | null;
  change60d: number | null;
  lastPrice: number | null;
}

type PeriodDays = 5 | 20 | 60;
type SortKey   = 'sembol' | 'price' | 'perf';
type SortDir   = 'asc' | 'desc';

const PERIODS: Array<{ label: string; value: PeriodDays }> = [
  { label: '1H', value: 5 },
  { label: '1A', value: 20 },
  { label: '3A', value: 60 },
];

function tradingDays(c: OHLCVCandle[]) {
  return c.filter((x) => (x.volume ?? 0) > 0);
}

function getPeriodReturn(candles: OHLCVCandle[], days: number): number | null {
  const td = tradingDays(candles);
  if (td.length < days + 1) return null;
  const last = td[td.length - 1]!.close;
  const base = td[td.length - 1 - days]!.close;
  if (base === 0) return null;
  return Math.round(((last - base) / base) * 10000) / 100;
}

function fmtPct(v: number | null, sign = true) {
  if (v === null) return '—';
  const s = sign && v >= 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

function fmtPrice(v: number | null) {
  if (v === null) return '—';
  if (v >= 1000) return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  if (v >= 10)   return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function dataAgeText(d: Date | null): string {
  if (!d) return '';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk önce`;
  return `${Math.floor(m / 60)} sa önce`;
}

export function SectorDetailClient({ sectorId }: { sectorId: SectorId }) {
  const sectorInfo = SECTORS[sectorId];
  const allSymbols = useMemo(() => getSymbolsBySector(sectorId), [sectorId]);

  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [period, setPeriod] = useState<PeriodDays>(20);
  const [sortKey, setSortKey] = useState<SortKey>('perf');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch]   = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [failed, setFailed]   = useState<number>(0);

  // Verileri çek — tüm sektör hisseleri
  useEffect(() => {
    if (allSymbols.length === 0) return;
    setLoading(true);
    setFailed(0);

    let failedCount = 0;
    const acc: StockData[] = [];

    void (async () => {
      await Promise.allSettled(
        allSymbols.map(async (sembol) => {
          try {
            const res = await fetch(`/api/ohlcv?symbol=${sembol}&days=120`);
            if (!res.ok) {
              failedCount++;
              acc.push({ sembol, change5d: null, change20d: null, change60d: null, lastPrice: null });
              return;
            }
            const { candles = [] } = await res.json() as { candles: OHLCVCandle[] };
            const td = tradingDays(candles);
            acc.push({
              sembol,
              change5d:  getPeriodReturn(candles, 5),
              change20d: getPeriodReturn(candles, 20),
              change60d: getPeriodReturn(candles, 60),
              lastPrice: td.length > 0 ? td[td.length - 1]!.close : null,
            });
          } catch {
            failedCount++;
            acc.push({ sembol, change5d: null, change20d: null, change60d: null, lastPrice: null });
          }
        }),
      );
      setStocks(acc);
      setFailed(failedCount);
      setLoading(false);
      setLastUpdated(new Date());
    })();
  }, [allSymbols, refreshTick]);

  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  const getPerf = useCallback((s: StockData) =>
    period === 5 ? s.change5d : period === 20 ? s.change20d : s.change60d,
    [period],
  );

  // Filtreli + sıralı liste
  const sortedStocks = useMemo(() => {
    const q = search.trim().toUpperCase();
    let arr = stocks;
    if (q.length > 0) arr = arr.filter((s) => s.sembol.includes(q));

    const dirMul = sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      let av: number | string | null;
      let bv: number | string | null;
      if (sortKey === 'sembol') { av = a.sembol; bv = b.sembol; }
      else if (sortKey === 'price') { av = a.lastPrice; bv = b.lastPrice; }
      else { av = getPerf(a); bv = getPerf(b); }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dirMul;
      }
      return ((av as number) - (bv as number)) * dirMul;
    });
  }, [stocks, search, sortKey, sortDir, getPerf]);

  // Özet istatistikler
  const stats = useMemo(() => {
    const valid = stocks.filter((s) => getPerf(s) !== null);
    if (valid.length === 0) return null;
    const perfs = valid.map((s) => getPerf(s) as number);
    const avg = perfs.reduce((s, p) => s + p, 0) / perfs.length;
    const sortedAsc = [...perfs].sort((a, b) => a - b);
    const median = sortedAsc[Math.floor(sortedAsc.length / 2)] ?? 0;
    const positives = perfs.filter((p) => p > 0).length;
    const negatives = perfs.filter((p) => p < 0).length;
    const best = valid.reduce((b, c) => (getPerf(c)! > getPerf(b)! ? c : b));
    const worst = valid.reduce((b, c) => (getPerf(c)! < getPerf(b)! ? c : b));
    return { avg, median, positives, negatives, total: valid.length, best, worst };
  }, [stocks, getPerf]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'sembol' ? 'asc' : 'desc'); }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-6">

        {/* Üst: Geri + Başlık + Yenile */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              href="/sektorler"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface/50 hover:bg-surface transition-colors mt-0.5"
              aria-label="Geri"
            >
              <ArrowLeft className="h-4 w-4 text-text-secondary" />
            </Link>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Sektör</p>
              <h1 className="text-2xl font-bold text-text-primary">{sectorInfo.name}</h1>
              <p className="text-xs text-text-secondary mt-1">
                {allSymbols.length} hisse · {failed > 0 && (
                  <span className="text-amber-400">{failed} sembol veri çekilemedi · </span>
                )}
                {lastUpdated && <>Veri {dataAgeText(lastUpdated)}</>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/tarama?sektor=${sectorId}`}
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Sinyal Taraması
            </Link>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              {loading ? 'Yükleniyor...' : 'Yenile'}
            </button>
          </div>
        </div>

        {/* Özet Kartlar */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
                <BarChart2 className="h-3 w-3" />
                Ortalama
              </div>
              <div className={cn(
                'text-lg font-bold tabular-nums',
                stats.avg >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}>
                {stats.avg >= 0 ? '+' : ''}{stats.avg.toFixed(2)}%
              </div>
              <p className="text-[10px] text-text-muted mt-0.5">
                Medyan: {stats.median >= 0 ? '+' : ''}{stats.median.toFixed(2)}%
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mb-1">
                <Award className="h-3 w-3" />
                En İyi
              </div>
              <div className="text-sm font-bold text-text-primary">{stats.best.sembol}</div>
              <p className="text-xs text-emerald-400 font-semibold tabular-nums">
                +{getPerf(stats.best)?.toFixed(2)}%
              </p>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-red-400 mb-1">
                <AlertTriangle className="h-3 w-3" />
                En Kötü
              </div>
              <div className="text-sm font-bold text-text-primary">{stats.worst.sembol}</div>
              <p className="text-xs text-red-400 font-semibold tabular-nums">
                {getPerf(stats.worst)?.toFixed(2)}%
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
                <TrendingUp className="h-3 w-3" />
                Dağılım
              </div>
              <div className="text-sm font-bold text-text-primary">
                <span className="text-emerald-400">{stats.positives}</span>
                <span className="text-text-muted"> / </span>
                <span className="text-red-400">{stats.negatives}</span>
              </div>
              <p className="text-[10px] text-text-muted mt-0.5">
                pozitif / negatif ({stats.total})
              </p>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            Sektör Hisseleri
          </h2>

          <div className="relative ml-auto md:ml-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sembol ara..."
              className="w-full md:w-44 rounded-lg border border-border bg-surface/30 pl-8 pr-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none"
            />
          </div>

          <div className="flex rounded-lg border border-border bg-surface/30 p-0.5 md:ml-auto">
            {PERIODS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                  period === value
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tablo */}
        {loading && stocks.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        ) : sortedStocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Search className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Sembol bulunamadı</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface/30 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-border bg-surface/50 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              <button
                onClick={() => handleSort('sembol')}
                className={cn('col-span-3 text-left hover:text-text-primary', sortKey === 'sembol' && 'text-primary')}
              >
                Sembol {sortKey === 'sembol' && (sortDir === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => handleSort('price')}
                className={cn('col-span-3 text-right hover:text-text-primary', sortKey === 'price' && 'text-primary')}
              >
                Fiyat {sortKey === 'price' && (sortDir === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => handleSort('perf')}
                className={cn('col-span-3 text-right hover:text-text-primary', sortKey === 'perf' && 'text-primary')}
              >
                {period === 5 ? '1H' : period === 20 ? '1A' : '3A'} % {sortKey === 'perf' && (sortDir === 'asc' ? '↑' : '↓')}
              </button>
              <span className="col-span-3 text-right">Diğer Periyot</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/40">
              {sortedStocks.map((s) => {
                const main = getPerf(s);
                const others = period === 5
                  ? [{ label: '1A', v: s.change20d }, { label: '3A', v: s.change60d }]
                  : period === 20
                  ? [{ label: '1H', v: s.change5d }, { label: '3A', v: s.change60d }]
                  : [{ label: '1H', v: s.change5d }, { label: '1A', v: s.change20d }];

                return (
                  <Link
                    key={s.sembol}
                    href={`/hisse/${s.sembol}`}
                    className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-xs hover:bg-white/5 transition-colors"
                  >
                    <span className="col-span-3 font-bold text-text-primary">{s.sembol}</span>
                    <span className="col-span-3 text-right font-mono text-text-secondary tabular-nums">
                      {fmtPrice(s.lastPrice)}
                    </span>
                    <span className={cn(
                      'col-span-3 text-right font-bold font-mono tabular-nums',
                      main === null ? 'text-text-muted' : main >= 0 ? 'text-emerald-400' : 'text-red-400',
                    )}>
                      {fmtPct(main)}
                    </span>
                    <span className="col-span-3 text-right text-[10px] text-text-muted font-mono tabular-nums">
                      {others.map((o, i) => (
                        <span key={o.label}>
                          {i > 0 && ' · '}
                          <span className={cn(
                            o.v === null ? '' : o.v >= 0 ? 'text-emerald-400/70' : 'text-red-400/70',
                          )}>
                            {o.label} {fmtPct(o.v, false)}
                          </span>
                        </span>
                      ))}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[10px] text-text-muted/60">
          Veri: Yahoo Finance ~15dk gecikmeli · Yatırım tavsiyesi değildir
        </p>
      </main>
    </div>
  );
}
