'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, BarChart2, ExternalLink,
  ChevronsUp, ChevronsDown, Compass, Clock, AlertTriangle, Sparkles, Bot,
  Lock, Crown, Briefcase, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SECTORS, SECTOR_REPRESENTATIVES, getSectorId } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';
import type { CommodityQuote } from '@/lib/commodity';
import type { OHLCVCandle } from '@/types';
import { createClient as createSupabaseClient } from '@/lib/supabase';

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
  reversal,
}: {
  data: SectorData;
  index: number;
  period: PeriodDays;
  reversal?: 'up' | 'down' | null;
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
        {reversal === 'up' && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300"
            title="3 ay düşüşten sonra son hafta toparlanma — dipten dönüş sinyali"
          >
            🔁 Dipten Dönüş
          </span>
        )}
        {reversal === 'down' && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
            title="3 ay yükselişten sonra son hafta zayıflama — tepe dönüşü uyarısı"
          >
            ⚠️ Tepe Dönüşü
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

// ─── Sprint 2: Kullanıcı odaklı özetler ──────────────────────────────
// Yatırımcı diline çevirilmiş cevap kartları:
//  1. Bugünün Lideri — tek mesaj, büyük rozet
//  2. Hızlı Aksiyon 3 kart — Lider / Trend Dönüşü / Aşırı Düşen
//  3. Para Akışı Hikayesi — sektör-sektör rotasyon eşleştirmesi
//  4. Dönüş Sinyali — sektör kartlarında rozet

interface SectorSummary {
  id: SectorId;
  name: string;
  shortName: string;
  perf5: number | null;
  perf20: number | null;
  perf60: number | null;
  delta5v20: number | null; // ivme farkı (1H − 1A)
  reversal: 'up' | 'down' | null; // 60g zıt yön + 5g aksini gösterirse dönüş
}

function summarizeSectors(sectors: SectorData[]): SectorSummary[] {
  return sectors.map((s) => {
    const p5  = s.avgByPeriod[5];
    const p20 = s.avgByPeriod[20];
    const p60 = s.avgByPeriod[60];
    const delta = (p5 !== null && p20 !== null) ? p5 - p20 : null;

    // Dönüş sinyali: 60g güçlü düşüş ama 5g toparlanma → dipten dönüş
    //              60g güçlü çıkış ama 5g zayıflama → tepe dönüşü
    let reversal: 'up' | 'down' | null = null;
    if (p5 !== null && p60 !== null) {
      if (p60 <= -5 && p5 >= 1)  reversal = 'up';   // dipten toparlanma
      if (p60 >= 5  && p5 <= -1) reversal = 'down'; // tepe dönüşü
    }

    return {
      id: s.id,
      name: SECTORS[s.id].name,
      shortName: SECTORS[s.id].shortName,
      perf5:  p5,
      perf20: p20,
      perf60: p60,
      delta5v20: delta,
      reversal,
    };
  });
}

// ── Bugünün Lideri Hero Kart ──────────────────────────────────────────

function TodayLeaderHero({
  summaries,
  period,
}: {
  summaries: SectorSummary[];
  period: PeriodDays;
}) {
  const leader = useMemo(() => {
    const valid = summaries.filter((s) => {
      const p = period === 5 ? s.perf5 : period === 20 ? s.perf20 : s.perf60;
      return p !== null;
    });
    if (valid.length === 0) return null;
    return [...valid].sort((a, b) => {
      const pa = period === 5 ? a.perf5 : period === 20 ? a.perf20 : a.perf60;
      const pb = period === 5 ? b.perf5 : period === 20 ? b.perf20 : b.perf60;
      return (pb ?? 0) - (pa ?? 0);
    })[0]!;
  }, [summaries, period]);

  if (!leader) return null;

  const perf = period === 5 ? leader.perf5 : period === 20 ? leader.perf20 : leader.perf60;
  if (perf === null) return null;

  const periodLabel = period === 5 ? '1 hafta' : period === 20 ? '1 ay' : '3 ay';
  const isPositive = perf > 0;

  // Yatırımcı dostu açıklama
  let reason = '';
  if (leader.delta5v20 !== null && leader.delta5v20 > 1) {
    reason = `Son haftada ivme kazanıyor — kısa vade trendi orta vadeyi geçti`;
  } else if (leader.delta5v20 !== null && leader.delta5v20 < -1) {
    reason = `Son haftada ivme yavaşladı — kâr satışı olabilir`;
  } else {
    reason = `İstikrarlı trend — momentum kararlı`;
  }

  return (
    <Link
      href={`/tarama?sektor=${leader.id}`}
      className={cn(
        'block rounded-2xl border p-5 transition-all hover:scale-[1.01] hover:shadow-xl',
        isPositive
          ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 hover:shadow-emerald-500/10'
          : 'border-red-500/30 bg-gradient-to-br from-red-500/15 to-red-500/5 hover:shadow-red-500/10',
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            'flex h-14 w-14 items-center justify-center rounded-2xl text-3xl shrink-0',
            isPositive ? 'bg-emerald-500/20' : 'bg-red-500/20',
          )}>
            {isPositive ? '🏆' : '⚠️'}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {periodLabel} Lideri
            </p>
            <h3 className="text-2xl font-bold text-text-primary leading-tight mt-0.5">
              {leader.name}
            </h3>
            <p className="text-xs text-text-secondary mt-1 leading-snug">
              {reason}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className={cn(
            'text-4xl font-bold tabular-nums leading-none',
            isPositive ? 'text-emerald-400' : 'text-red-400',
          )}>
            {isPositive ? '+' : ''}{perf.toFixed(1)}%
          </div>
          <p className="text-[10px] text-text-muted mt-1">{periodLabel} ortalama</p>
          <p className="text-[10px] text-primary mt-1 font-semibold">Sinyal taraması →</p>
        </div>
      </div>
    </Link>
  );
}

// ── Hızlı Aksiyon — 3 Kart ────────────────────────────────────────────

function QuickActionCards({ summaries }: { summaries: SectorSummary[] }) {
  // 1. Lider (1A)
  const leader = useMemo(() => {
    return [...summaries].filter((s) => s.perf20 !== null)
      .sort((a, b) => (b.perf20 ?? 0) - (a.perf20 ?? 0))[0] ?? null;
  }, [summaries]);

  // 2. Trend Dönüşü (yukarı veya aşağı)
  const reversalSector = useMemo(() => {
    return summaries.find((s) => s.reversal === 'up')
        ?? summaries.find((s) => s.reversal === 'down')
        ?? null;
  }, [summaries]);

  // 3. Aşırı Düşen (1A)
  const oversold = useMemo(() => {
    return [...summaries].filter((s) => s.perf20 !== null && s.perf20 < 0)
      .sort((a, b) => (a.perf20 ?? 0) - (b.perf20 ?? 0))[0] ?? null;
  }, [summaries]);

  if (!leader && !reversalSector && !oversold) return null;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {/* Lider */}
      {leader && leader.perf20 !== null && (
        <Link
          href={`/tarama?sektor=${leader.id}`}
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-colors block"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base">🟢</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              Yükselişte
            </span>
          </div>
          <p className="text-sm font-bold text-text-primary truncate">{leader.shortName}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            <span className="text-emerald-400 font-semibold">+{leader.perf20.toFixed(1)}%</span>
            {' '}1 ay · Sinyalleri gör →
          </p>
        </Link>
      )}

      {/* Trend Dönüşü */}
      {reversalSector ? (
        <Link
          href={`/tarama?sektor=${reversalSector.id}`}
          className={cn(
            'rounded-xl border p-3 hover:bg-white/5 transition-colors block',
            reversalSector.reversal === 'up'
              ? 'border-sky-500/25 bg-sky-500/5'
              : 'border-amber-500/25 bg-amber-500/5',
          )}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base">🔄</span>
            <span className={cn(
              'text-[10px] font-semibold uppercase tracking-wider',
              reversalSector.reversal === 'up' ? 'text-sky-400' : 'text-amber-400',
            )}>
              {reversalSector.reversal === 'up' ? 'Dipten Dönüş' : 'Tepe Dönüşü'}
            </span>
          </div>
          <p className="text-sm font-bold text-text-primary truncate">{reversalSector.shortName}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            3A: {reversalSector.perf60?.toFixed(1)}% · 1H: {reversalSector.perf5?.toFixed(1)}%
          </p>
        </Link>
      ) : (
        <div className="rounded-xl border border-border bg-surface/30 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base opacity-50">🔄</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Trend Dönüşü
            </span>
          </div>
          <p className="text-xs text-text-muted">Şu an dönüş sinyali yok</p>
        </div>
      )}

      {/* Aşırı Düşen */}
      {oversold && oversold.perf20 !== null && (
        <Link
          href={`/tarama?sektor=${oversold.id}`}
          className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 hover:border-red-500/50 hover:bg-red-500/10 transition-colors block"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base">⚠️</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
              Aşırı Düşen
            </span>
          </div>
          <p className="text-sm font-bold text-text-primary truncate">{oversold.shortName}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            <span className="text-red-400 font-semibold">{oversold.perf20.toFixed(1)}%</span>
            {' '}1 ay · Fırsat olabilir →
          </p>
        </Link>
      )}
    </div>
  );
}

// ── Para Akışı Hikayesi (sektör-sektör rotasyon eşleştirmesi) ─────────

function MoneyFlowNarrative({ summaries }: { summaries: SectorSummary[] }) {
  const stories = useMemo(() => {
    const withDelta = summaries.filter((s) => s.delta5v20 !== null);
    if (withDelta.length < 4) return [];

    const sorted = [...withDelta].sort((a, b) => b.delta5v20! - a.delta5v20!);
    const inflows  = sorted.slice(0, 3);    // En çok ivme kazananlar
    const outflows = sorted.slice(-3).reverse(); // En çok ivme kaybedenler

    // Sadece anlamlı eşleştirmeleri al — her iki taraf da en az 1 puan değişmiş olmalı
    const pairs: Array<{ from: SectorSummary; to: SectorSummary }> = [];
    for (let i = 0; i < Math.min(2, outflows.length, inflows.length); i++) {
      const out = outflows[i]!;
      const inf = inflows[i]!;
      if (out.delta5v20! < -0.8 && inf.delta5v20! > 0.8) {
        pairs.push({ from: out, to: inf });
      }
    }
    return pairs;
  }, [summaries]);

  if (stories.length === 0) return null;

  return (
    <div className="rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">💸</span>
        <h3 className="text-sm font-bold text-violet-300">Para Akışı Hikayesi</h3>
        <span className="text-[10px] text-text-muted ml-auto">Son 1 hafta</span>
      </div>

      <div className="space-y-2">
        {stories.map((s, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2.5 text-sm"
          >
            {/* Çıkan */}
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-xs font-bold text-red-300">
                {s.from.shortName}
              </span>
              <span className="text-[11px] text-red-400 tabular-nums">
                {s.from.delta5v20!.toFixed(1)}%
              </span>
            </div>

            {/* Ok */}
            <span className="text-violet-400 text-base">→</span>

            {/* Giren */}
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold text-emerald-300">
                {s.to.shortName}
              </span>
              <span className="text-[11px] text-emerald-400 tabular-nums">
                +{s.to.delta5v20!.toFixed(1)}%
              </span>
            </div>

            {/* Açıklama */}
            <p className="text-[11px] text-text-secondary basis-full sm:basis-auto sm:ml-2">
              {s.from.shortName}'tan çıkan ilgi {s.to.shortName}'ya kayıyor olabilir
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] text-text-muted/70">
        Para akışı = 1H ortalama getiri − 1A ortalama getiri farkı.
        Bir sektörde ivme yavaşlarken diğerinde hızlanması rotasyon işaretidir.
      </p>
    </div>
  );
}

// ─── Sprint 3: BIST Liderleri + Portföy Uyumu + AI Özet ───────────────

interface Mover {
  sembol: string;
  changePercent: number;
  lastClose: number | null;
  sectorName: string | null;
}

// ── Bugünün BIST Liderleri Banner ─────────────────────────────────────

function BistMoversBanner({
  gainers,
  losers,
}: {
  gainers: Mover[];
  losers: Mover[];
}) {
  if (gainers.length === 0 && losers.length === 0) return null;

  const Card = ({ m, kind }: { m: Mover; kind: 'up' | 'down' }) => (
    <Link
      href={`/hisse/${m.sembol}`}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 hover:bg-white/5 transition-colors',
        kind === 'up'
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-red-500/30 bg-red-500/5',
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-bold text-text-primary truncate">{m.sembol}</p>
        {m.sectorName && (
          <p className="text-[9px] text-text-muted truncate">{m.sectorName}</p>
        )}
      </div>
      <span className={cn(
        'text-xs font-bold tabular-nums shrink-0',
        kind === 'up' ? 'text-emerald-400' : 'text-red-400',
      )}>
        {kind === 'up' ? '+' : ''}{m.changePercent.toFixed(2)}%
      </span>
    </Link>
  );

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Gainers */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🚀</span>
          <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            Bugünün Yıldızları
          </h3>
        </div>
        <div className="grid gap-1.5">
          {gainers.map((m) => <Card key={m.sembol} m={m} kind="up" />)}
        </div>
      </div>

      {/* Losers */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">📉</span>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
            Bugünün En Çok Düşenleri
          </h3>
        </div>
        <div className="grid gap-1.5">
          {losers.map((m) => <Card key={m.sembol} m={m} kind="down" />)}
        </div>
      </div>
    </div>
  );
}

// ── Portföyünle Uyum Kartı ────────────────────────────────────────────

interface PortfolioMatchProps {
  loggedIn: boolean;
  portfoyo: string[];
  summaries: SectorSummary[];
  period: PeriodDays;
}

function PortfolioMatch({ loggedIn, portfoyo, summaries, period }: PortfolioMatchProps) {
  const analysis = useMemo(() => {
    if (!loggedIn || portfoyo.length === 0) return null;

    // Portföydeki sektör dağılımı
    const sectorCounts = new Map<SectorId, number>();
    for (const sym of portfoyo) {
      const sid = getSectorId(sym) as SectorId;
      sectorCounts.set(sid, (sectorCounts.get(sid) ?? 0) + 1);
    }

    // Summaries map'i — perf çekme için
    const summaryMap = new Map(summaries.map((s) => [s.id, s]));

    // Her sektör için durum
    const sectorStatus = [...sectorCounts.entries()]
      .map(([sid, count]) => {
        const s = summaryMap.get(sid);
        const perf = s ? (period === 5 ? s.perf5 : period === 20 ? s.perf20 : s.perf60) : null;
        return {
          sectorId: sid,
          name: SECTORS[sid]?.shortName ?? 'Diğer',
          count,
          perf,
          reversal: s?.reversal ?? null,
        };
      })
      .filter((s) => s.perf !== null)
      .sort((a, b) => b.count - a.count);

    // Genel uyum: ağırlıklı ortalama
    const totalCount = sectorStatus.reduce((s, x) => s + x.count, 0);
    const weightedPerf = sectorStatus.reduce(
      (acc, x) => acc + (x.perf ?? 0) * x.count,
      0,
    ) / Math.max(1, totalCount);

    const positiveCount = sectorStatus.filter((s) => (s.perf ?? 0) > 0).length;
    const negativeCount = sectorStatus.filter((s) => (s.perf ?? 0) < 0).length;

    return { sectorStatus, weightedPerf, positiveCount, negativeCount, totalSectors: sectorStatus.length };
  }, [loggedIn, portfoyo, summaries, period]);

  if (!loggedIn || !analysis || analysis.sectorStatus.length === 0) return null;

  const { sectorStatus, weightedPerf, positiveCount, negativeCount, totalSectors } = analysis;
  const periodLabel = period === 5 ? '1 hafta' : period === 20 ? '1 ay' : '3 ay';
  const isPositive = weightedPerf >= 0;

  // Mesaj
  let mainMessage = '';
  if (positiveCount === totalSectors) {
    mainMessage = `Portföyündeki tüm sektörler ${periodLabel} pozitif — momentum tarafındasın`;
  } else if (negativeCount === totalSectors) {
    mainMessage = `Portföyündeki tüm sektörler ${periodLabel} ekside — diversifikasyon zayıf olabilir`;
  } else if (positiveCount > negativeCount) {
    mainMessage = `Portföyündeki sektörlerin çoğu (${positiveCount}/${totalSectors}) ${periodLabel} pozitif`;
  } else {
    mainMessage = `Portföyündeki ${negativeCount}/${totalSectors} sektör ${periodLabel} ekside`;
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-purple-500/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
          isPositive ? 'bg-emerald-500/20' : 'bg-red-500/20',
        )}>
          <Briefcase className={cn('h-4 w-4', isPositive ? 'text-emerald-400' : 'text-red-400')} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-text-primary">Senin Portföyünle Uyum</h3>
          <p className="text-xs text-text-secondary mt-0.5 leading-snug">{mainMessage}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={cn(
            'text-lg font-bold tabular-nums',
            isPositive ? 'text-emerald-400' : 'text-red-400',
          )}>
            {isPositive ? '+' : ''}{weightedPerf.toFixed(1)}%
          </div>
          <p className="text-[9px] text-text-muted">ağırlıklı</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {sectorStatus.map((s) => (
          <div key={s.sectorId} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-text-secondary truncate">{s.name}</span>
            <span className="text-[10px] text-text-muted shrink-0">{s.count} hisse</span>
            <div className="flex-1 relative h-1 rounded-full bg-white/5 mx-2">
              <div
                className={cn(
                  'absolute top-0 h-full rounded-full',
                  (s.perf ?? 0) >= 0 ? 'left-1/2 bg-emerald-500/60' : 'right-1/2 bg-red-500/60',
                )}
                style={{ width: `${Math.min(50, Math.abs(s.perf ?? 0) * 3)}%` }}
              />
              <div className="absolute top-1/2 left-1/2 w-px h-2 -translate-y-1/2 bg-white/15" />
            </div>
            <span className={cn(
              'shrink-0 w-12 text-right font-mono tabular-nums font-semibold',
              (s.perf ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
            )}>
              {(s.perf ?? 0) >= 0 ? '+' : ''}{(s.perf ?? 0).toFixed(1)}%
            </span>
            {s.reversal === 'up' && (
              <span title="Dipten Dönüş" className="shrink-0">🔁</span>
            )}
            {s.reversal === 'down' && (
              <span title="Tepe Dönüşü" className="shrink-0">⚠️</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Sektör Özeti Kartı ─────────────────────────────────────────────

type AiTier = 'free' | 'pro' | 'premium';

function AiSectorSummary({
  loggedIn,
  tier,
  summaries,
}: {
  loggedIn: boolean;
  tier: AiTier;
  summaries: SectorSummary[];
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    if (loading || tier === 'free' || !loggedIn) return;
    setError(null);
    setLoading(true);
    setText('');
    abortRef.current = new AbortController();
    try {
      const payload = summaries.map((s) => ({
        shortName: s.shortName,
        perf5: s.perf5,
        perf20: s.perf20,
        perf60: s.perf60,
        delta5v20: s.delta5v20,
      }));
      const res = await fetch('/api/sectors/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaries: payload }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Bir hata oluştu.');
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.text) { acc += p.text; setText(acc); }
            if (p.error) setError(p.error);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  }, [loading, tier, loggedIn, summaries]);

  // Tier gate görünümü (free veya anonim)
  if (!loggedIn || tier === 'free') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <Lock className="h-4 w-4 text-violet-400 shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold text-violet-300">AI Sektör Özeti</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {!loggedIn
              ? 'Bu özelliği kullanmak için giriş yapın'
              : 'Pro ve Premium planlarda — yatırımcı diliyle haftalık özet'}
          </p>
        </div>
        <Link
          href={!loggedIn ? '/giris' : '/fiyatlandirma'}
          className="flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/30 transition-colors"
        >
          {!loggedIn ? 'Giriş Yap' : <><Crown className="h-3 w-3" />Yükselt</>}
        </Link>
      </div>
    );
  }

  // Pro/Premium — başlat butonu veya streaming text
  return (
    <div>
      {!text && !loading ? (
        <button
          onClick={() => void start()}
          className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 to-indigo-500/5 px-4 py-3 text-sm font-medium text-violet-300 hover:from-violet-500/25 hover:to-indigo-500/10 transition-all w-full"
        >
          <Sparkles className="h-4 w-4" />
          <span>AI ile Haftalık Sektör Özeti Al</span>
          <span className="ml-auto text-[10px] text-violet-400/70">~5 sn</span>
        </button>
      ) : (
        <div className="rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
              AI Sektör Analizi
            </span>
            {!loading && text && (
              <button
                onClick={() => { setText(''); setError(null); }}
                className="ml-auto text-[11px] text-text-muted hover:text-text-secondary"
              >
                Kapat
              </button>
            )}
          </div>
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line prose prose-sm prose-invert max-w-none">
            {text || (loading && (
              <span className="inline-flex items-center gap-2 text-text-muted">
                <Zap className="h-3 w-3 animate-pulse" /> AI düşünüyor…
              </span>
            ))}
            {loading && text && (
              <span className="inline-block h-4 w-0.5 animate-pulse bg-violet-400 align-middle ml-0.5" />
            )}
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      )}
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
  // Candles cache — para akışı + dönüş sinyali için
  const [candlesBySymbol, setCandlesBySymbol] = useState<Map<string, OHLCVCandle[]>>(new Map());

  // Sprint 3 — BIST hareket edenler + login + portföy
  const [movers, setMovers] = useState<{ gainers: Mover[]; losers: Mover[] }>({ gainers: [], losers: [] });
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [tier, setTier]         = useState<AiTier>('free');
  const [portfoyo, setPortfoyo] = useState<string[]>([]);
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

  // Auth + tier + portföy (soft login)
  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setLoggedIn(true);
        const [{ data: prof }, { data: poz }] = await Promise.all([
          supabase.from('profiles').select('tier').eq('id', user.id).single(),
          supabase.from('portfolyo_pozisyonlar').select('sembol').eq('user_id', user.id),
        ]);
        setTier(((prof as { tier?: AiTier } | null)?.tier ?? 'free'));
        setPortfoyo((poz ?? []).map((p: { sembol: string }) => p.sembol));
      } catch { /* sessizce */ }
    })();
  }, []);

  // BIST Liderleri — scan_cache'ten
  useEffect(() => {
    fetch('/api/movers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { gainers?: Mover[]; losers?: Mover[] } | null) => {
        if (!data) return;
        setMovers({ gainers: data.gainers ?? [], losers: data.losers ?? [] });
      })
      .catch(() => {});
  }, [refreshTick]);

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

  // Memoize edilmiş özetler — Hero/Quick/MoneyFlow/Card tek kaynak
  const summaries = useMemo(() => summarizeSectors(allSectors), [allSectors]);
  const reversalMap = useMemo(() => {
    const m = new Map<SectorId, 'up' | 'down' | null>();
    for (const s of summaries) m.set(s.id, s.reversal);
    return m;
  }, [summaries]);

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

        {/* ── 🏆 Bugünün Lideri Hero (Sprint 2 — kullanıcı odaklı) ─── */}
        {!loadingSectors && summaries.length > 0 && (
          <section className="mb-5">
            <TodayLeaderHero summaries={summaries} period={period} />
          </section>
        )}

        {/* ── 🚀 BIST Liderleri Banner (Sprint 3) ───────────────────── */}
        {(movers.gainers.length > 0 || movers.losers.length > 0) && (
          <section className="mb-5">
            <BistMoversBanner gainers={movers.gainers} losers={movers.losers} />
          </section>
        )}

        {/* ── ⚡ Hızlı Aksiyon Kartları ─────────────────────────────── */}
        {!loadingSectors && summaries.length > 0 && (
          <section className="mb-5">
            <QuickActionCards summaries={summaries} />
          </section>
        )}

        {/* ── 💼 Portföyünle Uyum (Sprint 3 — login varsa) ─────────── */}
        {loggedIn && portfoyo.length > 0 && summaries.length > 0 && (
          <section className="mb-5">
            <PortfolioMatch
              loggedIn={loggedIn}
              portfoyo={portfoyo}
              summaries={summaries}
              period={period}
            />
          </section>
        )}

        {/* ── 💸 Para Akışı Hikayesi (sektör-sektör eşleştirme) ────── */}
        {!loadingSectors && summaries.length > 0 && (
          <section className="mb-5">
            <MoneyFlowNarrative summaries={summaries} />
          </section>
        )}

        {/* ── 🤖 AI Sektör Özeti (Sprint 3 — Pro/Premium) ──────────── */}
        {!loadingSectors && summaries.length > 0 && (
          <section className="mb-6">
            <AiSectorSummary
              loggedIn={loggedIn}
              tier={tier}
              summaries={summaries}
            />
          </section>
        )}

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

        {/* ── Sektör Rotasyon Paneli (detaylı görünüm — collapse) ──── */}
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
            <details className="mb-8 group">
              <summary className="cursor-pointer text-xs text-text-muted hover:text-text-primary inline-flex items-center gap-1.5 select-none">
                <ChevronsDown className="h-3.5 w-3.5 group-open:rotate-180 transition-transform" />
                Tüm sektörlerin detaylı para akışı görünümünü göster
              </summary>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
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
                Ivme farkı = 1H ort. getiri − 1A ort. getiri. Pozitif = kısa vadede ivme kazanıyor.
              </p>
            </details>
          );
        })()}


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
                <SectorCard
                  key={s.id}
                  data={s}
                  index={i}
                  period={period}
                  reversal={reversalMap.get(s.id) ?? null}
                />
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
