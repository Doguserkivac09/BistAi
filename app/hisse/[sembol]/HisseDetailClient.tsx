'use client';

import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import Link from 'next/link';
import type { HaberItem } from '@/app/api/haber/route';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignalBadge } from '@/components/SignalBadge';
import { SignalExplanation } from '@/components/SignalExplanation';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchlistButton } from '@/components/WatchlistButton';
import { PortfolyoEkleButton } from '@/components/PortfolyoEkleButton';
import { SaveSignalButton } from '@/components/SaveSignalButton';
import { fetchOHLCVByTimeframeClient, type TimeframeKey } from '@/lib/api-client';
import { detectAllSignals } from '@/lib/signals';
import { calculateSRLevels } from '@/lib/support-resistance';
import { SRLevels } from '@/components/SRLevels';
import { HisseAIYorum } from '@/components/HisseAIYorum';
import { AdilDegerMetre } from '@/components/AdilDegerMetre';
import { HisseSkorKarti } from '@/components/HisseSkorKarti';
import { SinyalGecmisi } from '@/components/SinyalGecmisi';
import { MtfSinyalTablosu } from '@/components/MtfSinyalTablosu';
import { computeTechFairValue } from '@/lib/tech-fair-value';
import { computeStockScore } from '@/lib/stock-score';
import type { OHLCVCandle, StockSignal } from '@/types';
import { toast } from 'sonner';
import type { HisseAnalizResponse } from '@/app/api/hisse-analiz/route';
import { TemelAnalizKarti } from '@/components/TemelAnalizKarti';
import { InvestableScoreCard } from '@/components/InvestableScoreCard';
import { TakasKarti } from '@/components/TakasKarti';
import { PriceAlertButton } from '@/components/PriceAlertButton';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import type { CompositeSignalResult } from '@/lib/composite-signal';
import type { KapDuyuru } from '@/lib/kap';

// Lazy-load chart component (lightweight-charts ~40KB gzipped)
const StockChart = lazy(() =>
  import('@/components/StockChart').then((mod) => ({ default: mod.StockChart }))
);

const TIMEFRAMES: { key: TimeframeKey; label: string; description: string; group: 'intraday' | 'daily' }[] = [
  { key: '15m',  label: '15D',  description: '15 dakika',  group: 'intraday' },
  { key: '30m',  label: '30D',  description: '30 dakika',  group: 'intraday' },
  { key: '1h',   label: '1S',   description: '1 saat',     group: 'intraday' },
  { key: '1d',   label: '1G',   description: '1 gün',      group: 'daily' },
  { key: '1wk',  label: '1H',   description: '1 hafta',    group: 'daily' },
  { key: '1mo',  label: '1A',   description: '1 ay',       group: 'daily' },
];

interface HisseDetailClientProps {
  sembol: string;
  isInWatchlist: boolean;
  savedSignalTypes: string[];
}

// ── HisseAnalizResponse → CompositeSignalResult adaptörü ──────────────
function toCompositeResult(analiz: HisseAnalizResponse): CompositeSignalResult {
  return {
    decision: analiz.decision,
    decisionTr: analiz.decisionTr,
    confidence: analiz.confidence,
    compositeScore: analiz.compositeScore,
    technicalScore: analiz.technicalScore,
    macroScore: analiz.macroScore,
    sectorScore: analiz.sectorScore,
    riskAdjustment: 0,
    color: analiz.color,
    emoji: analiz.emoji,
    context: {
      signalType: '—',
      signalDirection: analiz.signalDirection ?? 'nötr',
      macroWind: analiz.macroScore > 20 ? 'pozitif' : analiz.macroScore < -20 ? 'negatif' : 'nötr',
      macroLabel: analiz.macroScore > 20 ? 'Pozitif' : analiz.macroScore < -20 ? 'Negatif' : 'Nötr',
      sectorName: analiz.sectorName ?? '—',
      sectorSignal: analiz.sectorScore > 20 ? 'yukari' : analiz.sectorScore < -20 ? 'asagi' : 'nötr',
      riskLevel: 'medium',
      keyFactors: [],
    },
  };
}

// ── Bölüm başlığı bileşeni (Bloomberg/Matriks stili) ─────────────────
function SectionHeader({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && <span className="text-primary">{icon}</span>}
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest">{children}</h2>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

// ── Fiyat değişim badge'i ──────────────────────────────────────────────
function ChangeBadge({ value }: { value: number }) {
  const isPos = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-sm font-semibold ${
      isPos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
    }`}>
      {isPos ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

// ── Hero meta hücre ────────────────────────────────────────────────────
function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B';
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + 'K';
  return String(v);
}

// ── Backtest win rate tipi ────────────────────────────────────────────
interface SignalWinRate {
  rate: number;      // 0-1
  n: number;
  horizon: string;   // '3g' | '7g' | '14g' | '30g'
}

// ── Sinyal doğal vadesi ───────────────────────────────────────────────
const SIGNAL_VADE: Record<string, { label: string; color: string }> = {
  'Altın Çapraz':            { label: '30g vade', color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  'Ölüm Çaprazı':            { label: '30g vade', color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  'Trend Başlangıcı':        { label: '14g vade', color: 'text-blue-400   border-blue-500/30   bg-blue-500/10'   },
  'Destek/Direnç Kırılımı':  { label: '14g vade', color: 'text-blue-400   border-blue-500/30   bg-blue-500/10'   },
  'MACD Kesişimi':            { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'RSI Uyumsuzluğu':          { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'Bollinger Sıkışması':      { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'RSI Seviyesi':              { label: '3g vade',  color: 'text-amber-400  border-amber-500/30  bg-amber-500/10'  },
  'Hacim Anomalisi':           { label: '3g vade',  color: 'text-amber-400  border-amber-500/30  bg-amber-500/10'  },
};

// ── Accordion sinyal satırı ────────────────────────────────────────────
function AccordionSignalRow({
  sig,
  explanation,
  sembol,
  savedSignalTypes,
  winRate,
}: {
  sig: StockSignal;
  explanation: string | null;
  sembol: string;
  savedSignalTypes: string[];
  winRate?: SignalWinRate | null;
}) {
  const [open, setOpen] = useState(false);
  const isUp = sig.direction === 'yukari';
  const isDown = sig.direction === 'asagi';
  const borderColor = isUp ? 'border-l-emerald-500' : isDown ? 'border-l-red-500' : 'border-l-border';
  const bgOpen = isUp ? 'bg-emerald-500/5' : isDown ? 'bg-red-500/5' : 'bg-surface/30';
  const sigData = sig.data as unknown as Record<string, number> | undefined;

  return (
    <div className={`border-b border-border last:border-0`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 border-l-2 ${borderColor} px-3 py-3 text-left transition-colors ${open ? bgOpen : 'hover:bg-surface-alt/30'}`}
      >
        <SignalBadge type={sig.type} direction={sig.direction} severity={sig.severity} />
        <div className="min-w-0 flex-1">
          {!open && explanation && (
            <p className="truncate text-xs text-text-muted leading-snug hidden sm:block">
              {explanation.replace(/\*\*/g, '').slice(0, 80)}…
            </p>
          )}
        </div>
        {/* Vade badge */}
        {SIGNAL_VADE[sig.type] && (
          <span className={`shrink-0 hidden sm:inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${SIGNAL_VADE[sig.type]!.color}`}>
            {SIGNAL_VADE[sig.type]!.label}
          </span>
        )}
        {/* Backtest win rate badge */}
        {winRate && winRate.n >= 5 && (() => {
          const pct = Math.round(winRate.rate * 100);
          const cls = pct >= 60 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : pct >= 45 ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
                    :             'text-red-400 border-red-500/30 bg-red-500/10';
          return (
            <span
              title={`Backtest (${winRate.horizon}): %${pct} başarı oranı · ${winRate.n} geçmiş sinyal`}
              className={`shrink-0 hidden sm:inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
            >
              %{pct} başarılı
            </span>
          );
        })()}
        {sigData?.candlesAgo !== undefined && (
          <span className="shrink-0 text-[10px] text-text-muted hidden sm:block">
            {sigData.candlesAgo}g önce
          </span>
        )}
        {sigData?.confluenceScore !== undefined && (
          <span className={`shrink-0 text-[10px] font-mono font-semibold hidden sm:block ${
            sigData.confluenceScore >= 70 ? 'text-emerald-400' :
            sigData.confluenceScore >= 40 ? 'text-amber-400' : 'text-text-muted'
          }`}>
            %{sigData.confluenceScore}
          </span>
        )}
        <span className={`shrink-0 text-[10px] text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className={`px-3 pb-4 pt-2 space-y-2 border-l-2 ${borderColor} ${bgOpen}`}>
          <SignalExplanation text={explanation} isLoading={!explanation} />
          <div className="flex justify-end">
            <SaveSignalButton
              sembol={sembol}
              signalType={sig.type}
              signalData={sig.data}
              aiExplanation={explanation ?? ''}
              isSaved={savedSignalTypes.includes(sig.type)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Teknik Göstergeler Özeti ───────────────────────────────────────────
function TeknikGostergelerOzeti({ candles, timeframe }: { candles: OHLCVCandle[]; timeframe: TimeframeKey }) {
  if (candles.length < 26) return null;

  const closes = candles.map((c) => c.close);
  const n = closes.length;

  function calcEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const result: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) result.push(data[i] * k + result[i - 1] * (1 - k));
    return result;
  }

  function calcRSI(data: number[], period = 14): number {
    if (data.length < period + 1) return 50;
    // Wilder's smoothed RSI — TradingView ile aynı metot
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = data[i] - data[i - 1];
      if (d >= 0) avgGain += d; else avgLoss -= d;
    }
    avgGain /= period;
    avgLoss /= period;
    for (let i = period + 1; i < data.length; i++) {
      const d = data[i] - data[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(0, d))  / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    }
    if (avgLoss === 0) return 100;
    return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;
  }

  const rsi = calcRSI(closes);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine.slice(-9), 9);
  const macdAboveSignal = macdLine[n - 1] > signalLine[signalLine.length - 1];

  const ema50arr = closes.length >= 50 ? calcEMA(closes, 50) : null;
  const ema200arr = closes.length >= 200 ? calcEMA(closes, 200) : null;
  const price = closes[n - 1];
  const ema50 = ema50arr?.[ema50arr.length - 1] ?? null;
  const ema200 = ema200arr?.[ema200arr.length - 1] ?? null;

  let bbB: number | null = null;
  if (closes.length >= 20) {
    const slice = closes.slice(-20);
    const mean = slice.reduce((s, v) => s + v, 0) / 20;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / 20);
    bbB = std > 0 ? ((price - (mean - 2 * std)) / (4 * std)) * 100 : 50;
  }

  let volRatio: number | null = null;
  if (candles.length >= 21) {
    const avgVol = candles.slice(-21, -1).reduce((s, c) => s + (c.volume || 0), 0) / 20;
    volRatio = avgVol > 0 ? (candles[n - 1].volume || 0) / avgVol : null;
  }

  type S = 'bullish' | 'bearish' | 'neutral';
  const rows: { label: string; value: string; detail: string; status: S }[] = [
    {
      label: RSI_LABEL[timeframe] ?? 'RSI (14)',
      value: rsi.toFixed(1),
      detail: rsi >= 70 ? 'Aşırı Alım' : rsi <= 30 ? 'Aşırı Satım' : rsi >= 55 ? 'Güçlü' : rsi <= 45 ? 'Zayıf' : 'Nötr',
      status: rsi >= 55 ? 'bullish' : rsi <= 45 ? 'bearish' : 'neutral',
    },
    {
      label: 'MACD',
      value: macdAboveSignal ? 'Sinyalin Üstü' : 'Sinyalin Altı',
      detail: macdAboveSignal ? 'Yükseliş mom.' : 'Düşüş mom.',
      status: macdAboveSignal ? 'bullish' : 'bearish',
    },
    ...(ema50 !== null ? [{
      label: 'EMA50',
      value: ema50.toFixed(2) + '₺',
      detail: price > ema50 ? 'Fiyat üstünde' : 'Fiyat altında',
      status: (price > ema50 ? 'bullish' : 'bearish') as S,
    }] : []),
    ...(ema200 !== null ? [{
      label: 'EMA200',
      value: ema200.toFixed(2) + '₺',
      detail: price > ema200 ? 'Uzun vade ↑' : 'Uzun vade ↓',
      status: (price > ema200 ? 'bullish' : 'bearish') as S,
    }] : []),
    ...(ema50 !== null && ema200 !== null ? [{
      label: 'EMA Çapraz',
      value: ema50 > ema200 ? 'Altın Çapraz' : 'Ölüm Çaprazı',
      detail: ema50 > ema200 ? 'EMA50 > EMA200' : 'EMA50 < EMA200',
      status: (ema50 > ema200 ? 'bullish' : 'bearish') as S,
    }] : []),
    ...(bbB !== null ? [{
      label: 'Bollinger %B',
      value: '%' + bbB.toFixed(0),
      detail: bbB >= 80 ? 'Üst banda yakın' : bbB <= 20 ? 'Alt banda yakın' : 'Orta bant',
      status: (bbB >= 80 ? 'bearish' : bbB <= 20 ? 'bullish' : 'neutral') as S,
    }] : []),
    ...(volRatio !== null ? [{
      label: 'Hacim Oranı',
      value: volRatio.toFixed(1) + 'x',
      detail: volRatio >= 1.5 ? 'Yüksek hacim' : volRatio <= 0.5 ? 'Düşük hacim' : 'Normal',
      status: (volRatio >= 1.5 ? 'bullish' : volRatio <= 0.5 ? 'bearish' : 'neutral') as S,
    }] : []),
  ];

  const bull = rows.filter((r) => r.status === 'bullish').length;
  const bear = rows.filter((r) => r.status === 'bearish').length;

  return (
    <Card>
      <CardHeader className="py-2 px-3 pb-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Teknik Göstergeler Özeti
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] text-text-muted">{rows.length} gösterge</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
            bull > bear ? 'bg-emerald-500/10 text-emerald-400' :
            bear > bull ? 'bg-red-500/10 text-red-400' :
            'bg-amber-500/10 text-amber-400'
          }`}>
            {bull} Yükseliş · {bear} Düşüş
          </span>
        </div>
        <div className="divide-y divide-border/40">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2">
              <span className="text-xs text-text-secondary">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="hidden text-[10px] text-text-muted sm:block">{row.detail}</span>
                <span className={`text-xs font-mono font-semibold ${
                  row.status === 'bullish' ? 'text-emerald-400' :
                  row.status === 'bearish' ? 'text-red-400' : 'text-amber-400'
                }`}>{row.value}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${
                  row.status === 'bullish' ? 'bg-emerald-400' :
                  row.status === 'bearish' ? 'bg-red-400' : 'bg-amber-400'
                }`} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Zaman dilimine göre periyot tablosu ───────────────────────────────
const TREND_PERIODS: Record<TimeframeKey, { label: string; sublabel: string; bars: number }[]> = {
  '15m': [
    { label: 'Kısa Vade', sublabel: '4 Saat',  bars: 16  },
    { label: 'Orta Vade', sublabel: '1 Gün',   bars: 96  },
    { label: 'Uzun Vade', sublabel: '3 Gün',   bars: 288 },
  ],
  '30m': [
    { label: 'Kısa Vade', sublabel: '4 Saat',  bars: 8   },
    { label: 'Orta Vade', sublabel: '1 Gün',   bars: 48  },
    { label: 'Uzun Vade', sublabel: '3 Gün',   bars: 144 },
  ],
  '1h': [
    { label: 'Kısa Vade', sublabel: '1 Gün',   bars: 24  },
    { label: 'Orta Vade', sublabel: '3 Gün',   bars: 72  },
    { label: 'Uzun Vade', sublabel: '1 Hafta', bars: 120 },
  ],
  '1d': [
    { label: 'Kısa Vade', sublabel: '15 Gün',  bars: 15  },
    { label: 'Orta Vade', sublabel: '45 Gün',  bars: 45  },
    { label: 'Uzun Vade', sublabel: '90 Gün',  bars: 90  },
  ],
  '1wk': [
    { label: 'Kısa Vade', sublabel: '4 Hafta',  bars: 4  },
    { label: 'Orta Vade', sublabel: '12 Hafta', bars: 12 },
    { label: 'Uzun Vade', sublabel: '26 Hafta', bars: 26 },
  ],
  '1mo': [
    { label: 'Kısa Vade', sublabel: '3 Ay',  bars: 3  },
    { label: 'Orta Vade', sublabel: '6 Ay',  bars: 6  },
    { label: 'Uzun Vade', sublabel: '12 Ay', bars: 12 },
  ],
};

const RSI_LABEL: Record<TimeframeKey, string> = {
  '15m': 'RSI (14) 15dk',
  '30m': 'RSI (14) 30dk',
  '1h':  'RSI (14) 1 Saatlik',
  '1d':  'RSI (14) Günlük',
  '1wk': 'RSI (14) Haftalık',
  '1mo': 'RSI (14) Aylık',
};

// ── Trend Özeti ────────────────────────────────────────────────────────
function TrendOzeti({ candles, timeframe }: { candles: OHLCVCandle[]; timeframe: TimeframeKey }) {
  const periods = TREND_PERIODS[timeframe] ?? TREND_PERIODS['1d'];
  const minBars = periods[0].bars;
  if (candles.length < minBars + 1) return null;

  const lastClose = candles[candles.length - 1].close;

  function getTrend(bars: number) {
    if (candles.length < bars + 1) return null;
    const oldClose = candles[candles.length - 1 - bars].close;
    const pct = ((lastClose - oldClose) / oldClose) * 100;
    const direction = pct > 1 ? 'yükseliş' : pct < -1 ? 'düşüş' : 'yatay';
    const absPct = Math.abs(pct);
    const strength = absPct > 10 ? 'güçlü' : absPct > 3 ? 'orta' : 'zayıf';
    const color = direction === 'yükseliş' ? 'emerald' : direction === 'düşüş' ? 'red' : 'amber';
    return { pct, direction, strength, color };
  }

  const items = periods.map((p) => ({ ...p, trend: getTrend(p.bars) })).filter((p) => p.trend !== null);
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3 pb-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Trend Özeti
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        {items.map(({ label, sublabel, trend }) => {
          if (!trend) return null;
          const { pct, direction, strength, color } = trend;
          const icon = direction === 'yükseliş' ? '↗' : direction === 'düşüş' ? '↘' : '→';
          const barWidth = Math.min(Math.abs(pct) * 3, 100);
          return (
            <div key={label} className="flex items-center gap-3">
              <div className="w-[72px] shrink-0">
                <p className="text-xs font-medium text-text-primary">{label}</p>
                <p className="text-[10px] text-text-muted">{sublabel}</p>
              </div>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                <div
                  className={`absolute h-full rounded-full ${
                    color === 'emerald' ? 'bg-emerald-500' :
                    color === 'red' ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                  style={{
                    width: `${barWidth}%`,
                    right: direction === 'düşüş' ? '0' : undefined,
                    left: direction !== 'düşüş' ? '0' : undefined,
                  }}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className={`text-xs font-semibold ${
                  color === 'emerald' ? 'text-emerald-400' :
                  color === 'red' ? 'text-red-400' : 'text-amber-400'
                }`}>{icon} {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                <span className={`hidden text-[10px] capitalize sm:block ${
                  color === 'emerald' ? 'text-emerald-400/70' :
                  color === 'red' ? 'text-red-400/70' : 'text-amber-400/70'
                }`}>{strength}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function HisseDetailClient({ sembol, isInWatchlist, savedSignalTypes }: HisseDetailClientProps) {
  const [candles, setCandles]           = useState<OHLCVCandle[]>([]);
  const [signals, setSignals]           = useState<StockSignal[]>([]);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loading, setLoading]           = useState(true);
  const [timeframe, setTimeframe]       = useState<TimeframeKey>('1d');
  const [haberler, setHaberler]         = useState<HaberItem[]>([]);
  const [haberLoading, setHaberLoading] = useState(true);
  const [bugunHaberSayi, setBugunHaberSayi] = useState(0);
  const [kapDuyurular, setKapDuyurular] = useState<KapDuyuru[]>([]);
  const [kapLoading, setKapLoading]     = useState(true);
  const [kapSummary, setKapSummary]     = useState<string | null>(null);
  const [kapSumLoading, setKapSumLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'teknik' | 'analiz' | 'temel' | 'haberler'>('teknik');
  const [signalStatsMap, setSignalStatsMap] = useState<Map<string, SignalWinRate>>(new Map());

  // Backtest win rate — sinyal tipleri için canonical horizon başarı oranı
  useEffect(() => {
    fetch('/api/signal-stats-summary')
      .then(r => r.ok ? r.json() : { stats: [] })
      .then((res: { stats: Array<{ signal_type: string; win_rate: number; n: number; horizon: string }> }) => {
        const map = new Map<string, SignalWinRate>();
        for (const s of (res.stats ?? [])) {
          map.set(s.signal_type, { rate: s.win_rate, n: s.n, horizon: s.horizon });
        }
        setSignalStatsMap(map);
      })
      .catch(() => {});
  }, []);

  // Hisse analizi (AI + fiyat hedefleri + hero meta)
  const [analiz, setAnaliz]             = useState<HisseAnalizResponse | null>(null);
  const [analizLoading, setAnalizLoading] = useState(true);

  // ── Hisse Analizi (AI, Fiyat Hedefleri, Hero Meta) — timeframe bağımlı ──
  useEffect(() => {
    let cancelled = false;
    setAnalizLoading(true);
    setAnaliz(null);
    fetch(`/api/hisse-analiz?symbol=${encodeURIComponent(sembol)}&timeframe=${timeframe}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: HisseAnalizResponse | null) => {
        if (!cancelled) setAnaliz(data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAnalizLoading(false); });
    return () => { cancelled = true; };
  }, [sembol, timeframe]);

  // ── Haberler ────────────────────────────────────────────────────────────────
  const loadHaberler = useCallback(async () => {
    setHaberLoading(true);
    try {
      const res = await fetch(`/api/haber?sembol=${sembol}`);
      if (!res.ok) return;
      const data = await res.json();
      setHaberler(data.haberler ?? []);
      setBugunHaberSayi(data.bugunSayi ?? 0);
    } catch (err) {
      console.error('[Haberler] Yüklenemedi:', err);
    } finally {
      setHaberLoading(false);
    }
  }, [sembol]);

  useEffect(() => { loadHaberler(); }, [loadHaberler]);

  // ── KAP Duyuruları ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setKapLoading(true);
    fetch(`/api/kap?sembol=${encodeURIComponent(sembol)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setKapDuyurular(data?.duyurular ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setKapLoading(false); });
    return () => { cancelled = true; };
  }, [sembol]);

  // ── OHLCV + Sinyaller ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sembol) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchOHLCVByTimeframeClient(sembol, timeframe);
        if (cancelled) return;
        setCandles(data);
        const sigs = detectAllSignals(sembol, data);
        setSignals(sigs);

        const res = await Promise.allSettled(
          sigs.map(async (sig) => {
            const r = await fetch('/api/explain', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signal: sig }),
            });
            const j = await r.json();

            return { key: `${sig.type}`, text: r.ok ? j.explanation : j.error };
          })
        );
        const next: Record<string, string> = {};
        res.forEach((r, i) => {
          if (r.status === 'fulfilled' && sigs[i]) next[sigs[i].type] = r.value.text;
        });
        if (!cancelled) setExplanations(next);
      } catch {
        if (!cancelled) {
          setSignals([]);
          toast.error(`${sembol} verileri yüklenemedi.`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sembol, timeframe]);

  // Fiyat bilgileri (hero için)
  const lastCandle    = candles[candles.length - 1];
  const currentPrice  = analiz?.currentPrice ?? lastCandle?.close;
  const changePercent = analiz?.changePercent;
  const shortName     = analiz?.shortName;
  const volume        = analiz?.volume ?? lastCandle?.volume;
  const avgVolume20d  = analiz?.avgVolume20d;
  const high90d       = analiz?.high90d;
  const low90d        = analiz?.low90d;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-text-secondary">
          <Link href="/tarama" className="hover:text-primary">Tarama</Link>
          <span>/</span>
          <span className="text-text-primary">{sembol}</span>
        </div>

        {loading && (
          <>
            <Skeleton className="mb-4 h-32 w-full rounded-xl" />
            <Skeleton className="mb-6 h-[400px] w-full rounded-card" />
            <Skeleton className="h-32 w-full rounded-card" />
          </>
        )}

        {!loading && candles.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-text-secondary">
              Bu hisse için veri bulunamadı. Sembolü kontrol edin.
            </p>
            <Button variant="secondary" className="mt-4" asChild>
              <Link href="/tarama">Tarama sayfasına dön</Link>
            </Button>
          </Card>
        )}

        {!loading && candles.length > 0 && (
          <>
            {/* ── HERO BÖLÜMÜ ──────────────────────────────────────────────── */}
            <div className="mb-6 rounded-xl border border-border bg-surface overflow-hidden">
              {/* Üst şerit — renk aksan */}
              <div className={`h-1 w-full ${changePercent !== undefined && changePercent !== null ? (changePercent >= 0 ? 'bg-emerald-500' : 'bg-red-500') : 'bg-primary'}`} />
              <div className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Sol: Sembol + Fiyat */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-3xl font-bold tracking-tight text-text-primary">{sembol}</h1>
                      {shortName && (
                        <span className="text-sm text-text-muted truncate max-w-[200px]">{shortName}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                      {currentPrice && (
                        <span className="text-3xl font-mono font-bold text-text-primary">
                          {currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₺
                        </span>
                      )}
                      {changePercent !== undefined && changePercent !== null && (
                        <ChangeBadge value={changePercent} />
                      )}
                      {/* AI Karar Badge */}
                      {!analizLoading && analiz && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                          style={{ color: analiz.color, borderColor: analiz.color + '66', backgroundColor: analiz.color + '18' }}
                        >
                          {analiz.emoji} {analiz.decisionTr}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sağ: Butonlar */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <PortfolyoEkleButton sembol={sembol} defaultFiyat={lastCandle?.close} />
                    <WatchlistButton sembol={sembol} isInWatchlist={isInWatchlist} />
                    <PriceAlertButton sembol={sembol} currentPrice={candles[candles.length - 1]?.close} />
                    {currentPrice && (
                      <Link
                        href={`/araclar?tab=karZarar&fiyat=${currentPrice.toFixed(2)}`}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-primary/40 hover:text-primary transition-colors"
                        title="Bu hisse için kâr/zarar hesapla"
                      >
                        🧮 Hesapla
                      </Link>
                    )}
                  </div>
                </div>

                {/* Meta ızgara */}
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 border-t border-border/40 pt-4">
                  {volume !== undefined && <MetaCell label="Hacim" value={formatVolume(volume)} />}
                  {avgVolume20d !== undefined && <MetaCell label="Ort. Hacim (20g)" value={formatVolume(avgVolume20d)} />}
                  {high90d !== undefined && <MetaCell label="90G Yüksek" value={high90d.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + '₺'} />}
                  {low90d !== undefined && <MetaCell label="90G Düşük" value={low90d.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + '₺'} />}
                </div>
              </div>
            </div>

            {/* ── Tab Bar ── */}
            <div className="mt-5 flex overflow-x-auto border-b border-border scrollbar-none">
              {([
                { key: 'teknik',   label: 'Teknik Analiz', icon: '📊', badge: 0 },
                { key: 'analiz',   label: 'AI Analiz',      icon: '🤖', badge: 0 },
                { key: 'temel',    label: 'Temel Veriler',  icon: '📋', badge: 0 },
                { key: 'haberler', label: 'Haberler',       icon: '📰', badge: bugunHaberSayi },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 pb-3 pt-1 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-muted hover:text-text-primary'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-primary/20 text-primary text-[10px] font-bold px-1">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Teknik Tab ── */}
            {activeTab === 'teknik' && <>

            {/* ── Zaman dilimi seçici ──────────────────────────────────────── */}
            <div className="mt-4 mb-4 flex items-center">
              <div className="overflow-x-auto">
                <div className="inline-flex items-center rounded-lg border border-border bg-surface/80 p-1 text-xs text-text-secondary whitespace-nowrap">
                  {TIMEFRAMES.map((tf, i) => {
                    const prev = TIMEFRAMES[i - 1];
                    const showSep = prev && prev.group !== tf.group;
                    return (
                      <span key={tf.key} className="flex items-center">
                        {showSep && <span className="mx-1 h-4 w-px bg-border" />}
                        <button
                          type="button"
                          onClick={() => setTimeframe(tf.key)}
                          className={`rounded-md px-2.5 py-1 transition-colors ${
                            timeframe === tf.key
                              ? 'bg-primary text-white'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                          aria-label={tf.description}
                          title={tf.description}
                        >
                          {tf.label}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── 2-KOLON LAYOUT (lg: 3/5 sol + 2/5 sağ) ────────────────── */}
            <div className="grid gap-6 lg:grid-cols-5">

              {/* ── SOL KOLON: Grafik + Sinyaller ──────────────────────────── */}
              <div className="lg:col-span-3 space-y-4">

                {/* Fiyat grafik + RSI birleşik kart */}
                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      Fiyat Grafiği &amp; Teknik Göstergeler
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="h-[360px] w-full">
                      <Suspense fallback={
                        <div className="flex h-[360px] w-full items-center justify-center bg-surface/50">
                          <span className="text-sm text-text-secondary">Grafik yükleniyor...</span>
                        </div>
                      }>
                        <StockChart candles={candles} height={360} signals={signals} />
                      </Suspense>
                    </div>
                    {/* Sinyal chips */}
                    {signals.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 border-y border-border/40 px-3 py-2">
                        <span className="text-[11px] text-text-muted mr-1">Aktif:</span>
                        {signals.map((s) => (
                          <span
                            key={s.type}
                            title={`${s.type} — ${s.severity} — ${s.direction === 'yukari' ? 'Yükseliş' : s.direction === 'asagi' ? 'Düşüş' : 'Nötr'}`}
                            className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-default select-none ${
                              s.direction === 'yukari'
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                                : s.direction === 'asagi'
                                ? 'border-red-500/40 bg-red-500/10 text-red-400'
                                : 'border-border bg-surface/50 text-text-muted'
                            }`}
                          >
                            {s.direction === 'yukari' ? '↑' : s.direction === 'asagi' ? '↓' : '→'} {s.type}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="h-[140px] w-full">
                      <Suspense fallback={
                        <div className="flex h-[140px] w-full items-center justify-center bg-surface/50">
                          <span className="text-sm text-text-secondary">RSI yükleniyor...</span>
                        </div>
                      }>
                        <StockChart candles={candles} showRsi height={140} />
                      </Suspense>
                    </div>
                  </CardContent>
                </Card>

                {/* Tespit Edilen Sinyaller — accordion */}
                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      Tespit Edilen Sinyaller
                    </CardTitle>
                  </CardHeader>
                  {signals.length === 0 ? (
                    <CardContent>
                      <p className="text-sm text-text-secondary">
                        Bu hisse için şu an tespit edilen sinyal yok.
                      </p>
                    </CardContent>
                  ) : (
                    <div className="divide-y divide-border">
                      {signals.map((sig) => (
                        <AccordionSignalRow
                          key={sig.type}
                          sig={sig}
                          explanation={explanations[sig.type] ?? null}
                          sembol={sembol}
                          savedSignalTypes={savedSignalTypes}
                          winRate={signalStatsMap.get(sig.type) ?? null}
                        />
                      ))}
                    </div>
                  )}
                </Card>

              </div>

              {/* ── SAĞ KOLON: Destek/Direnç + Skor + Göstergeler + Trend ──── */}
              <div className="lg:col-span-2 space-y-4">

                {/* Destek & Direnç */}
                {candles.length >= 20 && (
                  <Card className="overflow-hidden">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                        Destek &amp; Direnç
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SRLevels analysis={calculateSRLevels(candles)} />
                    </CardContent>
                  </Card>
                )}

                {/* Investable Edge Yatırım Skoru (kompakt) — tıkla: Temel tab */}
                <Card>
                  <CardHeader className="py-2 px-3 pb-0">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      Yatırım Skoru
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <InvestableScoreCard
                      sembol={sembol}
                      compact
                      onCompactClick={() => setActiveTab('temel')}
                    />
                  </CardContent>
                </Card>

                {/* Hisse Skor Kartı */}
                {candles.length >= 50 && (() => {
                  const stockScore = computeStockScore(candles, signals);
                  return (
                    <Card>
                      <CardHeader className="py-2 px-3 pb-0">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                          Hisse Skor Kartı
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        <HisseSkorKarti result={stockScore} />
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Teknik Göstergeler Özeti */}
                <TeknikGostergelerOzeti candles={candles} timeframe={timeframe} />

                {/* Trend Özeti */}
                <TrendOzeti candles={candles} timeframe={timeframe} />
              </div>
            </div>

            {/* ── TAM GENİŞLİK: MTF Sinyal Tablosu ───────────────────────── */}
            <div className="mt-6">
              <SectionHeader>Çoklu Zaman Dilimi Analizi</SectionHeader>
              <Card>
                <CardContent className="pt-4">
                  <p className="mb-3 text-xs text-text-muted rounded-lg border border-border/60 bg-surface/60 px-3 py-2">
                    Her zaman diliminde tespit edilen teknik sinyallerin sayısına göre AL/SAT/TUT kararı verilir.
                    Üstteki bütünsel karar (makro + sektör + teknik) ile farklılık gösterebilir.
                    RSI değerleri her zaman diliminin kendi mumlarından hesaplanır.
                  </p>
                  <MtfSinyalTablosu sembol={sembol} />
                </CardContent>
              </Card>
            </div>

            {/* ── TAM GENİŞLİK: Sinyal Geçmişi ───────────────────────────── */}
            <div className="mt-6">
              <SectionHeader>Sinyal Geçmişi</SectionHeader>
              <div className="mb-8">
                <SinyalGecmisi sembol={sembol} />
              </div>
            </div>

            {/* ── Teknik Tab — Mini Haber Widget ── */}
            {!haberLoading && haberler.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                      Güncel Haberler
                    </p>
                    {bugunHaberSayi > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        📰 Bugün {bugunHaberSayi} haber
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveTab('haberler')}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Tümünü gör →
                  </button>
                </div>
                <div className="space-y-2">
                  {haberler.slice(0, 3).map((h, i) => {
                    const tarihStr = h.tarih
                      ? (() => {
                          const diff = Date.now() - new Date(h.tarih).getTime();
                          const saat = Math.floor(diff / (1000 * 60 * 60));
                          if (saat < 1) return 'Az önce';
                          if (saat < 24) return `${saat} saat önce`;
                          return new Date(h.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                        })()
                      : '';
                    return (
                      <a
                        key={i}
                        href={h.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 rounded-xl border border-border bg-surface/60 p-3 hover:border-primary/30 hover:bg-surface transition-colors group"
                      >
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px]">📰</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                            {h.baslik}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-text-muted">{h.kaynak}</span>
                            {tarihStr && (
                              <>
                                <span className="text-text-muted/40">·</span>
                                <span className="text-[10px] text-text-muted">{tarihStr}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-text-muted group-hover:text-primary transition-colors text-xs">↗</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            </> /* end activeTab === 'teknik' */}

            {/* ── AI Analiz Tab ── */}
            {activeTab === 'analiz' && (
              <div className="mt-6 space-y-4">
                {/* AI Yorumu — full width prominent */}
                <Card>
                  <CardHeader className="py-2 px-3 pb-0">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">🤖 AI Yorumu</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <HisseAIYorum analiz={analiz} loading={analizLoading} />
                  </CardContent>
                </Card>

                {/* 3-kolon: Kompozit + Adil Değer + Skor */}
                <div className="grid gap-4 lg:grid-cols-3">
                  {!analizLoading && analiz && !analiz.noSignal && (
                    <Card>
                      <CardHeader className="py-2 px-3 pb-0">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">Kompozit Karar</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        <ScoreBreakdown result={toCompositeResult(analiz)} />
                      </CardContent>
                    </Card>
                  )}
                  {candles.length >= 50 && (() => {
                    const fairValue = computeTechFairValue(candles);
                    return (
                      <Card>
                        <CardHeader className="py-2 px-3 pb-0">
                          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">Teknik Adil Değer</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-3">
                          <AdilDegerMetre result={fairValue} />
                        </CardContent>
                      </Card>
                    );
                  })()}
                  {candles.length >= 50 && (() => {
                    const stockScore = computeStockScore(candles, signals);
                    return (
                      <Card>
                        <CardHeader className="py-2 px-3 pb-0">
                          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">Hisse Skor Kartı</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-3">
                          <HisseSkorKarti result={stockScore} />
                        </CardContent>
                      </Card>
                    );
                  })()}
                </div>

                {/* Analizi etkileyen sinyaller */}
                {signals.length > 0 && (
                  <Card className="overflow-hidden">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                        Analizi Etkileyen Sinyaller
                      </CardTitle>
                    </CardHeader>
                    <div className="divide-y divide-border">
                      {signals.map((sig) => (
                        <AccordionSignalRow
                          key={sig.type}
                          sig={sig}
                          explanation={explanations[sig.type] ?? null}
                          sembol={sembol}
                          savedSignalTypes={savedSignalTypes}
                          winRate={signalStatsMap.get(sig.type) ?? null}
                        />
                      ))}
                    </div>
                  </Card>
                )}
                {signals.length === 0 && !loading && (
                  <div className="rounded-xl border border-border bg-surface p-4 text-center">
                    <p className="text-sm text-text-secondary">
                      Bu zaman diliminde tespit edilen sinyal yok. AI analizi genel piyasa koşullarına göre üretildi.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Temel Tab ── */}
            {activeTab === 'temel' && (
              <div className="mt-6 space-y-6">
                {/* Investable Edge Yatırım Skoru — deterministik + AI yorum */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
                    Yatırım Skoru
                    <span className="flex-1 h-px bg-border/50" />
                  </p>
                  <InvestableScoreCard sembol={sembol} />
                </div>
                <TemelAnalizKarti sembol={sembol} currentPrice={candles[candles.length - 1]?.close} />
                {/* Yabancı Takas Verisi */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
                    Yabancı Yatırımcı Analizi
                    <span className="flex-1 h-px bg-border/50" />
                  </p>
                  <TakasKarti sembol={sembol} />
                </div>
              </div>
            )}

            {/* ── Haberler Tab ── */}
            {activeTab === 'haberler' && (
              <div className="mt-6 space-y-6">

            {/* ── KAP Duyuruları ────────────────────────────── */}
            {(kapLoading || kapDuyurular.length > 0) && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <SectionHeader>KAP Duyuruları</SectionHeader>
                  {!kapLoading && kapDuyurular.length > 0 && (
                    <button
                      onClick={async () => {
                        if (kapSummary || kapSumLoading) return;
                        setKapSumLoading(true);
                        try {
                          const res = await fetch('/api/kap/summarize', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ duyurular: kapDuyurular, sembol }),
                          });
                          const data = await res.json();
                          if (data.summary) setKapSummary(data.summary);
                        } catch { /* sessizce geç */ } finally {
                          setKapSumLoading(false);
                        }
                      }}
                      disabled={kapSumLoading || !!kapSummary}
                      className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-medium text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {kapSumLoading ? (
                        <><span className="h-3 w-3 animate-spin rounded-full border border-violet-400 border-t-transparent" /> Analiz ediliyor…</>
                      ) : kapSummary ? (
                        <>✓ AI Özet hazır</>
                      ) : (
                        <>✨ AI ile Özetle</>
                      )}
                    </button>
                  )}
                </div>

                {/* AI KAP özeti */}
                {kapSummary && (
                  <div className="mb-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-2">AI KAP Analizi</p>
                    <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">{kapSummary}</div>
                  </div>
                )}

                {kapLoading ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />)}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {kapDuyurular.slice(0, 6).map(d => (
                      <a
                        key={d.id}
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary/40 hover:bg-surface-alt transition-colors group"
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-xs">📋</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                            {d.baslik}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">{d.kategoriAdi}</span>
                            {d.tarih && <span>{new Date(d.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>}
                          </div>
                        </div>
                        <span className="shrink-0 text-text-muted group-hover:text-primary transition-colors text-xs">↗</span>
                      </a>
                    ))}
                  </div>
                )}
                {!kapLoading && kapDuyurular.length > 6 && (
                  <div className="mt-2 text-right">
                    <Link href="/kap" className="text-xs text-primary hover:underline">Tüm KAP duyurularını gör →</Link>
                  </div>
                )}
              </div>
            )}

            {/* ── Haberler ──────────────────────────────────── */}
            <div className="mt-2">
              <SectionHeader>{sembol} Haberleri</SectionHeader>
              {haberLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
                  ))}
                </div>
              ) : haberler.length === 0 ? (
                <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface py-8 text-center">
                  <p className="text-sm text-text-secondary">
                    {sembol} için güncel haber bulunamadı.
                  </p>
                  <Link
                    href="/haberler"
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-300 group-hover:translate-x-0" />
                    <span>📰 Günün Tüm Haberlerini Gör</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {haberler.map((h, i) => {
                    const tarihStr = h.tarih
                      ? new Date(h.tarih).toLocaleDateString('tr-TR', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })
                      : '';
                    return (
                      <a
                        key={i}
                        href={h.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:bg-surface-alt transition-colors group"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm">
                          📰
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-2">
                            {h.baslik}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                            <span>{h.kaynak}</span>
                            {tarihStr && <><span>·</span><span>{tarihStr}</span></>}
                          </div>
                        </div>
                        <span className="shrink-0 text-text-muted group-hover:text-primary transition-colors">↗</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

              </div>
            )}

          </>
        )}
      </main>
    </div>
  );
}
