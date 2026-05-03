'use client';

import { useState, useEffect, lazy, Suspense, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { WinRateBadge, type WinRateStat } from '@/components/WinRateBadge';
import { BrokerLinkButton } from '@/components/BrokerLinkButton';
import { TradeTargetsCard } from '@/components/TradeTargetsCard';
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
import { getSectorId, SECTOR_REPRESENTATIVES, SECTORS } from '@/lib/sectors';
import { toast } from 'sonner';
import type { HisseAnalizResponse } from '@/app/api/hisse-analiz/route';
import { TemelAnalizKarti } from '@/components/TemelAnalizKarti';
import { InvestableScoreCard } from '@/components/InvestableScoreCard';
import { TakasKarti } from '@/components/TakasKarti';
import { PriceAlertButton } from '@/components/PriceAlertButton';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import type { CompositeSignalResult } from '@/lib/composite-signal';
import { InfoPopover } from '@/components/InfoPopover';
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

// ── InfoTooltip — kart başlıklarında kullanılan açıklama ikonu ────────
function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      className="relative inline-flex group cursor-help focus:outline-none"
      aria-label={text}
    >
      <svg
        className="h-3 w-3 text-text-muted/60 hover:text-text-secondary transition-colors"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="10" strokeWidth="2" />
        <path strokeWidth="2" strokeLinecap="round" d="M12 16v-4M12 8h.01" />
      </svg>
      <span
        role="tooltip"
        className="invisible group-hover:visible group-focus-within:visible absolute left-1/2 top-full mt-1.5 -translate-x-1/2 z-50 w-56 rounded-lg border border-border bg-surface px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-text-secondary shadow-xl pointer-events-none whitespace-normal"
      >
        {text}
      </span>
    </span>
  );
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

// ── Sinyal doğal vadesi ───────────────────────────────────────────────
const SIGNAL_VADE: Record<string, { label: string; color: string }> = {
  'Altın Çapraz':            { label: '30g vade', color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  'Ölüm Çaprazı':            { label: '30g vade', color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  'Trend Başlangıcı':        { label: '14g vade', color: 'text-blue-400   border-blue-500/30   bg-blue-500/10'   },
  'Destek/Direnç Kırılımı':  { label: '14g vade', color: 'text-blue-400   border-blue-500/30   bg-blue-500/10'   },
  'Higher Lows':             { label: '14g · ⚡ erken', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'MACD Kesişimi':            { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'RSI Uyumsuzluğu':          { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'Bollinger Sıkışması':      { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'RSI Seviyesi':              { label: '3g vade',  color: 'text-amber-400  border-amber-500/30  bg-amber-500/10'  },
  'Hacim Anomalisi':           { label: '3g vade',  color: 'text-amber-400  border-amber-500/30  bg-amber-500/10'  },
  // Pre-signals — yeşil + ⚡ pre vurgu (klasik kesişimden önce uyarır)
  'Altın Çapraz Yaklaşıyor':  { label: '30g · ⚡ pre',  color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'Trend Olgunlaşıyor':        { label: '14g · ⚡ pre',  color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'Direnç Testi':              { label: '14g · ⚡ pre',  color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'MACD Daralıyor':            { label: '7g · ⚡ pre',   color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  // Formasyonlar — turuncu + 📐 vurgu (klasik teknik analiz pattern)
  'Çift Dip':                  { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Çift Tepe':                 { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Bull Flag':                 { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Bear Flag':                 { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Cup & Handle':              { label: '30g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Ters Omuz-Baş-Omuz':        { label: '30g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Yükselen Üçgen':            { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
};

// ── Haftalık uyum rozeti (multi-timeframe) ─────────────────────────────
function MTFBadge({ aligned }: { aligned: boolean }) {
  return aligned ? (
    <span
      title="Haftalık trend ile uyumlu — güçlü sinyal"
      className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400"
    >W✓</span>
  ) : (
    <span
      title="Haftalık trend ile uyumsuz — zayıf sinyal"
      className="inline-flex items-center rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400"
    >W✗</span>
  );
}

// ── RSI14 Wilder ─────────────────────────────────────────────────────
function calcRSI14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= 14; avgLoss /= 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * 13 + (d > 0 ? d : 0)) / 14;
    avgLoss = (avgLoss * 13 + (d < 0 ? -d : 0)) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

// ── Göreceli hacim (5g ort) ───────────────────────────────────────────
function calcRelVol5(candles: { volume: number }[]): number | null {
  if (candles.length < 21) return null;
  const slice20 = candles.slice(-21, -1);
  const avg20 = slice20.reduce((s, c) => s + c.volume, 0) / 20;
  if (avg20 === 0) return null;
  const slice5 = candles.slice(-5);
  const avg5 = slice5.reduce((s, c) => s + c.volume, 0) / 5;
  return parseFloat((avg5 / avg20).toFixed(2));
}

// ── ADV hesaplama (Average Daily Value = Σ(close × volume) / n) ──────
function computeADV(candles: { close: number; volume: number }[], n: number = 10): number {
  const slice = candles.slice(-n);
  if (slice.length === 0) return 0;
  return slice.reduce((s, c) => s + c.close * c.volume, 0) / slice.length;
}

// ── ADV formatter ─────────────────────────────────────────────────────
function formatADV(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B₺';
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + 'M₺';
  return (v / 1_000).toFixed(0) + 'K₺';
}

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
  winRate: WinRateStat | null;
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
        className={`flex w-full items-center gap-2 border-l-2 ${borderColor} px-3 py-3 text-left transition-colors ${open ? bgOpen : 'hover:bg-surface-alt/30'}`}
      >
        <SignalBadge type={sig.type} direction={sig.direction} severity={sig.severity} />
        <WinRateBadge stat={winRate} horizon="7g" showInsufficient />
        {sig.weeklyAligned !== undefined && <MTFBadge aligned={sig.weeklyAligned} />}
        <div className="min-w-0 flex-1">
          {!open && explanation && (
            <p className="truncate text-xs text-text-muted leading-snug hidden sm:block">
              {explanation.replace(/\*\*/g, '').slice(0, 80)}…
            </p>
          )}
        </div>
        {/* Vade badge — mobilde de görünür (U8 fix) */}
        {SIGNAL_VADE[sig.type] && (
          <span className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${SIGNAL_VADE[sig.type]!.color}`}>
            {SIGNAL_VADE[sig.type]!.label}
          </span>
        )}
        {sigData?.candlesAgo !== undefined && (
          <span className="shrink-0 text-[10px] text-text-muted hidden xs:block sm:block">
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
        <div className={`px-3 pb-4 pt-2 space-y-3 border-l-2 ${borderColor} ${bgOpen}`}>
          {/* ── Risk Yönetimi Seviyeleri ───────────────────────────── */}
          {sig.stopLoss && sig.targetPrice && sig.entryPrice && (
            <div className="rounded-lg border border-border/60 bg-surface/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">
                Risk Yönetimi
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {/* Zarar Kes */}
                <div className="rounded-md border border-red-500/25 bg-red-500/8 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-red-400/70 mb-0.5">Zarar Kes</p>
                  <p className="text-sm font-bold text-red-400">
                    {sig.stopLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[9px] text-red-400/60 mt-0.5">
                    {(((sig.stopLoss - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1)}%
                  </p>
                </div>
                {/* Giriş */}
                <div className="rounded-md border border-border/40 bg-surface/40 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">Giriş</p>
                  <p className="text-sm font-bold text-text-primary">
                    {sig.entryPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[9px] text-text-muted mt-0.5">
                    ATR {sig.atr?.toFixed(2)}
                  </p>
                </div>
                {/* Hedef */}
                <div className="rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-emerald-400/70 mb-0.5">Hedef</p>
                  <p className="text-sm font-bold text-emerald-400">
                    {sig.targetPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[9px] text-emerald-400/60 mt-0.5">
                    +{(((sig.targetPrice - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              {sig.riskRewardRatio && (
                <p className="mt-2 text-center text-[10px] text-text-muted">
                  Risk/Ödül:&nbsp;
                  <span className={`font-semibold ${sig.riskRewardRatio >= 2 ? 'text-emerald-400' : sig.riskRewardRatio >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>
                    1 : {sig.riskRewardRatio.toFixed(1)}
                  </span>
                  <span className="ml-2 text-text-muted/60">
                    ({sig.riskRewardRatio >= 2 ? 'İyi' : sig.riskRewardRatio >= 1.5 ? 'Kabul edilebilir' : 'Düşük'})
                  </span>
                </p>
              )}
              <p className="mt-2 text-[9px] text-text-muted/50 text-center">
                * ATR bazlı teorik seviyeler. Yatırım tavsiyesi değildir.
              </p>
            </div>
          )}
          <SignalExplanation text={explanation} isLoading={!explanation} />
          {sig.weeklyAligned !== undefined && (
            <div className={`rounded-md border px-2.5 py-2 text-[11px] ${
              sig.weeklyAligned
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
                : 'border-red-500/30 bg-red-500/5 text-red-200'
            }`}>
              <p className="font-semibold">
                {sig.weeklyAligned ? '✦ Haftalık trend uyumlu' : '⚠ Haftalık trend uyumsuz'}
              </p>
              <p className="mt-0.5 text-[10px] opacity-80">
                {sig.weeklyAligned
                  ? 'Günlük sinyal yönü haftalık EMA8 trendiyle hizalı — güç çarpanı +'
                  : 'Günlük sinyal haftalık trende ters yönde — counter-trend riski, stop sıkı tutulmalı'}
              </p>
            </div>
          )}
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
  // Fırsatlar sayfasından gelen snapshot bağlamı (varsa) — canlı skorla karşılaştır
  const searchParams = useSearchParams();
  const snapshotCtx = useMemo(() => {
    const rawScore = searchParams?.get('snapshotScore');
    const rawAt    = searchParams?.get('snapshotAt');
    const from     = searchParams?.get('from');
    if (!rawScore || from !== 'firsatlar') return null;
    const score = Number(rawScore);
    if (!Number.isFinite(score)) return null;
    return { score, at: rawAt };
  }, [searchParams]);

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
  const [kapUyariMesaj, setKapUyariMesaj] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'teknik' | 'analiz' | 'temel' | 'haberler'>('teknik');
  const [delayBannerDismissed, setDelayBannerDismissed] = useState(false);
  // Sprint 2 — Özel notlar
  const [traderNote, setTraderNote] = useState<string>('');
  const [noteEditing, setNoteEditing] = useState<boolean>(false);
  const NOTE_KEY = `bistai.hisse.note.${sembol}`;
  const DELAY_BANNER_KEY = 'bistai.hisse.delayBannerDismissed';

  // Banner dismiss state — localStorage
  useEffect(() => {
    try {
      if (localStorage.getItem(DELAY_BANNER_KEY) === '1') setDelayBannerDismissed(true);
    } catch { /* ignore */ }
  }, []);

  const dismissDelayBanner = useCallback(() => {
    setDelayBannerDismissed(true);
    try { localStorage.setItem(DELAY_BANNER_KEY, '1'); } catch { /* ignore */ }
  }, []);

  // Trader notu yükleme
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NOTE_KEY);
      if (saved) setTraderNote(saved);
      else setTraderNote('');
    } catch { setTraderNote(''); }
  }, [NOTE_KEY]);

  const saveTraderNote = useCallback((text: string) => {
    setTraderNote(text);
    try {
      if (text.trim()) localStorage.setItem(NOTE_KEY, text);
      else localStorage.removeItem(NOTE_KEY);
    } catch { /* ignore */ }
  }, [NOTE_KEY]);

  // ActiveTab URL persist (U11 fix)
  const didReadTabRef = useRef(false);
  useEffect(() => {
    if (didReadTabRef.current) return;
    didReadTabRef.current = true;
    if (typeof window === 'undefined') return;
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'analiz' || tab === 'temel' || tab === 'haberler') {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    if (!didReadTabRef.current || typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (activeTab === 'teknik') sp.delete('tab');
    else sp.set('tab', activeTab);
    const qs = sp.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [activeTab]);

  // Geri butonu — referrer-aware (U10 fix)
  const backLink = useMemo(() => {
    const from = searchParams?.get('from');
    if (from === 'firsatlar')        return { href: '/firsatlar',          label: 'Fırsatlar' };
    if (from === 'tersportfolyo')    return { href: '/ters-portfolyo',     label: 'Portföy Dışı' };
    if (from === 'sektorler')        return { href: '/sektorler',          label: 'Sektörler' };
    if (from === 'screener')         return { href: '/screener',           label: 'Screener' };
    return { href: '/tarama',                                              label: 'Tarama' };
  }, [searchParams]);

  // Sprint 2 W1+W8 — Sektör emsalleri (peer comparison)
  interface PeerData {
    sembol: string;
    perf20d: number | null;
    lastPrice: number | null;
  }
  const [peerData, setPeerData] = useState<PeerData[]>([]);
  const [peerLoading, setPeerLoading] = useState(false);

  const sectorId = useMemo(() => getSectorId(sembol), [sembol]);
  const sectorInfo = SECTORS[sectorId];

  useEffect(() => {
    if (!sectorId || sectorId === 'diger') return;
    const reps = SECTOR_REPRESENTATIVES[sectorId];
    if (!reps || reps.length === 0) return;

    // Mevcut hisse + ilk 4 farklı temsilci (max 5)
    const symbolsToFetch = [sembol, ...reps.filter((s) => s !== sembol)].slice(0, 5);

    setPeerLoading(true);
    let cancelled = false;

    void (async () => {
      const results = await Promise.allSettled(
        symbolsToFetch.map(async (s) => {
          const res = await fetch(`/api/ohlcv?symbol=${s}&days=30`);
          if (!res.ok) throw new Error('fetch fail');
          const { candles: cs = [] } = await res.json() as { candles: OHLCVCandle[] };
          const td = cs.filter((c) => (c.volume ?? 0) > 0);
          if (td.length < 21) return { sembol: s, perf20d: null, lastPrice: td.length > 0 ? td[td.length - 1]!.close : null };
          const last = td[td.length - 1]!.close;
          const base = td[td.length - 21]!.close;
          if (base === 0) return { sembol: s, perf20d: null, lastPrice: last };
          const perf = ((last - base) / base) * 100;
          return { sembol: s, perf20d: parseFloat(perf.toFixed(2)), lastPrice: last };
        }),
      );

      if (cancelled) return;
      const data: PeerData[] = results.map((r) =>
        r.status === 'fulfilled'
          ? r.value
          : { sembol: '?', perf20d: null, lastPrice: null }
      ).filter((p) => p.sembol !== '?');

      setPeerData(data);
      setPeerLoading(false);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sembol, sectorId]);

  // D7 fix — heavy hesaplamalar useMemo
  const stockScore = useMemo(() => {
    if (candles.length < 50) return null;
    return computeStockScore(candles, signals);
  }, [candles, signals]);

  const fairValue = useMemo(() => {
    if (candles.length < 50) return null;
    return computeTechFairValue(candles);
  }, [candles]);

  // Hisse analizi (AI + fiyat hedefleri + hero meta)
  const [analiz, setAnaliz]             = useState<HisseAnalizResponse | null>(null);
  const [analizLoading, setAnalizLoading] = useState(true);

  // Sinyal tipi başına tarihsel başarı oranı
  const [winRateMap, setWinRateMap] = useState<Map<string, WinRateStat>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/signal-stats')
      .then((r) => (r.ok ? r.json() : []))
      .then((stats: Array<{ signal_type: string; total_signals: number; horizon_7d: { win_rate: number | null } | null }>) => {
        if (cancelled || !Array.isArray(stats)) return;
        const map = new Map<string, WinRateStat>();
        for (const s of stats) {
          const rate = s.horizon_7d?.win_rate;
          map.set(s.signal_type, { rate: rate ?? 0, sampleSize: s.total_signals });
        }
        setWinRateMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Yatırım Skoru fetch (çelişki tespiti için) ───────────────────────
  interface FundamentalScoreData {
    score: number;
    rating: 'Çok İyi' | 'İyi' | 'Orta' | 'Zayıf' | 'Kötü' | string;
    confidence: 'high' | 'medium' | 'low' | string;
  }
  const [fundamentalScore, setFundamentalScore] = useState<FundamentalScoreData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/investment-score?sembol=${encodeURIComponent(sembol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { score?: number; ratingLabel?: string; confidence?: string } | null) => {
        if (cancelled || !data || typeof data.score !== 'number') return;
        setFundamentalScore({
          score: data.score,
          rating: (data.ratingLabel as FundamentalScoreData['rating']) ?? 'Orta',
          confidence: data.confidence ?? 'medium',
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sembol]);

  // ── Çelişki tespiti — Teknik vs Temel ───────────────────────────────
  type SignalConflict = 'tech-strong-fund-weak' | 'tech-weak-fund-strong' | 'aligned-bullish' | 'aligned-bearish' | 'mixed' | null;
  const conflictAnalysis = useMemo((): {
    type: SignalConflict;
    techScore: number | null;
    fundScore: number | null;
    techLabel: string;
    fundLabel: string;
  } => {
    const tech = stockScore?.totalScore ?? null;
    const fund = fundamentalScore?.score ?? null;
    if (tech === null || fund === null) {
      return { type: null, techScore: tech, fundScore: fund, techLabel: '', fundLabel: '' };
    }
    const techStrong = tech >= 70;
    const techWeak   = tech <= 40;
    const fundStrong = fund >= 65;
    const fundWeak   = fund <= 40;

    const techLabel = techStrong ? 'Güçlü AL' : techWeak ? 'Zayıf' : 'Orta';
    const fundLabel = fundStrong ? 'Güçlü' : fundWeak ? 'Zayıf' : 'Orta';

    let type: SignalConflict = 'mixed';
    if (techStrong && fundWeak) type = 'tech-strong-fund-weak';
    else if (techWeak && fundStrong) type = 'tech-weak-fund-strong';
    else if (techStrong && fundStrong) type = 'aligned-bullish';
    else if (techWeak && fundWeak) type = 'aligned-bearish';

    return { type, techScore: tech, fundScore: fund, techLabel, fundLabel };
  }, [stockScore, fundamentalScore]);

  // En iyi sinyal — backtest başarı öne çıkar (W4)
  const bestSignalStat = useMemo(() => {
    if (signals.length === 0 || winRateMap.size === 0) return null;
    type SigStat = { sig: StockSignal; rate: number; n: number };
    const stats: SigStat[] = signals
      .map((sig) => {
        const wr = winRateMap.get(sig.type);
        if (!wr || wr.sampleSize < 10) return null;
        return { sig, rate: wr.rate, n: wr.sampleSize };
      })
      .filter((x): x is SigStat => x !== null);
    if (stats.length === 0) return null;
    return stats.sort((a, b) => b.rate - a.rate)[0]!;
  }, [signals, winRateMap]);

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
      .then(data => {
        if (!cancelled) {
          const duyurular: KapDuyuru[] = data?.duyurular ?? [];
          setKapDuyurular(duyurular);
          // Son 7 gün kritik KAP duyurusu varsa uyarı göster
          const KRITIK = ['financ', 'mali', 'bilan', 'temett', 'genel kurul', 'fr', 'fn', 'gk'];
          const sinir = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const kritikler = duyurular.filter((d) => {
            const tarih = new Date(d.tarih);
            if (isNaN(tarih.getTime()) || tarih < sinir) return false;
            const text = (d.kategori + ' ' + d.baslik).toLowerCase();
            return KRITIK.some((k) => text.includes(k));
          });
          if (kritikler[0]) {
            setKapUyariMesaj(
              `⚠️ Son 7 gün KAP: ${kritikler[0].kategoriAdi} — "${kritikler[0].baslik.slice(0, 60)}" — Finansal açıklama döneminde sinyaller daha az güvenilir olabilir.`
            );
          }
        }
      })
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
        {/* Breadcrumb — referrer-aware geri butonu (U10 fix) */}
        <div className="mb-3 flex items-center gap-2 text-sm text-text-secondary">
          <Link
            href={backLink.href}
            className="flex items-center gap-1 hover:text-primary transition-colors"
            aria-label={`${backLink.label} sayfasına dön`}
          >
            <span aria-hidden>←</span>
            <span>{backLink.label}</span>
          </Link>
          <span className="opacity-40">/</span>
          <span className="text-text-primary">{sembol}</span>
        </div>

        {/* Veri gecikme uyarısı — dismissible (U2 fix) */}
        {!delayBannerDismissed && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-300">
            <span className="shrink-0">⚠️</span>
            <span className="flex-1">
              <strong>Fiyat ve sinyaller ~15 dakika gecikmeli</strong> — Yahoo Finance kaynaklı.
              Teknik analiz için uygundur; anlık al/sat kararları için broker platformunuzu kullanın.
            </span>
            <button
              onClick={dismissDelayBanner}
              aria-label="Uyarıyı kapat"
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </div>
        )}

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
                      {/* AI Karar Badge — Kompozit (teknik + makro + sektör) */}
                      {!analizLoading && analiz && (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                            style={{ color: analiz.color, borderColor: analiz.color + '66', backgroundColor: analiz.color + '18' }}
                          >
                            {analiz.emoji} {analiz.decisionTr}
                          </span>
                          <InfoPopover
                            title="Kompozit Karar"
                            description="Sayfanın üst köşesindeki bu karar; teknik göstergeleri, piyasa makro rüzgarını ve sektör momentumunu birlikte değerlendirir. Sayfanın alt bölümündeki 'Sadece Teknik' kartı sadece fiyat/hacim'e bakar; bu yüzden ikisi farklı yönü gösterebilir."
                            meta="Teknik %50 · Makro %30 · Sektör %20 · Kısa vade"
                            size={13}
                          />
                        </span>
                      )}
                    </div>

                    {/* Snapshot ↔ Canlı delta uyarısı — Fırsatlar'dan gelen kullanıcıya */}
                    {snapshotCtx && !analizLoading && analiz?.decisionEngine && (() => {
                      const live  = analiz.decisionEngine.score;
                      const snap  = snapshotCtx.score;
                      const delta = Math.round(live - snap);
                      const absD  = Math.abs(delta);
                      if (absD <= 15) {
                        return (
                          <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300/90">
                            ✓ Fırsatlar skoru {snap} · Canlı skor {live} — sinyal hâlâ tutarlı.
                          </div>
                        );
                      }
                      return (
                        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                          ⚠ Fırsatlar skoru <b>{snap}</b> → Şu an <b>{live}</b> (Δ {delta > 0 ? '+' : ''}{delta}).
                          {' '}Sinyal önemli ölçüde değişmiş olabilir — güncel veriye göre karar verin.
                        </div>
                      );
                    })()}
                  </div>

                  {/* Sağ: Butonlar */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <PortfolyoEkleButton sembol={sembol} defaultFiyat={lastCandle?.close} />
                    <WatchlistButton sembol={sembol} isInWatchlist={isInWatchlist} />
                    <PriceAlertButton sembol={sembol} currentPrice={candles[candles.length - 1]?.close} />
                    <BrokerLinkButton sembol={sembol} />
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
                {(() => {
                  const isDailyFrame = timeframe === '1d' || timeframe === '1wk' || timeframe === '1mo';
                  const rsi14 = isDailyFrame ? calcRSI14(candles.map(c => c.close)) : null;
                  const rVol5 = isDailyFrame ? calcRelVol5(candles) : null;
                  const adv   = isDailyFrame && candles.length >= 10 ? computeADV(candles, 10) : null;
                  return (
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 border-t border-border/40 pt-4">
                      {volume !== undefined && <MetaCell label="Hacim" value={formatVolume(volume)} />}
                      {avgVolume20d !== undefined && <MetaCell label="Ort. Hacim (20g)" value={formatVolume(avgVolume20d)} />}
                      {high90d !== undefined && <MetaCell label="90G Yüksek" value={high90d.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + '₺'} />}
                      {low90d !== undefined && <MetaCell label="90G Düşük" value={low90d.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + '₺'} />}
                      {rsi14 !== null && (
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-text-muted">RSI 14</p>
                          <p className={`text-sm font-semibold ${rsi14 >= 70 ? 'text-red-400' : rsi14 <= 30 ? 'text-emerald-400' : 'text-text-primary'}`}>
                            {rsi14}
                            {rsi14 >= 70 && <span className="ml-1 text-[10px] text-red-400">OB</span>}
                            {rsi14 <= 30 && <span className="ml-1 text-[10px] text-emerald-400">OS</span>}
                          </p>
                        </div>
                      )}
                      {rVol5 !== null && (
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-text-muted">rVol 5g</p>
                          <p className={`text-sm font-semibold ${rVol5 >= 2 ? 'text-amber-400' : rVol5 >= 1.5 ? 'text-emerald-400' : rVol5 < 0.7 ? 'text-text-muted' : 'text-text-primary'}`}>
                            {rVol5.toFixed(2)}x
                          </p>
                        </div>
                      )}
                      {adv !== null && (
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-text-muted">ADV 10g</p>
                          <p className={`text-sm font-semibold ${adv < 10_000_000 ? 'text-orange-400' : 'text-text-primary'}`}
                             title={adv < 10_000_000 ? 'Düşük likidite: günlük işlem hacmi < 10M₺' : 'Likit hisse'}>
                            {formatADV(adv)}
                            {adv < 10_000_000 && <span className="ml-1 text-[10px]">⚠</span>}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── Vade Bazlı Karar Kartı + Çelişki Uyarısı (B planı) ──── */}
            {conflictAnalysis.type !== null && conflictAnalysis.techScore !== null && conflictAnalysis.fundScore !== null && (
              <div className="mb-6 space-y-3">
                {/* Çelişki banner — sadece kritik durumlarda */}
                {conflictAnalysis.type === 'tech-strong-fund-weak' && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/8 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0">⚠️</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-amber-300 mb-1">
                          Karşıt Sinyaller — Dikkatli ol
                        </p>
                        <p className="text-xs text-amber-200/90 leading-relaxed">
                          <strong>Kısa vadeli teknik göstergeler güçlü AL</strong> diyor ancak şirketin
                          temelleri zayıf. Bu durum genellikle <strong>spekülatif rally</strong> işaretidir —
                          fiyat hızla yükselebilir ama uzun vadede düşüş riski yüksek.
                        </p>
                        <ul className="mt-2 text-[11px] text-amber-200/80 space-y-0.5">
                          <li>→ Pozisyonu küçük tut</li>
                          <li>→ Sıkı stop-loss kullan ({signals[0]?.stopLoss ? `${signals[0].stopLoss.toFixed(2)}₺` : 'risk yönetimi sekmesinde'})</li>
                          <li>→ Uzun vadeli yatırımdan kaçın</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {conflictAnalysis.type === 'tech-weak-fund-strong' && (
                  <div className="rounded-xl border border-sky-500/40 bg-sky-500/8 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0">💡</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-sky-300 mb-1">
                          Düşüşten Alım Fırsatı?
                        </p>
                        <p className="text-xs text-sky-200/90 leading-relaxed">
                          <strong>Şirket temelleri güçlü</strong> ancak fiyat şu an zayıf. Uzun vadeli yatırımcı
                          için <strong>iyi giriş noktası</strong> olabilir — kısa vadede sabır gerekir.
                        </p>
                        <ul className="mt-2 text-[11px] text-sky-200/80 space-y-0.5">
                          <li>→ Aşamalı alım yap (tek seferde değil)</li>
                          <li>→ 1-3 yıl vadeli düşün</li>
                          <li>→ Kısa vadeli volatiliteyi kabul et</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {conflictAnalysis.type === 'aligned-bullish' && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/8 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0">🎯</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-emerald-300 mb-1">
                          Çift Yönlü Güçlü Sinyal
                        </p>
                        <p className="text-xs text-emerald-200/90">
                          Hem teknik göstergeler hem temel veriler güçlü AL diyor —
                          kısa vadeli rally ile uzun vadeli değer örtüşüyor.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {conflictAnalysis.type === 'aligned-bearish' && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/8 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0">🛑</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-red-300 mb-1">
                          Hem Teknik Hem Temel Zayıf
                        </p>
                        <p className="text-xs text-red-200/90">
                          Bu hisseden uzak durmak makul — kısa vadeli düşüş trendi
                          ve uzun vadeli zayıf temeller bir arada.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Vade Bazlı Karar Kartı — her zaman göster */}
                <div className="grid gap-3 md:grid-cols-2">
                  {/* Sadece Teknik (5 boyut) */}
                  <div className="rounded-xl border border-border bg-surface/60 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                        <span>Sadece Teknik</span>
                        <InfoPopover
                          title="Sadece Teknik"
                          description="Hissenin sadece fiyat ve hacim verisinden çıkarılan teknik sağlığı. Beş boyut ayrı ayrı puanlanıp ortalaması alınır. Üstteki kompozit karara makro/sektör de katıldığı için bu kart farklı yön gösterebilir."
                          meta="Trend · Momentum · Hacim · Sinyal · Volatilite · 0-100"
                          size={12}
                        />
                      </p>
                      <span className="text-[9px] text-text-muted/60">5 boyut</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-bold tabular-nums ${
                        conflictAnalysis.techScore >= 70 ? 'text-emerald-400' :
                        conflictAnalysis.techScore >= 50 ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {conflictAnalysis.techScore}
                      </span>
                      <span className={`text-sm font-semibold ${
                        conflictAnalysis.techScore >= 70 ? 'text-emerald-400' :
                        conflictAnalysis.techScore >= 50 ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {conflictAnalysis.techLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted">
                      Fiyat momentumu, hacim, RSI, sinyaller
                    </p>
                    {/* Üst kompozit karar ile çelişki uyarısı */}
                    {analiz && conflictAnalysis.techScore != null && (() => {
                      const techBullish = conflictAnalysis.techScore >= 70;
                      const techBearish = conflictAnalysis.techScore <= 40;
                      const compBullish = analiz.decision === 'BUY' || analiz.decision === 'STRONG_BUY';
                      const compBearish = analiz.decision === 'SELL' || analiz.decision === 'STRONG_SELL';
                      if (techBullish && compBearish) {
                        return (
                          <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300/90">
                            ⚠ Teknik momentum güçlü ama makro/sektör baskısı kompozit kararı aşağı çekiyor. Üstteki kompozit kararı önceliklendirin.
                          </p>
                        );
                      }
                      if (techBearish && compBullish) {
                        return (
                          <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300/90">
                            ⚠ Teknik zayıf ama makro/sektör destekliyor. Bu durumda kompozit alış verir; teknik dipten dönüş arayın.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Uzun Vade — Temel */}
                  <div className="rounded-xl border border-border bg-surface/60 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                        <span>Uzun Vade (Şirket Sağlığı)</span>
                        <InfoPopover
                          title="Şirket Sağlığı"
                          description="Şirketin uzun vadede yatırımlık olup olmadığını şirketin temellerine bakarak değerlendirir. Dört boyutta deterministik formülle hesaplanır."
                          meta="Değerleme %30 · Büyüme %25 · Kârlılık %20 · Risk %25 · 0-100"
                          size={12}
                        />
                      </p>
                      <span className="text-[9px] text-text-muted/60">ay/yıl</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-bold tabular-nums ${
                        conflictAnalysis.fundScore >= 65 ? 'text-emerald-400' :
                        conflictAnalysis.fundScore >= 45 ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {conflictAnalysis.fundScore}
                      </span>
                      <span className={`text-sm font-semibold ${
                        conflictAnalysis.fundScore >= 65 ? 'text-emerald-400' :
                        conflictAnalysis.fundScore >= 45 ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {conflictAnalysis.fundLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted">
                      P/E, kâr marjı, borç, büyüme, değerleme
                    </p>
                  </div>
                </div>
              </div>
            )}

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

                {/* KAP kritik duyuru uyarısı */}
                {kapUyariMesaj && (
                  <div className="flex items-start gap-2 rounded-lg border border-orange-500/25 bg-orange-500/8 px-3 py-2.5 text-xs text-orange-300">
                    <span className="shrink-0 mt-0.5">🔔</span>
                    <span>{kapUyariMesaj}</span>
                  </div>
                )}

                {/* Düşük likidite uyarısı */}
                {signals.length > 0 && signals[0]?.lowLiquidity && (
                  <div className="flex items-start gap-2 rounded-lg border border-orange-500/25 bg-orange-500/8 px-3 py-2.5 text-xs text-orange-300">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <span>
                      <strong>Düşük Likidite</strong> — 20g ort. işlem hacmi{' '}
                      ₺{((signals[0].avgDailyVolumeTL ?? 0) / 1000).toFixed(0)}K/gün.
                      Seyreltik piyasada sinyaller manipülasyona açık olabilir; emirleriniz fiyatı etkileyebilir.
                    </span>
                  </div>
                )}

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
                          winRate={winRateMap.get(sig.type) ?? null}
                        />
                      ))}
                    </div>
                  )}
                </Card>

                {/* İşlem Planı — Entry / Stop / Hedef */}
                {analiz?.priceTargets && signals.length > 0 && (
                  <TradeTargetsCard
                    targets={analiz.priceTargets}
                    direction={signals[0]?.direction === 'yukari' ? 'yukari' : signals[0]?.direction === 'asagi' ? 'asagi' : 'nötr'}
                  />
                )}

                {/* AI Genel Yorumu — sol kolonda, grafikle birlikte okunur */}
                <Card>
                  <CardHeader className="py-2 px-3 pb-0">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      AI Yorumu
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <HisseAIYorum analiz={analiz} loading={analizLoading} />
                  </CardContent>
                </Card>

                {/* D2 fix: TeknikGöstergeler ve TrendÖzeti sadece sağ kolonda — duplicate kaldırıldı */}
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

                {/* Investable Edge Yatırım Skoru (kompakt) — Temel tab'a yönlendir */}
                <Card>
                  <CardHeader className="py-2 px-3 pb-0">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                      Şirket Değer Skoru
                      <span className="text-[9px] normal-case tracking-normal text-text-muted/60">
                        (Uzun Vade)
                      </span>
                      <InfoTooltip text="Şirketin temel verilerine (P/E, kâr marjı, borç, büyüme) dayalı uzun vadeli yatırım skoru. Kısa vadeli teknik analiz için Teknik Profil'e bakın." />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <InvestableScoreCard
                      sembol={sembol}
                      compact
                      onCompactClick={() => setActiveTab('temel')}
                    />
                    <p className="mt-2 text-[10px] text-text-muted/70 text-center">
                      Detaylı analiz için <button
                        onClick={() => setActiveTab('temel')}
                        className="text-primary hover:underline"
                      >Temel Veriler</button> sekmesine git
                    </p>
                  </CardContent>
                </Card>

                {/* Teknik Profil (karar değil — 5 boyutlu puan) */}
                {candles.length >= 50 && stockScore && (
                  <Card>
                    <CardHeader className="py-2 px-3 pb-0">
                      <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                        Teknik Profil
                        <span className="text-[9px] normal-case tracking-normal text-text-muted/60">(Kısa Vade)</span>
                        <InfoTooltip text="5 boyutlu teknik profil — trend/momentum/hacim/sinyal/volatilite. Fiyat hareketine bakar. Kısa vadeli (gün-hafta) işlemler için. Şirket sağlığı değil!" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3">
                      <HisseSkorKarti result={stockScore} />
                    </CardContent>
                  </Card>
                )}

                {/* Teknik Göstergeler Özeti */}
                <TeknikGostergelerOzeti candles={candles} timeframe={timeframe} />

                {/* Trend Özeti */}
                <TrendOzeti candles={candles} timeframe={timeframe} />

                {/* W4 — En Başarılı Sinyal Rozeti (Backtest öne çıkar) */}
                {bestSignalStat && (
                  <Card>
                    <CardHeader className="py-2 px-3 pb-0">
                      <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                        🏆 En Güvenilir Sinyal
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3">
                      <div className="text-center mb-2">
                        <div className={`text-3xl font-bold tabular-nums ${
                          bestSignalStat.rate >= 0.6 ? 'text-emerald-400' :
                          bestSignalStat.rate >= 0.45 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          %{Math.round(bestSignalStat.rate * 100)}
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">
                          {bestSignalStat.n} geçmiş sinyale göre
                        </p>
                      </div>
                      <div className="rounded-lg bg-surface/50 px-3 py-2 text-xs">
                        <p className="font-semibold text-text-primary truncate">
                          {bestSignalStat.sig.type}
                        </p>
                        <p className="text-[11px] text-text-secondary mt-0.5">
                          {bestSignalStat.sig.severity} · {bestSignalStat.sig.direction === 'yukari' ? '↑ AL yönlü' : bestSignalStat.sig.direction === 'asagi' ? '↓ SAT yönlü' : 'Nötr'}
                        </p>
                      </div>
                      <p className="mt-2 text-[10px] text-text-muted/70 text-center leading-snug">
                        Bu hissede aynı sinyal {bestSignalStat.n} kez tetiklendi, %{Math.round(bestSignalStat.rate * 100)} hedefe ulaştı (7 günde).
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* W1+W8 — Sektör Emsalleri */}
                {sectorInfo && peerData.length > 1 && (() => {
                  const validPeers = peerData.filter((p) => p.perf20d !== null);
                  if (validPeers.length === 0) return null;
                  const sectorAvg = validPeers.reduce((s, p) => s + (p.perf20d ?? 0), 0) / validPeers.length;
                  const myPerf = peerData.find((p) => p.sembol === sembol)?.perf20d ?? null;
                  const sortedPeers = [...peerData].sort((a, b) => (b.perf20d ?? -999) - (a.perf20d ?? -999));
                  const myRank = sortedPeers.findIndex((p) => p.sembol === sembol) + 1;

                  return (
                    <Card>
                      <CardHeader className="py-2 px-3 pb-0">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                          {sectorInfo.shortName} Sektör Emsalleri
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        {/* Sektör ortalaması vs hisse */}
                        {myPerf !== null && (
                          <div className="mb-3 rounded-lg bg-surface/50 p-2.5">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-text-secondary">{sembol} (1A)</span>
                              <span className={`font-bold font-mono ${myPerf >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {myPerf >= 0 ? '+' : ''}{myPerf.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-text-muted">Sektör Ort.</span>
                              <span className={`font-mono ${sectorAvg >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                                {sectorAvg >= 0 ? '+' : ''}{sectorAvg.toFixed(1)}%
                              </span>
                            </div>
                            <div className="mt-1.5 text-[10px] text-text-muted text-center">
                              {myPerf > sectorAvg
                                ? `Sektör ortalamasının ${(myPerf - sectorAvg).toFixed(1)}% üstünde · Sıra: ${myRank}/${peerData.length}`
                                : `Sektör ortalamasının ${(sectorAvg - myPerf).toFixed(1)}% altında · Sıra: ${myRank}/${peerData.length}`}
                            </div>
                          </div>
                        )}

                        {/* Peer listesi */}
                        <div className="space-y-1">
                          {sortedPeers.map((p) => {
                            const isMe = p.sembol === sembol;
                            const perf = p.perf20d;
                            return (
                              <Link
                                key={p.sembol}
                                href={`/hisse/${p.sembol}`}
                                className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                                  isMe
                                    ? 'bg-primary/10 border border-primary/30'
                                    : 'hover:bg-white/5 border border-transparent'
                                }`}
                              >
                                <span className={`font-mono font-semibold ${isMe ? 'text-primary' : 'text-text-primary'}`}>
                                  {p.sembol} {isMe && <span className="text-[9px] opacity-70">(siz)</span>}
                                </span>
                                <span className={`font-mono tabular-nums text-[11px] font-semibold ${
                                  perf === null ? 'text-text-muted' :
                                  perf >= 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  {perf === null ? '—' : `${perf >= 0 ? '+' : ''}${perf.toFixed(1)}%`}
                                </span>
                              </Link>
                            );
                          })}
                        </div>

                        {peerLoading && peerData.length === 0 && (
                          <p className="text-center text-[11px] text-text-muted py-2">Yükleniyor...</p>
                        )}

                        <p className="mt-3 text-[10px] text-text-muted/70 text-center">
                          1 ay performans karşılaştırması · Tıkla → hisse detayı
                        </p>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* W7 — Özel Notlar (private, localStorage) */}
                <Card>
                  <CardHeader className="py-2 px-3 pb-0">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                      <span>📝</span>
                      Özel Notlarım
                      <span className="text-[9px] normal-case tracking-normal text-text-muted/60 ml-auto">
                        Sadece sen görürsün
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    {noteEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={traderNote}
                          onChange={(e) => setTraderNote(e.target.value)}
                          placeholder="Bu hisse hakkında düşüncelerini, alış/satış planını yaz..."
                          rows={5}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none resize-none"
                          maxLength={500}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-text-muted">
                            {traderNote.length}/500
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setNoteEditing(false);
                                // localStorage'a yaz
                                saveTraderNote(traderNote);
                              }}
                              className="rounded-md bg-primary/15 border border-primary/30 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => {
                                setNoteEditing(false);
                                // Vazgeçince kaydetmiş olduğunu geri yükle
                                try {
                                  const saved = localStorage.getItem(NOTE_KEY);
                                  setTraderNote(saved ?? '');
                                } catch { /* ignore */ }
                              }}
                              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-text-muted hover:text-text-primary transition-colors"
                            >
                              İptal
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : traderNote ? (
                      <div className="space-y-2">
                        <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                          {traderNote}
                        </p>
                        <button
                          onClick={() => setNoteEditing(true)}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Düzenle
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setNoteEditing(true)}
                        className="w-full rounded-lg border border-dashed border-border px-3 py-3 text-xs text-text-muted hover:border-primary/40 hover:text-text-primary transition-colors"
                      >
                        + Bu hisse için not ekle
                      </button>
                    )}
                  </CardContent>
                </Card>
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
                  {fairValue && (
                    <Card>
                      <CardHeader className="py-2 px-3 pb-0">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">Teknik Adil Değer</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        <AdilDegerMetre result={fairValue} />
                      </CardContent>
                    </Card>
                  )}
                  {stockScore && (
                    <Card>
                      <CardHeader className="py-2 px-3 pb-0">
                        <CardTitle
                          className="text-xs font-semibold uppercase tracking-widest text-text-muted"
                          title="5 boyutlu teknik profil — trend/momentum/hacim/sinyal/volatilite. AL/SAT kararı değildir."
                        >
                          Teknik Profil <span className="text-[9px] normal-case tracking-normal text-text-muted/60">(karar değil)</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        <HisseSkorKarti result={stockScore} />
                      </CardContent>
                    </Card>
                  )}
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
                          winRate={winRateMap.get(sig.type) ?? null}
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
                    Şirket Değer Skoru
                    <span className="text-text-muted/50 normal-case tracking-normal">(Uzun Vade — Temel Veri)</span>
                    <InfoTooltip text="Şirketin temellerine dayalı uzun vadeli skor. P/E, kâr marjı, borç, büyüme metrikleri. Kısa vadeli alım-satım için Teknik Analiz sekmesine bakın." />
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
