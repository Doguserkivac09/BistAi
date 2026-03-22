'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, RefreshCw, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTORS, SECTOR_REPRESENTATIVES, getSectorId } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';
import type { CommodityQuote } from '@/lib/commodity';
import type { OHLCVCandle } from '@/types';

// ─── Yardımcı ────────────────────────────────────────────────────────────────

interface StockMomentum {
  sembol: string;
  change20d: number | null;
  lastPrice: number | null;
}

interface SectorData {
  id: SectorId;
  name: string;
  shortName: string;
  avg20d: number | null;
  direction: 'yukari' | 'asagi' | 'nötr';
  stocks: StockMomentum[];
  loaded: boolean;
}

function tradingDays(candles: OHLCVCandle[]) {
  return candles.filter((c) => (c.volume ?? 0) > 0);
}

function get20dReturn(candles: OHLCVCandle[]): number | null {
  const td = tradingDays(candles);
  if (td.length < 5) return null;
  const last = td[td.length - 1]!.close;
  const base = td[Math.max(0, td.length - 20)]!.close;
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

function formatPrice(v: number | null, unit = ''): string {
  if (v === null) return '—';
  if (v >= 1000) return `${unit}${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
  if (v >= 10)   return `${unit}${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${unit}${v.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

// ─── Emtia Kartı ─────────────────────────────────────────────────────────────

function CommodityCard({ quote }: { quote: CommodityQuote }) {
  const isUp   = (quote.change1d ?? 0) >= 0;
  const isDown = (quote.change1d ?? 0) < 0;
  const color  = isUp ? 'text-emerald-400' : 'text-red-400';
  const bg     = isUp ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5';

  const priceStr = quote.lastPrice !== null
    ? `${quote.unit ? quote.unit + ' ' : ''}${formatPrice(quote.lastPrice)}`
    : '—';

  return (
    <div className={cn('rounded-xl border p-3 transition-colors', quote.lastPrice ? bg : 'border-border bg-surface/30')}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-text-secondary">{quote.label}</span>
        {quote.change1d !== null && (
          <span className={cn('text-[11px] font-bold', color)}>
            {formatPct(quote.change1d)}
          </span>
        )}
      </div>
      <div className="text-base font-bold text-text-primary tabular-nums">
        {priceStr}
      </div>
      {quote.change20d !== null && (
        <div className="mt-1 text-[10px] text-text-muted">
          20g: <span className={quote.change20d >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatPct(quote.change20d)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Sektör Kartı ─────────────────────────────────────────────────────────────

function SectorCard({ data, index }: { data: SectorData; index: number }) {
  const sorted = [...data.stocks]
    .filter((s) => s.change20d !== null)
    .sort((a, b) => (b.change20d ?? 0) - (a.change20d ?? 0));

  const best  = sorted[0] ?? null;
  const worst = sorted[sorted.length - 1] ?? null;

  const dirColor =
    data.direction === 'yukari' ? 'text-emerald-400' :
    data.direction === 'asagi'  ? 'text-red-400' : 'text-zinc-400';

  const borderColor =
    data.direction === 'yukari' ? 'border-emerald-500/25' :
    data.direction === 'asagi'  ? 'border-red-500/25' : 'border-border';

  const bgGlow =
    data.direction === 'yukari' ? 'bg-emerald-500/5' :
    data.direction === 'asagi'  ? 'bg-red-500/5' : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn('rounded-xl border p-4', borderColor, bgGlow)}
    >
      {/* Başlık */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary">{data.name}</h3>
          <p className="text-[11px] text-text-muted mt-0.5">{data.stocks.length} hisse takip edildi</p>
        </div>
        <div className="text-right shrink-0">
          {data.avg20d !== null ? (
            <>
              <div className={cn('text-lg font-bold tabular-nums', dirColor)}>
                {formatPct(data.avg20d)}
              </div>
              <div className="text-[10px] text-text-muted">20 günlük ort.</div>
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
      {data.avg20d !== null && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            {data.direction === 'yukari' ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            ) : data.direction === 'asagi' ? (
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            ) : (
              <Minus className="h-3.5 w-3.5 text-zinc-400" />
            )}
            <span className={cn('text-[11px] font-semibold', dirColor)}>
              {data.direction === 'yukari' ? 'Yükseliş Trendi' :
               data.direction === 'asagi'  ? 'Düşüş Trendi' : 'Yatay Seyir'}
            </span>
          </div>
          {/* Mini momentum bar */}
          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className={cn('h-full rounded-full', data.direction === 'yukari' ? 'bg-emerald-500/60' : data.direction === 'asagi' ? 'bg-red-500/60' : 'bg-zinc-500/40')}
              style={{ width: `${Math.min(100, Math.abs(data.avg20d ?? 0) * 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* En iyi / en kötü */}
      {data.loaded && sorted.length > 0 && (
        <div className="space-y-1">
          {best && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-muted">En iyi:</span>
              <span className="flex items-center gap-1.5">
                <a href={`/hisse/${best.sembol}`} className="font-mono font-semibold text-text-primary hover:text-primary transition-colors">{best.sembol}</a>
                <span className="text-emerald-400 font-semibold">{formatPct(best.change20d)}</span>
              </span>
            </div>
          )}
          {worst && worst.sembol !== best?.sembol && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-muted">En kötü:</span>
              <span className="flex items-center gap-1.5">
                <a href={`/hisse/${worst.sembol}`} className="font-mono font-semibold text-text-primary hover:text-primary transition-colors">{worst.sembol}</a>
                <span className="text-red-400 font-semibold">{formatPct(worst.change20d)}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Hisse linkleri */}
      {data.loaded && (
        <div className="mt-3 flex flex-wrap gap-1">
          {sorted.map((s) => (
            <a
              key={s.sembol}
              href={`/hisse/${s.sembol}`}
              title={`${s.sembol}: ${formatPct(s.change20d)}`}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold transition-colors',
                (s.change20d ?? 0) >= 2  ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' :
                (s.change20d ?? 0) <= -2 ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' :
                'bg-white/5 text-text-secondary hover:bg-white/10'
              )}
            >
              {s.sembol}
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

export function SektorlerClient() {
  const [commodities, setCommodities] = useState<CommodityQuote[]>([]);
  const [sectorDataMap, setSectorDataMap] = useState<Map<SectorId, SectorData>>(new Map());
  const [loadingCommodity, setLoadingCommodity] = useState(true);
  const [loadingSectors, setLoadingSectors] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Sektörlerin başlangıç haritasını oluştur
  useEffect(() => {
    const initial = new Map<SectorId, SectorData>();
    for (const [id, info] of Object.entries(SECTORS) as Array<[SectorId, typeof SECTORS[SectorId]]>) {
      const reps = SECTOR_REPRESENTATIVES[id];
      if (!reps || reps.length === 0) continue;
      initial.set(id, {
        id,
        name: info.name,
        shortName: info.shortName,
        avg20d: null,
        direction: 'nötr',
        stocks: reps.map((s) => ({ sembol: s, change20d: null, lastPrice: null })),
        loaded: false,
      });
    }
    setSectorDataMap(initial);
  }, []);

  // Emtia verisini çek
  useEffect(() => {
    setLoadingCommodity(true);
    fetch('/api/commodity')
      .then((r) => r.json())
      .then((data: CommodityQuote[]) => setCommodities(data))
      .catch(() => {})
      .finally(() => setLoadingCommodity(false));
  }, []);

  // Sektör verilerini batch olarak çek
  useEffect(() => {
    if (sectorDataMap.size === 0) return;

    setLoadingSectors(true);
    const allSymbols = Array.from(sectorDataMap.values()).flatMap((d) => d.stocks.map((s) => s.sembol));
    const unique = [...new Set(allSymbols)];

    let completed = 0;
    const results = new Map<string, { change20d: number | null; lastPrice: number | null }>();

    const fetchBatch = async (symbols: string[]) => {
      await Promise.allSettled(
        symbols.map(async (sembol) => {
          try {
            const res = await fetch(`/api/ohlcv?symbol=${sembol}&days=30`);
            const { candles = [] } = await res.json() as { candles: OHLCVCandle[] };
            results.set(sembol, { change20d: get20dReturn(candles), lastPrice: getLastPrice(candles) });
          } catch {
            results.set(sembol, { change20d: null, lastPrice: null });
          } finally {
            completed++;
            // Her 5 hissede bir UI güncelle
            if (completed % 5 === 0 || completed === unique.length) {
              setSectorDataMap((prev) => {
                const next = new Map(prev);
                next.forEach((data, id) => {
                  const updatedStocks = data.stocks.map((s) => {
                    const r = results.get(s.sembol);
                    return r ? { ...s, ...r } : s;
                  });
                  const loaded = updatedStocks.every((s) => results.has(s.sembol));
                  const validReturns = updatedStocks.map((s) => s.change20d).filter((v): v is number => v !== null);
                  const avg20d = validReturns.length > 0
                    ? Math.round(validReturns.reduce((a, b) => a + b, 0) / validReturns.length * 100) / 100
                    : null;
                  const direction: SectorData['direction'] =
                    avg20d !== null && avg20d >= 2  ? 'yukari' :
                    avg20d !== null && avg20d <= -2 ? 'asagi'  : 'nötr';
                  next.set(id, { ...data, stocks: updatedStocks, avg20d, direction, loaded });
                });
                return next;
              });
            }
          }
        })
      );
      setLoadingSectors(false);
      setLastUpdated(new Date());
    };

    fetchBatch(unique);
  }, [sectorDataMap.size]);

  const sectors = Array.from(sectorDataMap.values()).sort((a, b) => (b.avg20d ?? -999) - (a.avg20d ?? -999));
  const bullCount  = sectors.filter((s) => s.direction === 'yukari').length;
  const bearCount  = sectors.filter((s) => s.direction === 'asagi').length;

  function handleRefresh() {
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 max-w-7xl">

        {/* Başlık */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Sektör & Piyasa Analizi</h1>
            <p className="mt-1 text-sm text-text-secondary">
              BIST sektörlerinin 20 günlük momentum analizi · Emtia & döviz takibi
            </p>
          </div>
          <button
            onClick={handleRefresh}
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
        {!loadingSectors && sectors.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-3">
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
              <span className="text-sm text-zinc-400 font-semibold">{sectors.length - bullCount - bearCount} sektör yatay</span>
            </div>
            {lastUpdated && (
              <div className="ml-auto flex items-center text-[11px] text-text-muted">
                Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        )}

        {/* Sektör Grid */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            Sektör Performansı — 20 Günlük Ortalama Getiri
          </h2>

          {sectorDataMap.size === 0 ? (
            <div className="flex justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sectors.map((s, i) => <SectorCard key={s.id} data={s} index={i} />)}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
