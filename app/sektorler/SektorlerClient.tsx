'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, RefreshCw, BarChart2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SECTORS, SECTOR_REPRESENTATIVES } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';
import type { CommodityQuote } from '@/lib/commodity';
import type { OHLCVCandle } from '@/types';

// ─── Türler ───────────────────────────────────────────────────────────────────

type PeriodDays = 5 | 20 | 60;
type DirFilter  = 'all' | 'yukari' | 'asagi' | 'nötr';
type SortBy     = 'perf' | 'name';

interface StockMomentum {
  sembol:    string;
  change5d:  number | null;
  change20d: number | null;
  change60d: number | null;
  lastPrice: number | null;
}

interface SectorData {
  id:          SectorId;
  name:        string;
  shortName:   string;
  avgByPeriod: { 5: number | null; 20: number | null; 60: number | null };
  stocks:      StockMomentum[];
  loaded:      boolean;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function tradingDays(candles: OHLCVCandle[]) {
  return candles.filter((c) => (c.volume ?? 0) > 0);
}

function getPeriodReturn(candles: OHLCVCandle[], days: number): number | null {
  const td = tradingDays(candles);
  if (td.length < 5) return null;
  const last = td[td.length - 1]!.close;
  const base = td[Math.max(0, td.length - days)]!.close;
  if (base === 0) return null;
  return Math.round(((last - base) / base) * 10000) / 100;
}

function getLastPrice(candles: OHLCVCandle[]): number | null {
  const td = tradingDays(candles);
  return td.length > 0 ? td[td.length - 1]!.close : null;
}

function formatPct(v: number | null, showSign = true): string {
  if (v === null) return '—';
  const sign = showSign && v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function formatPrice(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1000) return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  if (v >= 10)   return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 48, H = 20;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const col = positive ? '#22c55e' : '#ef4444';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-12 h-5 shrink-0" preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={col}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Emtia Kartı ─────────────────────────────────────────────────────────────

function CommodityCard({ quote }: { quote: CommodityQuote }) {
  const isUp   = (quote.change1d ?? 0) >= 0;
  const color  = isUp ? 'text-emerald-400' : 'text-red-400';
  const bg     = isUp
    ? 'border-emerald-500/20 bg-emerald-500/5'
    : 'border-red-500/20 bg-red-500/5';

  const priceStr = quote.lastPrice !== null
    ? `${quote.unit ? quote.unit + ' ' : ''}${formatPrice(quote.lastPrice)}`
    : '—';

  const sparkPrices = tradingDays(quote.candles)
    .slice(-20)
    .map((c) => c.close)
    .filter((v) => v > 0);

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        quote.lastPrice ? bg : 'border-border bg-surface/30',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-text-secondary">{quote.label}</span>
        {quote.change1d !== null && (
          <span className={cn('text-[11px] font-bold', color)}>
            {formatPct(quote.change1d)}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-1">
        <div className="text-base font-bold text-text-primary tabular-nums leading-tight">
          {priceStr}
        </div>
        {sparkPrices.length >= 2 && (
          <Sparkline values={sparkPrices} positive={isUp} />
        )}
      </div>
      {quote.change20d !== null && (
        <div className="mt-1 text-[10px] text-text-muted">
          20g:{' '}
          <span className={quote.change20d >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatPct(quote.change20d)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Sektör Kartı ─────────────────────────────────────────────────────────────

function SectorCard({
  data,
  index,
  period,
}: {
  data: SectorData;
  index: number;
  period: PeriodDays;
}) {
  const avg = data.avgByPeriod[period];

  const direction: 'yukari' | 'asagi' | 'nötr' =
    avg !== null && avg >= 2  ? 'yukari' :
    avg !== null && avg <= -2 ? 'asagi'  : 'nötr';

  const getChg = (s: StockMomentum) =>
    period === 5 ? s.change5d : period === 20 ? s.change20d : s.change60d;

  const sorted = [...data.stocks]
    .filter((s) => getChg(s) !== null)
    .sort((a, b) => (getChg(b) ?? 0) - (getChg(a) ?? 0));

  const best  = sorted[0] ?? null;
  const worst = sorted[sorted.length - 1] ?? null;

  const dirColor =
    direction === 'yukari' ? 'text-emerald-400' :
    direction === 'asagi'  ? 'text-red-400' : 'text-zinc-400';

  const borderColor =
    direction === 'yukari' ? 'border-emerald-500/25' :
    direction === 'asagi'  ? 'border-red-500/25' : 'border-border';

  const bgGlow =
    direction === 'yukari' ? 'bg-emerald-500/5' :
    direction === 'asagi'  ? 'bg-red-500/5' : '';

  const periodLabel = period === 5 ? '5g' : period === 20 ? '20g' : '60g';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn('rounded-xl border p-4 flex flex-col', borderColor, bgGlow)}
    >
      {/* Başlık */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary">{data.name}</h3>
          <p className="text-[11px] text-text-muted mt-0.5">{data.stocks.length} hisse</p>
        </div>
        <div className="text-right shrink-0">
          {avg !== null ? (
            <>
              <div className={cn('text-lg font-bold tabular-nums', dirColor)}>
                {formatPct(avg)}
              </div>
              <div className="text-[10px] text-text-muted">{periodLabel} ort.</div>
            </>
          ) : (
            <div className="flex items-center gap-1 text-text-muted text-sm">
              <div className="h-3 w-3 animate-spin rounded-full border border-text-muted border-t-transparent" />
              Yükleniyor
            </div>
          )}
        </div>
      </div>

      {/* Yön ikonu + skor barı */}
      {avg !== null && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            {direction === 'yukari' ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            ) : direction === 'asagi' ? (
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            ) : (
              <Minus className="h-3.5 w-3.5 text-zinc-400" />
            )}
            <span className={cn('text-[11px] font-semibold', dirColor)}>
              {direction === 'yukari' ? 'Yükseliş Trendi' :
               direction === 'asagi'  ? 'Düşüş Trendi' : 'Yatay Seyir'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                direction === 'yukari' ? 'bg-emerald-500/60' :
                direction === 'asagi'  ? 'bg-red-500/60' : 'bg-zinc-500/40',
              )}
              style={{ width: `${Math.min(100, Math.abs(avg) * 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* En iyi / en kötü */}
      {data.loaded && sorted.length > 0 && (
        <div className="space-y-1 mb-3">
          {best && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-muted">En iyi:</span>
              <span className="flex items-center gap-1.5">
                <a
                  href={`/hisse/${best.sembol}`}
                  className="font-mono font-semibold text-text-primary hover:text-primary transition-colors"
                >
                  {best.sembol}
                </a>
                <span className="text-emerald-400 font-semibold">{formatPct(getChg(best))}</span>
              </span>
            </div>
          )}
          {worst && worst.sembol !== best?.sembol && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-muted">En kötü:</span>
              <span className="flex items-center gap-1.5">
                <a
                  href={`/hisse/${worst.sembol}`}
                  className="font-mono font-semibold text-text-primary hover:text-primary transition-colors"
                >
                  {worst.sembol}
                </a>
                <span className="text-red-400 font-semibold">{formatPct(getChg(worst))}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Hisse chip'leri */}
      {data.loaded && (
        <div className="flex flex-wrap gap-1 flex-1">
          {sorted.map((s) => {
            const chg = getChg(s);
            return (
              <a
                key={s.sembol}
                href={`/hisse/${s.sembol}`}
                title={`${s.sembol} · ${formatPrice(s.lastPrice)} TL · ${formatPct(chg)}`}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold transition-colors',
                  (chg ?? 0) >= 2  ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' :
                  (chg ?? 0) <= -2 ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' :
                  'bg-white/5 text-text-secondary hover:bg-white/10',
                )}
              >
                {s.sembol}
              </a>
            );
          })}
        </div>
      )}

      {/* Taramaya Git */}
      <div className="mt-3 pt-3 border-t border-border/40">
        <Link
          href={`/tarama?sektor=${data.id}`}
          className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-primary transition-colors group"
        >
          <ExternalLink className="h-3 w-3 group-hover:text-primary" />
          Sinyal Taramasına Git
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

const PERIODS: { label: string; value: PeriodDays }[] = [
  { label: '1H', value: 5 },
  { label: '1A', value: 20 },
  { label: '3A', value: 60 },
];

export function SektorlerClient() {
  const [commodities,   setCommodities]   = useState<CommodityQuote[]>([]);
  const [sectorDataMap, setSectorDataMap] = useState<Map<SectorId, SectorData>>(new Map());
  const [loadingCommodity, setLoadingCommodity] = useState(true);
  const [loadingSectors,   setLoadingSectors]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filtre & sıralama
  const [period,    setPeriod]    = useState<PeriodDays>(20);
  const [dirFilter, setDirFilter] = useState<DirFilter>('all');
  const [sortBy,    setSortBy]    = useState<SortBy>('perf');

  // Sektörlerin başlangıç haritası
  useEffect(() => {
    const initial = new Map<SectorId, SectorData>();
    for (const [id, info] of Object.entries(SECTORS) as Array<[SectorId, typeof SECTORS[SectorId]]>) {
      const reps = SECTOR_REPRESENTATIVES[id];
      if (!reps || reps.length === 0) continue;
      initial.set(id, {
        id,
        name:      info.name,
        shortName: info.shortName,
        avgByPeriod: { 5: null, 20: null, 60: null },
        stocks: reps.map((s) => ({
          sembol: s, change5d: null, change20d: null, change60d: null, lastPrice: null,
        })),
        loaded: false,
      });
    }
    setSectorDataMap(initial);
  }, []);

  // Emtia verisi
  useEffect(() => {
    setLoadingCommodity(true);
    fetch('/api/commodity')
      .then((r) => r.json())
      .then((data: CommodityQuote[]) => setCommodities(data))
      .catch(() => {})
      .finally(() => setLoadingCommodity(false));
  }, []);

  // Sektör verisi — her zaman 65 gün çek, tüm periyotlar için yeterli
  useEffect(() => {
    if (sectorDataMap.size === 0) return;

    setLoadingSectors(true);
    const allSymbols = Array.from(sectorDataMap.values()).flatMap((d) => d.stocks.map((s) => s.sembol));
    const unique = [...new Set(allSymbols)];

    let completed = 0;
    const results = new Map<string, {
      change5d: number | null; change20d: number | null; change60d: number | null; lastPrice: number | null;
    }>();

    void (async () => {
      await Promise.allSettled(
        unique.map(async (sembol) => {
          try {
            const res = await fetch(`/api/ohlcv?symbol=${sembol}&days=65`);
            const { candles = [] } = await res.json() as { candles: OHLCVCandle[] };
            results.set(sembol, {
              change5d:  getPeriodReturn(candles, 5),
              change20d: getPeriodReturn(candles, 20),
              change60d: getPeriodReturn(candles, 60),
              lastPrice: getLastPrice(candles),
            });
          } catch {
            results.set(sembol, { change5d: null, change20d: null, change60d: null, lastPrice: null });
          } finally {
            completed++;
            if (completed % 5 === 0 || completed === unique.length) {
              setSectorDataMap((prev) => {
                const next = new Map(prev);
                next.forEach((data, id) => {
                  const updatedStocks = data.stocks.map((s) => {
                    const r = results.get(s.sembol);
                    return r ? { ...s, ...r } : s;
                  });
                  const loaded = updatedStocks.every((s) => results.has(s.sembol));

                  const avgByPeriod = { 5: null as number | null, 20: null as number | null, 60: null as number | null };
                  for (const p of [5, 20, 60] as PeriodDays[]) {
                    const vals = updatedStocks
                      .map((s) => (p === 5 ? s.change5d : p === 20 ? s.change20d : s.change60d))
                      .filter((v): v is number => v !== null);
                    avgByPeriod[p] = vals.length > 0
                      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100
                      : null;
                  }

                  next.set(id, { ...data, stocks: updatedStocks, avgByPeriod, loaded });
                });
                return next;
              });
            }
          }
        }),
      );
      setLoadingSectors(false);
      setLastUpdated(new Date());
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorDataMap.size]);

  // Filtreli + sıralı sektörler
  const sectors = useMemo(() => {
    const arr = Array.from(sectorDataMap.values());

    const withDir = arr.map((s) => {
      const avg = s.avgByPeriod[period];
      const dir: DirFilter =
        avg !== null && avg >= 2  ? 'yukari' :
        avg !== null && avg <= -2 ? 'asagi'  : 'nötr';
      return { ...s, _dir: dir };
    });

    const filtered = dirFilter === 'all'
      ? withDir
      : withDir.filter((s) => s._dir === dirFilter);

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'tr');
      return (b.avgByPeriod[period] ?? -999) - (a.avgByPeriod[period] ?? -999);
    });
  }, [sectorDataMap, period, dirFilter, sortBy]);

  // Tüm sektörler (özet bar için)
  const allSectors = useMemo(() => Array.from(sectorDataMap.values()), [sectorDataMap]);

  const bullCount = useMemo(
    () => allSectors.filter((s) => { const a = s.avgByPeriod[period]; return a !== null && a >= 2; }).length,
    [allSectors, period],
  );
  const bearCount = useMemo(
    () => allSectors.filter((s) => { const a = s.avgByPeriod[period]; return a !== null && a <= -2; }).length,
    [allSectors, period],
  );
  const neutCount = allSectors.length - bullCount - bearCount;
  const total     = allSectors.length || 1;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 max-w-7xl">

        {/* Başlık */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Sektör & Piyasa Analizi</h1>
            <p className="mt-1 text-sm text-text-secondary">
              BIST sektörlerinin momentum analizi · Emtia & döviz takibi
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </button>
        </div>

        {/* Emtia & Döviz Şeridi */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            Emtia & Döviz
          </h2>
          {loadingCommodity ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface/30" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {commodities.map((q) => <CommodityCard key={q.symbol} quote={q} />)}
            </div>
          )}
        </section>

        {/* Piyasa Özeti */}
        {!loadingSectors && allSectors.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-2.5 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-400 font-semibold">{bullCount} sektör yükselişte</span>
              </div>
              <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-400" />
                <span className="text-sm text-red-400 font-semibold">{bearCount} sektör düşüşte</span>
              </div>
              <div className="rounded-xl border border-border bg-surface/30 px-4 py-2.5 flex items-center gap-2">
                <Minus className="h-4 w-4 text-zinc-400" />
                <span className="text-sm text-zinc-400 font-semibold">{neutCount} sektör yatay</span>
              </div>
              {lastUpdated && (
                <div className="ml-auto flex items-center text-[11px] text-text-muted">
                  Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>

            {/* Dağılım Barı */}
            <div className="h-2.5 w-full rounded-full overflow-hidden flex">
              <div
                className="h-full bg-emerald-500/70 transition-all duration-700"
                style={{ width: `${(bullCount / total) * 100}%` }}
              />
              <div
                className="h-full bg-zinc-500/40 transition-all duration-700"
                style={{ width: `${(neutCount / total) * 100}%` }}
              />
              <div
                className="h-full bg-red-500/60 transition-all duration-700"
                style={{ width: `${(bearCount / total) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-text-muted px-0.5">
              <span className="text-emerald-400">{Math.round((bullCount / total) * 100)}% yükseliş</span>
              <span>{neutCount} yatay</span>
              <span className="text-red-400">{Math.round((bearCount / total) * 100)}% düşüş</span>
            </div>
          </div>
        )}

        {/* Sektör Grid */}
        <section>
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Sektör Performansı
            </h2>

            {/* Periyot seçici */}
            <div className="flex rounded-lg border border-border bg-surface/30 p-0.5 ml-auto">
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

            {/* Yön filtresi */}
            <div className="flex rounded-lg border border-border bg-surface/30 p-0.5">
              {(['all', 'yukari', 'asagi', 'nötr'] as DirFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDirFilter(f)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                    dirFilter === f
                      ? 'bg-surface text-text-primary'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {f === 'all' ? 'Tümü' : f === 'yukari' ? '↑ Yükselen' : f === 'asagi' ? '↓ Düşen' : '→ Yatay'}
                </button>
              ))}
            </div>

            {/* Sıralama */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-lg border border-border bg-surface/30 px-2 py-1.5 text-xs text-text-secondary focus:outline-none cursor-pointer"
            >
              <option value="perf">Performansa göre</option>
              <option value="name">İsme göre</option>
            </select>
          </div>

          {sectorDataMap.size === 0 ? (
            <div className="flex justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sectors.map((s, i) => (
                <SectorCard key={s.id} data={s} index={i} period={period} />
              ))}
              {sectors.length === 0 && (
                <div className="col-span-full py-16 text-center text-text-muted text-sm">
                  Bu filtreye uyan sektör bulunamadı.
                </div>
              )}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
