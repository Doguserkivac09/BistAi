'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, BarChart2, ExternalLink,
  ChevronsUp, ChevronsDown, Compass, Clock, AlertTriangle, Network, Activity, PieChart as PieChartIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SECTORS, SECTOR_REPRESENTATIVES } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';
import type { CommodityQuote } from '@/lib/commodity';
import type { OHLCVCandle } from '@/types';

// ─── Türler ───────────────────────────────────────────────────────────────────

type PeriodDays = 5 | 20 | 60;
type DirFilter  = 'all' | 'yukari' | 'asagi';
type SortBy     = 'perf' | 'name';

interface StockMomentum {
  sembol:    string;
  change5d:  number | null;
  change20d: number | null;
  change60d: number | null;
  lastPrice: number | null;
}

interface SectorData {
  id:             SectorId;
  name:           string;
  shortName:      string;
  avgByPeriod:    { 5: number | null; 20: number | null; 60: number | null };
  stocks:         StockMomentum[];
  loaded:         boolean;
  macroAlignment: number | null;   // -100..+100, /api/sectors'tan
  compositeScore: number | null;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function tradingDays(candles: OHLCVCandle[]) {
  return candles.filter((c) => (c.volume ?? 0) > 0);
}

/**
 * `days` işlem günü öncesinin getirisi (%).
 * Yeterli veri yoksa null döner — `Math.max(0, ...)` ile başa düşmek
 * yanıltıcı değer üretiyordu (B1 fix).
 */
function getPeriodReturn(candles: OHLCVCandle[], days: number): number | null {
  const td = tradingDays(candles);
  if (td.length < days + 1) return null; // YETERLİ veri yoksa null
  const last = td[td.length - 1]!.close;
  const base = td[td.length - 1 - days]!.close;
  if (base === 0) return null;
  return Math.round(((last - base) / base) * 10000) / 100;
}

/**
 * Periyoda göre yön eşiği (B4 fix).
 * 5 günde %2 ≠ 60 günde %2 — eşik dönem uzunluğuyla orantılı olmalı.
 */
function dirThreshold(period: PeriodDays): number {
  return period === 5 ? 1 : period === 20 ? 2.5 : 5;
}

function classifyDirection(avg: number | null, period: PeriodDays): 'yukari' | 'asagi' | 'nötr' {
  if (avg === null) return 'nötr';
  const t = dirThreshold(period);
  return avg >= t ? 'yukari' : avg <= -t ? 'asagi' : 'nötr';
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
  const direction = classifyDirection(avg, period);

  const getChg = (s: StockMomentum) =>
    period === 5 ? s.change5d : period === 20 ? s.change20d : s.change60d;

  const sorted = [...data.stocks]
    .filter((s) => getChg(s) !== null)
    .sort((a, b) => (getChg(b) ?? 0) - (getChg(a) ?? 0));

  const best  = sorted[0] ?? null;
  const worst = sorted[sorted.length - 1] ?? null;

  // Rotasyon: 5g vs 20g kıyasla (ivme kazanıyor/kaybediyor)
  const avg5  = data.avgByPeriod[5];
  const avg20 = data.avgByPeriod[20];
  const rotasyon: 'ivme-kazaniyor' | 'ivme-kaybediyor' | null =
    avg5 !== null && avg20 !== null
      ? avg5 > avg20 + 1 ? 'ivme-kazaniyor'
      : avg5 < avg20 - 1 ? 'ivme-kaybediyor'
      : null
    : null;

  // Makro uyum
  const macroAl = data.macroAlignment;
  const macroLabel =
    macroAl === null ? null :
    macroAl >= 30  ? { text: 'Makro uyumlu', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' } :
    macroAl <= -30 ? { text: 'Makro olumsuz', cls: 'text-red-400 bg-red-500/10 border-red-500/25' } :
    { text: 'Makro nötr', cls: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/25' };

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
      <div className="flex items-start justify-between gap-2 mb-2">
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

      {/* Badge satırı: yön + rotasyon + makro */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {avg !== null && (
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            direction === 'yukari' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
            direction === 'asagi'  ? 'border-red-500/30 bg-red-500/10 text-red-400' :
            'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
          )}>
            {direction === 'yukari' ? <TrendingUp className="h-2.5 w-2.5" /> :
             direction === 'asagi'  ? <TrendingDown className="h-2.5 w-2.5" /> :
             <Minus className="h-2.5 w-2.5" />}
            {direction === 'yukari' ? 'Yükseliş' : direction === 'asagi' ? 'Düşüş' : 'Yatay'}
          </span>
        )}
        {rotasyon && (
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            rotasyon === 'ivme-kazaniyor'
              ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
              : 'border-orange-500/30 bg-orange-500/10 text-orange-400'
          )}>
            {rotasyon === 'ivme-kazaniyor'
              ? <><ChevronsUp className="h-2.5 w-2.5" />İvme Kazanıyor</>
              : <><ChevronsDown className="h-2.5 w-2.5" />İvme Kaybediyor</>}
          </span>
        )}
        {macroLabel && (
          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', macroLabel.cls)}>
            {macroLabel.text}
          </span>
        )}
      </div>

      {/* Skor barı */}
      {avg !== null && (
        <div className="mb-3 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
          <div
            className={cn('h-full rounded-full',
              direction === 'yukari' ? 'bg-emerald-500/60' :
              direction === 'asagi'  ? 'bg-red-500/60' : 'bg-zinc-500/40',
            )}
            style={{ width: `${Math.min(100, Math.abs(avg) * 5)}%` }}
          />
        </div>
      )}

      {/* En iyi / en kötü */}
      {data.loaded && sorted.length > 0 && (
        <div className="space-y-1 mb-3">
          {best && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-muted">En iyi:</span>
              <span className="flex items-center gap-1.5">
                <a href={`/hisse/${best.sembol}`} className="font-mono font-semibold text-text-primary hover:text-primary transition-colors">
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
                <a href={`/hisse/${worst.sembol}`} className="font-mono font-semibold text-text-primary hover:text-primary transition-colors">
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

      {/* Alt linkler */}
      <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-3">
        <Link
          href={`/tarama?sektor=${data.id}`}
          className="flex items-center gap-1 text-[11px] text-text-muted hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Sinyal Taraması
        </Link>
        <Link
          href="/ters-portfolyo"
          className="flex items-center gap-1 text-[11px] text-text-muted hover:text-primary transition-colors ml-auto"
        >
          <Compass className="h-3 w-3" />
          Fırsatlar
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Sprint 2: Korelasyon + Rotasyon Timeline + Sektör Ağırlığı ───────

/**
 * Bir sembol için günlük getiri serisi: returns[i] = (close[i]-close[i-1])/close[i-1]
 * Pearson korelasyon hesabı için.
 */
function dailyReturns(candles: OHLCVCandle[]): number[] {
  const td = candles.filter((c) => (c.volume ?? 0) > 0);
  const out: number[] = [];
  for (let i = 1; i < td.length; i++) {
    const prev = td[i - 1]!.close;
    const cur  = td[i]!.close;
    if (prev > 0) out.push((cur - prev) / prev);
  }
  return out;
}

/** Pearson korelasyon — iki seri eşit uzunluğa truncate edilir */
function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 10) return null; // istatistiksel olarak güvenilmez
  const xs = x.slice(-n);
  const ys = y.slice(-n);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx  += a * a;
    dy  += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  if (denom === 0) return null;
  return num / denom;
}

/** Sektör için "sektör seri" — temsilcilerin günlük getirilerinin ortalaması */
function sectorReturnSeries(symbols: string[], candlesMap: Map<string, OHLCVCandle[]>): number[] {
  const series: number[][] = [];
  for (const s of symbols) {
    const c = candlesMap.get(s);
    if (!c || c.length < 5) continue;
    series.push(dailyReturns(c));
  }
  if (series.length === 0) return [];
  // Equal-weight ortalama (en kısa seriye truncate)
  const minLen = Math.min(...series.map((s) => s.length));
  const out: number[] = [];
  for (let i = 0; i < minLen; i++) {
    let sum = 0;
    for (const s of series) sum += s[s.length - minLen + i]!;
    out.push(sum / series.length);
  }
  return out;
}

/** Haftalık ortalama getiri serisi — son N hafta için sektör momentum */
function weeklyAvgReturns(symbols: string[], candlesMap: Map<string, OHLCVCandle[]>, weeks: number): Array<number | null> {
  const ret = sectorReturnSeries(symbols, candlesMap);
  if (ret.length < 5) return [];
  const out: Array<number | null> = [];
  // Son `weeks` hafta = son `weeks*5` gün, 5'lik gruplar
  for (let w = weeks - 1; w >= 0; w--) {
    const end = ret.length - w * 5;
    const start = Math.max(0, end - 5);
    const slice = ret.slice(start, end);
    if (slice.length === 0) { out.push(null); continue; }
    // Haftalık birikimli getiri (yaklaşık)
    const cumPct = slice.reduce((acc, r) => acc + r * 100, 0);
    out.push(cumPct);
  }
  return out;
}

// ── Korelasyon Matrix Heatmap ─────────────────────────────────────────

function CorrelationHeatmap({
  sectors,
  candlesMap,
}: {
  sectors: SectorData[];
  candlesMap: Map<string, OHLCVCandle[]>;
}) {
  const matrix = useMemo(() => {
    // Her sektör için sektör seri
    const series = new Map<SectorId, number[]>();
    for (const s of sectors) {
      const symbols = s.stocks.map((x) => x.sembol);
      series.set(s.id, sectorReturnSeries(symbols, candlesMap));
    }
    // 2D matrix
    const ids = sectors.map((s) => s.id);
    const m: Array<Array<number | null>> = ids.map(() => ids.map(() => null));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i; j < ids.length; j++) {
        const a = series.get(ids[i]!)!;
        const b = series.get(ids[j]!)!;
        const r = i === j ? 1 : pearson(a, b);
        m[i]![j] = r;
        m[j]![i] = r;
      }
    }
    return { ids, m };
  }, [sectors, candlesMap]);

  function corrColor(r: number | null): string {
    if (r === null) return 'bg-zinc-700/30';
    if (r >=  0.75) return 'bg-emerald-500/80';
    if (r >=  0.5)  return 'bg-emerald-500/55';
    if (r >=  0.25) return 'bg-emerald-500/30';
    if (r >  -0.25) return 'bg-zinc-500/20';
    if (r >  -0.5)  return 'bg-red-500/30';
    if (r >  -0.75) return 'bg-red-500/55';
    return 'bg-red-500/80';
  }

  function corrText(r: number | null): string {
    if (r === null) return 'text-text-muted';
    if (Math.abs(r) > 0.5) return 'text-white font-bold';
    return 'text-text-secondary';
  }

  if (matrix.ids.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-0.5 min-w-[640px]"
        style={{
          gridTemplateColumns: `100px repeat(${matrix.ids.length}, minmax(40px, 1fr))`,
        }}
      >
        {/* Boş köşe */}
        <div />
        {/* Üst başlık */}
        {matrix.ids.map((id) => (
          <div
            key={`h-${id}`}
            className="text-[9px] font-semibold text-text-muted uppercase tracking-wider text-center px-1 py-2 truncate"
            title={SECTORS[id].name}
          >
            {SECTORS[id].shortName.slice(0, 6)}
          </div>
        ))}

        {/* Satırlar */}
        {matrix.ids.map((rowId, i) => (
          <div key={`row-${rowId}`} className="contents">
            <div
              className="text-[10px] font-semibold text-text-secondary px-2 py-2 truncate flex items-center"
              title={SECTORS[rowId].name}
            >
              {SECTORS[rowId].shortName}
            </div>
            {matrix.ids.map((colId, j) => {
              const r = matrix.m[i]![j];
              return (
                <div
                  key={`${rowId}-${colId}`}
                  className={cn(
                    'aspect-square flex items-center justify-center rounded text-[9px] font-mono tabular-nums',
                    corrColor(r),
                    corrText(r),
                  )}
                  title={`${SECTORS[rowId].shortName} × ${SECTORS[colId].shortName}: ${r === null ? 'yetersiz veri' : r.toFixed(2)}`}
                >
                  {r === null ? '—' : r.toFixed(2)}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-text-muted">
        <span>Negatif</span>
        <div className="flex gap-px">
          <div className="w-5 h-3 bg-red-500/80" />
          <div className="w-5 h-3 bg-red-500/55" />
          <div className="w-5 h-3 bg-red-500/30" />
          <div className="w-5 h-3 bg-zinc-500/20" />
          <div className="w-5 h-3 bg-emerald-500/30" />
          <div className="w-5 h-3 bg-emerald-500/55" />
          <div className="w-5 h-3 bg-emerald-500/80" />
        </div>
        <span>Pozitif</span>
      </div>
    </div>
  );
}

// ── Rotasyon Timeline (multi-line chart) ──────────────────────────────

function RotationTimeline({
  sectors,
  candlesMap,
  topN = 5,
  weeks = 12,
}: {
  sectors: SectorData[];
  candlesMap: Map<string, OHLCVCandle[]>;
  topN?: number;
  weeks?: number;
}) {
  const lines = useMemo(() => {
    const all = sectors.map((s) => {
      const symbols = s.stocks.map((x) => x.sembol);
      const series = weeklyAvgReturns(symbols, candlesMap, weeks);
      const last = series[series.length - 1] ?? null;
      return { id: s.id, name: SECTORS[s.id].shortName, series, last };
    }).filter((s) => s.series.length === weeks);

    // En son haftadaki performansa göre sırala — hem en iyi hem en kötü gösterilir
    const sorted = [...all].sort((a, b) => (b.last ?? -999) - (a.last ?? -999));
    const top    = sorted.slice(0, topN);
    const bottom = sorted.slice(-Math.min(2, sorted.length));
    // Tekrarsız birleşim
    const ids = new Set<string>();
    const merged: typeof sorted = [];
    for (const s of [...top, ...bottom]) {
      if (!ids.has(s.id)) { ids.add(s.id); merged.push(s); }
    }
    return merged;
  }, [sectors, candlesMap, topN, weeks]);

  if (lines.length === 0) return null;

  const flat = lines.flatMap((l) => l.series.filter((v): v is number => v !== null));
  const minY = Math.min(...flat, 0);
  const maxY = Math.max(...flat, 0);
  const range = (maxY - minY) || 1;
  const W = 600, H = 220, padL = 36, padR = 16, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // 8 renk paleti — Tailwind palette'inden
  const COLORS = [
    '#10b981', // emerald-500
    '#3b82f6', // blue-500
    '#f59e0b', // amber-500
    '#a855f7', // purple-500
    '#ec4899', // pink-500
    '#06b6d4', // cyan-500
    '#ef4444', // red-500
    '#84cc16', // lime-500
  ];

  function pathFor(series: Array<number | null>): string {
    return series.map((v, i) => {
      if (v === null) return null;
      const x = padL + (i / (weeks - 1)) * innerW;
      const y = padT + innerH - ((v - minY) / range) * innerH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).filter(Boolean).join(' ');
  }

  // Y eksen tickleri (3 nokta)
  const yTicks = [minY, (minY + maxY) / 2, maxY];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {yTicks.map((t, i) => {
          const y = padT + innerH - ((t - minY) / range) * innerH;
          return (
            <g key={`grid-${i}`}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#ffffff10" strokeWidth="1" strokeDasharray="2 3" />
              <text x={padL - 6} y={y + 3} fill="#9ca3af" fontSize="9" textAnchor="end" fontFamily="ui-monospace, monospace">
                {t > 0 ? '+' : ''}{t.toFixed(1)}%
              </text>
            </g>
          );
        })}
        {/* Sıfır çizgisi */}
        {minY < 0 && maxY > 0 && (
          <line
            x1={padL}
            x2={W - padR}
            y1={padT + innerH - ((0 - minY) / range) * innerH}
            y2={padT + innerH - ((0 - minY) / range) * innerH}
            stroke="#ffffff20"
            strokeWidth="1"
          />
        )}
        {/* Hafta tickleri */}
        {[0, Math.floor(weeks / 2), weeks - 1].map((wIdx) => {
          const x = padL + (wIdx / (weeks - 1)) * innerW;
          const label = wIdx === weeks - 1 ? 'Bu hafta' : `${weeks - 1 - wIdx}h önce`;
          return (
            <text key={`wt-${wIdx}`} x={x} y={H - 8} fill="#9ca3af" fontSize="9" textAnchor="middle">
              {label}
            </text>
          );
        })}
        {/* Sektör çizgileri */}
        {lines.map((l, idx) => (
          <path
            key={l.id}
            d={pathFor(l.series)}
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth="1.8"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 px-1">
        {lines.map((l, idx) => (
          <div key={l.id} className="flex items-center gap-1.5 text-[10px]">
            <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
            <span className="text-text-secondary">{l.name}</span>
            {l.last !== null && (
              <span className={cn('font-mono tabular-nums font-semibold',
                l.last >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {l.last > 0 ? '+' : ''}{l.last.toFixed(1)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sektör Ağırlığı Bar (BIST market cap proxy) ───────────────────────

function SectorWeightsPanel({
  sectors,
  weights,
  period,
}: {
  sectors: SectorData[];
  weights: Map<SectorId, number>;
  period: PeriodDays;
}) {
  const items = useMemo(() => {
    const total = Array.from(weights.values()).reduce((s, v) => s + v, 0);
    if (total === 0) return [];
    return sectors
      .map((s) => {
        const w = weights.get(s.id) ?? 0;
        const perf = s.avgByPeriod[period];
        return {
          id:    s.id,
          name:  SECTORS[s.id].shortName,
          weight: w / total,
          perf,
          contribution: perf !== null ? (w / total) * perf : null, // ağırlıklı katkı
        };
      })
      .filter((s) => s.weight > 0)
      .sort((a, b) => b.weight - a.weight);
  }, [sectors, weights, period]);

  if (items.length === 0) return null;

  const maxAbsContrib = Math.max(...items.map((s) => Math.abs(s.contribution ?? 0)), 0.1);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Sol: Ağırlık dağılımı */}
      <div className="rounded-xl border border-border bg-surface/40 p-4">
        <p className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
          <PieChartIcon className="h-3.5 w-3.5" />
          Toplam Piyasa Değeri Ağırlığı
        </p>
        <div className="space-y-1.5">
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[11px] text-text-secondary truncate">{s.name}</span>
              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all duration-700"
                  style={{ width: `${s.weight * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[10px] font-mono text-text-muted tabular-nums">
                %{(s.weight * 100).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-text-muted/70">
          Temsilci hisselerin Yahoo market cap toplamı — endeks ağırlığı yaklaşık değeri
        </p>
      </div>

      {/* Sağ: Endekse Katkı (ağırlık × performans) */}
      <div className="rounded-xl border border-border bg-surface/40 p-4">
        <p className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          Endekse Tahmini Katkı ({period === 5 ? '1H' : period === 20 ? '1A' : '3A'})
        </p>
        <div className="space-y-1.5">
          {items
            .filter((s) => s.contribution !== null)
            .sort((a, b) => Math.abs(b.contribution!) - Math.abs(a.contribution!))
            .map((s) => {
              const c = s.contribution!;
              const pct = (Math.abs(c) / maxAbsContrib) * 100;
              const isPos = c >= 0;
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className="w-16 shrink-0 text-[10px] text-text-muted truncate">{s.name}</span>
                  <div className="flex-1 relative h-1.5 rounded-full bg-white/5">
                    <div
                      className={cn(
                        'absolute top-0 h-full rounded-full transition-all duration-700',
                        isPos ? 'left-1/2 bg-emerald-500/60' : 'right-1/2 bg-red-500/60',
                      )}
                      style={{ width: `${pct / 2}%` }}
                    />
                    <div className="absolute top-1/2 left-1/2 w-px h-2 -translate-y-1/2 bg-white/15" />
                  </div>
                  <span className={cn(
                    'w-12 shrink-0 text-right text-[10px] font-mono tabular-nums font-semibold',
                    isPos ? 'text-emerald-400' : 'text-red-400',
                  )}>
                    {isPos ? '+' : ''}{c.toFixed(2)}%
                  </span>
                </div>
              );
            })}
        </div>
        <p className="mt-3 text-[10px] text-text-muted/70">
          Ağırlık × performans = endekse tahmini sürükleme. Büyük sektör küçük hareket = büyük etki.
        </p>
      </div>
    </div>
  );
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

const PERIODS: { label: string; value: PeriodDays }[] = [
  { label: '1H', value: 5 },
  { label: '1A', value: 20 },
  { label: '3A', value: 60 },
];

const PERIOD_STORAGE_KEY = 'bistai.sektorler.period';
// 60 işlem günü için en az ~90 takvim günü gerek; 120 güvenli (B1 fix).
const OHLCV_DAYS = 120;

export function SektorlerClient() {
  const [commodities,   setCommodities]   = useState<CommodityQuote[]>([]);
  const [sectorDataMap, setSectorDataMap] = useState<Map<SectorId, SectorData>>(new Map());
  // Candles cache — korelasyon ve rotasyon timeline için (Sprint 2)
  const [candlesBySymbol, setCandlesBySymbol] = useState<Map<string, OHLCVCandle[]>>(new Map());
  // Sektör ağırlığı (market cap toplamı) — F3
  const [sectorWeights, setSectorWeights] = useState<Map<SectorId, number>>(new Map());
  const [loadingWeights, setLoadingWeights] = useState(false);
  const [loadingCommodity, setLoadingCommodity] = useState(true);
  const [loadingSectors,   setLoadingSectors]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<{ failed: number; total: number } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0); // soft refresh trigger

  // Filtre & sıralama (period localStorage persist — F13)
  const [period,    setPeriod]    = useState<PeriodDays>(20);
  const [dirFilter, setDirFilter] = useState<DirFilter>('all');
  const [sortBy,    setSortBy]    = useState<SortBy>('perf');

  // Period: mount'ta localStorage'dan oku, değişince yaz
  const didReadPeriodRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(PERIOD_STORAGE_KEY);
    if (saved === '5' || saved === '20' || saved === '60') {
      setPeriod(Number(saved) as PeriodDays);
    }
    didReadPeriodRef.current = true;
  }, []);
  useEffect(() => {
    if (!didReadPeriodRef.current || typeof window === 'undefined') return;
    window.localStorage.setItem(PERIOD_STORAGE_KEY, String(period));
  }, [period]);

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
        macroAlignment: null,
        compositeScore: null,
      });
    }
    setSectorDataMap(initial);
  }, []);

  // /api/sectors → macroAlignment + compositeScore merge (bir kez çalışır)
  useEffect(() => {
    fetch('/api/sectors')
      .then((r) => r.ok ? r.json() : null)
      .then((res: { sectors?: Array<{ sectorId?: string; macroAlignment?: number; compositeScore?: number }> } | null) => {
        const list = res?.sectors;
        if (!Array.isArray(list)) return;
        setSectorDataMap((prev) => {
          const next = new Map(prev);
          list.forEach((item) => {
            const sid = item.sectorId as SectorId | undefined;
            if (!sid) return;
            const existing = next.get(sid);
            if (existing) {
              next.set(sid, {
                ...existing,
                macroAlignment: item.macroAlignment ?? null,
                compositeScore: item.compositeScore ?? null,
              });
            }
          });
          return next;
        });
      })
      .catch(() => {});
  }, []); // mount'ta bir kez

  // Emtia verisi
  useEffect(() => {
    setLoadingCommodity(true);
    fetch('/api/commodity')
      .then((r) => r.json())
      .then((data: CommodityQuote[]) => setCommodities(data))
      .catch(() => {})
      .finally(() => setLoadingCommodity(false));
  }, []);

  // Sektör verisi — 120 takvim günü ≈ 80 işlem günü (60g getirisi için yeterli — B1 fix)
  useEffect(() => {
    if (sectorDataMap.size === 0) return;

    setLoadingSectors(true);
    setFetchError(null);
    const allSymbols = Array.from(sectorDataMap.values()).flatMap((d) => d.stocks.map((s) => s.sembol));
    const unique = [...new Set(allSymbols)];

    let completed = 0;
    let failedCount = 0;
    const results = new Map<string, {
      change5d: number | null; change20d: number | null; change60d: number | null; lastPrice: number | null;
    }>();
    const candlesAcc = new Map<string, OHLCVCandle[]>();

    void (async () => {
      await Promise.allSettled(
        unique.map(async (sembol) => {
          try {
            const res = await fetch(`/api/ohlcv?symbol=${sembol}&days=${OHLCV_DAYS}`);
            if (!res.ok) {
              failedCount++;
              results.set(sembol, { change5d: null, change20d: null, change60d: null, lastPrice: null });
              return;
            }
            const { candles = [] } = await res.json() as { candles: OHLCVCandle[] };
            results.set(sembol, {
              change5d:  getPeriodReturn(candles, 5),
              change20d: getPeriodReturn(candles, 20),
              change60d: getPeriodReturn(candles, 60),
              lastPrice: getLastPrice(candles),
            });
            candlesAcc.set(sembol, candles);
          } catch {
            failedCount++;
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
      setCandlesBySymbol(candlesAcc);
      setLoadingSectors(false);
      setLastUpdated(new Date());
      if (failedCount > 0) {
        setFetchError({ failed: failedCount, total: unique.length });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorDataMap.size, refreshTick]);

  // Sektör ağırlığı — yeni endpoint /api/sectors/weights (mount + refresh)
  useEffect(() => {
    setLoadingWeights(true);
    fetch('/api/sectors/weights')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { weights?: Record<string, number> } | null) => {
        if (!data?.weights) return;
        const map = new Map<SectorId, number>();
        for (const [k, v] of Object.entries(data.weights)) {
          map.set(k as SectorId, v);
        }
        setSectorWeights(map);
      })
      .catch(() => {})
      .finally(() => setLoadingWeights(false));
  }, [refreshTick]);

  // Soft refresh — full reload yerine state reset (B5 fix)
  const handleRefresh = useCallback(() => {
    setLoadingCommodity(true);
    setLoadingSectors(true);
    setLastUpdated(null);
    setFetchError(null);
    // Emtia + sektör API'lerini yeniden tetikle
    fetch('/api/commodity?_t=' + Date.now())
      .then((r) => r.json())
      .then((data: CommodityQuote[]) => setCommodities(data))
      .catch(() => {})
      .finally(() => setLoadingCommodity(false));
    setRefreshTick((t) => t + 1);
  }, []);

  // Filtreli + sıralı sektörler — dönem-aware eşik (B4)
  const sectors = useMemo(() => {
    const arr = Array.from(sectorDataMap.values());

    const filtered = dirFilter === 'all'
      ? arr
      : arr.filter((s) => classifyDirection(s.avgByPeriod[period], period) === dirFilter);

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'tr');
      return (b.avgByPeriod[period] ?? -999) - (a.avgByPeriod[period] ?? -999);
    });
  }, [sectorDataMap, period, dirFilter, sortBy]);

  // Tüm sektörler (özet bar için)
  const allSectors = useMemo(() => Array.from(sectorDataMap.values()), [sectorDataMap]);

  const bullCount = useMemo(
    () => allSectors.filter((s) => classifyDirection(s.avgByPeriod[period], period) === 'yukari').length,
    [allSectors, period],
  );
  const bearCount = useMemo(
    () => allSectors.filter((s) => classifyDirection(s.avgByPeriod[period], period) === 'asagi').length,
    [allSectors, period],
  );
  const neutCount = allSectors.length - bullCount - bearCount;
  const total     = allSectors.length || 1;

  // "Veri X dk önce" — saniye/dakika/saat
  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return null;
    const diffSec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diffSec < 30) return 'şimdi';
    if (diffSec < 60) return `${diffSec} sn önce`;
    const m = Math.floor(diffSec / 60);
    if (m < 60) return `${m} dk önce`;
    return `${Math.floor(m / 60)} sa önce`;
  }, [lastUpdated, refreshTick]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 max-w-7xl">

        {/* Başlık */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Sektör & Piyasa Analizi</h1>
            <p className="mt-1 text-sm text-text-secondary">
              BIST sektörlerinin momentum analizi · Emtia & döviz takibi
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loadingSectors}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loadingSectors && 'animate-spin')} />
            {loadingSectors ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>

        {/* Hata banner — bazı semboller çekilemediyse */}
        {fetchError && fetchError.failed > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{fetchError.failed}/{fetchError.total} sembol veri çekilemedi.</span>
              {' '}Yahoo Finance rate limit veya geçici bağlantı sorunu olabilir.
              {' '}<button onClick={handleRefresh} className="underline hover:text-amber-200">Yeniden dene</button>
            </div>
          </div>
        )}

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
              {lastUpdated && lastUpdatedText && (
                <div
                  className="ml-auto flex items-center gap-1 text-[11px] text-text-muted"
                  title={`Son güncelleme: ${lastUpdated.toLocaleString('tr-TR')}`}
                >
                  <Clock className="h-3 w-3" />
                  <span>Veri {lastUpdatedText}</span>
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

        {/* ── Sektör Rotasyon Paneli ────────────────────────────────── */}
        {!loadingSectors && allSectors.length > 0 && (() => {
          // rotasyonDelta = avg5g − avg20g: pozitif → kısa vade > orta vade (ivme kazanıyor)
          const withDelta = allSectors
            .map((s) => ({
              id:        s.id,
              name:      s.shortName,
              delta:     (s.avgByPeriod[5] !== null && s.avgByPeriod[20] !== null)
                           ? s.avgByPeriod[5]! - s.avgByPeriod[20]!
                           : null,
              perf5:     s.avgByPeriod[5],
              perf20:    s.avgByPeriod[20],
            }))
            .filter((s) => s.delta !== null)
            .sort((a, b) => b.delta! - a.delta!);

          const inflow  = withDelta.slice(0, 3);   // En yüksek delta (para giriyor)
          const outflow = withDelta.slice(-3).reverse(); // En düşük delta (para çıkıyor)
          const maxAbs  = Math.max(...withDelta.map((s) => Math.abs(s.delta!)), 0.01);

          if (withDelta.length < 4) return null;

          return (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Sektör Rotasyonu
                <span className="text-[10px] normal-case font-normal text-text-muted">
                  — Para akışı: kısa vade (1H) vs orta vade (1A) ivme farkı
                </span>
              </h2>

              <div className="grid gap-4 md:grid-cols-3">
                {/* Sol: Para Girişi */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-xs font-semibold text-emerald-400 mb-3 flex items-center gap-1.5">
                    <ChevronsUp className="h-3.5 w-3.5" />
                    Para Girişi — Ivme Kazananlar
                  </p>
                  <div className="space-y-2.5">
                    {inflow.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs font-medium text-text-primary truncate">{s.name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/70 transition-all duration-700"
                            style={{ width: `${(s.delta! / maxAbs) * 100}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] font-bold text-emerald-400 tabular-nums w-14 text-right">
                          +{s.delta!.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-emerald-400/50">
                    Kısa vade ivmesi orta vadeyi geçiyor — kurumsal ilgi artıyor olabilir
                  </p>
                </div>

                {/* Orta: Tüm Sektörler Sıralama Barı */}
                <div className="rounded-xl border border-border bg-surface/40 p-4">
                  <p className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                    <BarChart2 className="h-3.5 w-3.5" />
                    Tüm Sektörler — Ivme Farkı
                  </p>
                  <div className="space-y-1.5">
                    {withDelta.map((s) => {
                      const pct = (s.delta! / maxAbs) * 100;
                      const isPos = s.delta! >= 0;
                      return (
                        <div key={s.id} className="flex items-center gap-1.5">
                          <span className="w-16 shrink-0 text-[10px] text-text-muted truncate">{s.name}</span>
                          <div className="flex-1 relative h-1 rounded-full bg-white/5">
                            <div
                              className={cn(
                                'absolute top-0 h-full rounded-full transition-all duration-700',
                                isPos ? 'left-1/2 bg-emerald-500/60' : 'right-1/2 bg-red-500/60',
                              )}
                              style={{ width: `${Math.abs(pct) / 2}%` }}
                            />
                            <div className="absolute top-1/2 left-1/2 w-px h-2 -translate-y-1/2 bg-white/15" />
                          </div>
                          <span className={cn(
                            'shrink-0 text-[10px] tabular-nums w-10 text-right font-semibold',
                            isPos ? 'text-emerald-400' : 'text-red-400',
                          )}>
                            {isPos ? '+' : ''}{s.delta!.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sağ: Para Çıkışı */}
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-1.5">
                    <ChevronsDown className="h-3.5 w-3.5" />
                    Para Çıkışı — Ivme Kaybedenler
                  </p>
                  <div className="space-y-2.5">
                    {outflow.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs font-medium text-text-primary truncate">{s.name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-500/60 transition-all duration-700"
                            style={{ width: `${(Math.abs(s.delta!) / maxAbs) * 100}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] font-bold text-red-400 tabular-nums w-14 text-right">
                          {s.delta!.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-red-400/50">
                    Kısa vade zayıfladı — pozisyon azaltılıyor olabilir
                  </p>
                </div>
              </div>

              <p className="mt-2 text-[10px] text-text-muted/50 text-center">
                Ivme farkı = 1H ort. getiri − 1A ort. getiri. Pozitif = kısa vadede ivme kazanıyor. Yahoo Finance ~15dk gecikmeli.
              </p>
            </section>
          );
        })()}

        {/* ── Rotasyon Timeline (Sprint 2 - F2) ─────────────────────── */}
        {!loadingSectors && candlesBySymbol.size > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
              <Activity className="h-4 w-4" />
              12 Haftalık Sektör Rotasyon Timeline
              <span className="text-[10px] normal-case font-normal text-text-muted">
                — Hangi sektör ne zaman ön plandaydı, şimdi nerede?
              </span>
            </h2>
            <div className="rounded-xl border border-border bg-surface/40 p-4">
              <RotationTimeline
                sectors={allSectors}
                candlesMap={candlesBySymbol}
                topN={5}
                weeks={12}
              />
              <p className="mt-3 text-[10px] text-text-muted/70 text-center">
                Y ekseni: o haftaki ortalama % getiri. Üst-5 + alt-2 sektör gösterilir.
                Çapraz çizgiler = liderlik değişimi (rotasyon).
              </p>
            </div>
          </section>
        )}

        {/* ── Sektör Ağırlığı + Endeks Katkı (F3) ───────────────────── */}
        {!loadingWeights && sectorWeights.size > 0 && allSectors.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
              <PieChartIcon className="h-4 w-4" />
              Sektör Ağırlığı & Endekse Katkı
              <span className="text-[10px] normal-case font-normal text-text-muted">
                — Büyük sektör küçük hareket = büyük etki
              </span>
            </h2>
            <SectorWeightsPanel sectors={allSectors} weights={sectorWeights} period={period} />
          </section>
        )}

        {/* ── Korelasyon Heatmap (F1) ─────────────────────────────── */}
        {!loadingSectors && candlesBySymbol.size > 0 && allSectors.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
              <Network className="h-4 w-4" />
              Sektör Korelasyon Matrisi
              <span className="text-[10px] normal-case font-normal text-text-muted">
                — Birlikte hareket eden sektörler (60g günlük getiri Pearson)
              </span>
            </h2>
            <div className="rounded-xl border border-border bg-surface/40 p-4">
              <CorrelationHeatmap sectors={allSectors} candlesMap={candlesBySymbol} />
              <p className="mt-3 text-[10px] text-text-muted/70 text-center">
                +1 = mükemmel paralel hareket · 0 = bağımsız · −1 = ters hareket.
                Yüksek korelasyonlu sektörler portföyde aynı anda tutulursa çeşitlendirme zayıflar.
              </p>
            </div>
          </section>
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
              {(['all', 'yukari', 'asagi'] as DirFilter[]).map((f) => (
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
                  {f === 'all' ? 'Tümü' : f === 'yukari' ? '↑ Yükselen' : '↓ Düşen'}
                </button>
              ))}
            </div>
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
