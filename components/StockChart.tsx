'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type CandlestickData,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { OHLCVCandle, StockSignal } from '@/types';
import { calculateSRLevels } from '@/lib/support-resistance';

function calculateEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i]!;
      if (i === period - 1) ema.push(sum / period);
      else ema.push(values[i]!);
      continue;
    }
    ema.push(values[i]! * k + ema[i - 1]! * (1 - k));
  }
  return ema;
}

function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { rsi.push(50); continue; }
    const slice = closes.slice(i - period, i + 1);
    let gains = 0, losses = 0;
    for (let j = 1; j < slice.length; j++) {
      const d = slice[j]! - slice[j - 1]!;
      if (d > 0) gains += d; else losses -= d;
    }
    const avgLoss = losses / period;
    if (avgLoss === 0) { rsi.push(100); continue; }
    rsi.push(100 - 100 / (1 + (gains / period) / avgLoss));
  }
  return rsi;
}

function calculateBollingerBands(closes: number[], period = 20) {
  const upper: number[] = [], middle: number[] = [], lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(closes[i]!); middle.push(closes[i]!); lower.push(closes[i]!); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const stdev = Math.sqrt(slice.reduce((a, b) => a + (b - sma) ** 2, 0) / period);
    upper.push(sma + 2 * stdev); middle.push(sma); lower.push(sma - 2 * stdev);
  }
  return { upper, middle, lower };
}

interface LegendData {
  price?: string; ema9?: string; ema21?: string;
  rsi?: string; change?: string; changePositive?: boolean; volume?: string;
}

interface StockChartProps {
  candles: OHLCVCandle[];
  showRsi?: boolean;
  height?: number;
  className?: string;
  /** Grafikte marker olarak gösterilecek sinyaller */
  signals?: StockSignal[];
}

export function StockChart({ candles, showRsi, height, className, signals }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  // Overlay series refs — toggle'da chart yeniden oluşturulmaz
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const closesRef            = useRef<number[]>([]);
  const normalizedRef        = useRef<OHLCVCandle[]>([]);
  const bbSeriesRef          = useRef<{ upper: ISeriesApi<'Line'>; middle: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'> } | null>(null);
  const ema50SeriesRef       = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef      = useRef<ISeriesApi<'Line'> | null>(null);
  const srLinesRef           = useRef<IPriceLine[]>([]);

  const [legend, setLegend]           = useState<LegendData>({});
  const [showBB, setShowBB]           = useState(false);
  const [showEMA50200, setShowEMA50200] = useState(false);
  const [showSR, setShowSR]           = useState(false);

  const computedHeight = height ?? (typeof window !== 'undefined' && window.innerWidth < 640 ? 300 : 400);

  // ── Effect 1: Chart yarat (sadece veri / RSI / yükseklik değişince) ──────
  useEffect(() => {
    if (!containerRef.current || !candles.length) return;

    // Overlay ref'lerini temizle (yeni chart gelince eskiler geçersiz)
    bbSeriesRef.current = null;
    ema50SeriesRef.current = null;
    ema200SeriesRef.current = null;
    srLinesRef.current = [];

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#12121a' },
        textColor: '#94a3b8',
        fontFamily: 'var(--font-inter), system-ui',
      },
      grid: { vertLines: { color: '#1e1e2e' }, horzLines: { color: '#1e1e2e' } },
      rightPriceScale: {
        borderColor: '#1e1e2e',
        scaleMargins: { top: 0.08, bottom: showRsi ? 0.2 : 0.28 },
      },
      timeScale: { borderColor: '#1e1e2e', timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
      width: containerRef.current.clientWidth,
      height: computedHeight,
    });

    const toMs = (d: string | number) =>
      typeof d === 'number' ? d * 1000 : new Date(d).getTime();

    const normalized = Array.from(
      new Map(
        candles.slice().sort((a, b) => toMs(a.date) - toMs(b.date))
          .map((c) => [String(c.date), c] as const)
      ).values()
    );
    normalizedRef.current = normalized;
    const closes = normalized.map((c) => c.close);
    closesRef.current = closes;

    if (showRsi) {
      const rsiValues = calculateRSI(closes, 14);
      const lastRsi = rsiValues[rsiValues.length - 1] ?? 50;

      // RSI çizgisi — rengi değere göre değişir (OB=kırmızı, OS=yeşil, normal=indigo)
      const rsiColor = (v: number) => v >= 70 ? '#ef4444' : v <= 30 ? '#22c55e' : '#818cf8';

      const rsiSeries = chart.addLineSeries({
        color: rsiColor(lastRsi),
        lineWidth: 2,
        priceScaleId: 'right',
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      rsiSeries.setData(normalized.map((c, i) => ({ time: c.date as Time, value: rsiValues[i] ?? 50 })));

      // Sabit 0-100 aralığı
      rsiSeries.applyOptions({
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 },
        }),
      });

      // Aşırı Alım (70) — kalın kırmızı
      rsiSeries.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.7)', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' });
      // Aşırı Satım (30) — kalın yeşil
      rsiSeries.createPriceLine({ price: 30, color: 'rgba(34,197,94,0.7)', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' });
      // Orta çizgi (50) — ince gri
      rsiSeries.createPriceLine({ price: 50, color: 'rgba(255,255,255,0.12)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });
      // Mevcut RSI değeri çizgisi — dinamik konum
      const currentRsiLine = rsiSeries.createPriceLine({
        price: lastRsi,
        color: rsiColor(lastRsi),
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: '',
      });

      chart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.06, bottom: 0.06 },
        borderVisible: false,
      });

      setLegend({ rsi: lastRsi.toFixed(1) });
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          currentRsiLine.applyOptions({ price: lastRsi, color: rsiColor(lastRsi) });
          setLegend({ rsi: lastRsi.toFixed(1) });
          return;
        }
        const p = param.seriesData.get(rsiSeries);
        if (p && 'value' in p) {
          const v = p.value;
          currentRsiLine.applyOptions({ price: v, color: rsiColor(v) });
          setLegend({ rsi: v.toFixed(1) });
        }
      });
    } else {
      const cdlData: CandlestickData[] = normalized.map((c) => ({
        time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
        wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      });
      candlestickSeries.setData(cdlData);
      candlestickSeriesRef.current = candlestickSeries;

      const volumeSeries = chart.addHistogramSeries({
        priceScaleId: 'volume', color: '#6366f140', title: '',
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => {
            if (price >= 1_000_000) return (price / 1_000_000).toFixed(1) + 'M';
            if (price >= 1_000) return (price / 1_000).toFixed(0) + 'K';
            return price.toFixed(0);
          },
        },
      });
      volumeSeries.setData(normalized.map((c) => ({
        time: c.date as Time, value: c.volume ?? 0,
        color: c.close >= c.open ? '#22c55e28' : '#ef444428',
      })));
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });

      const ema9 = calculateEMA(closes, 9);
      const ema21 = calculateEMA(closes, 21);
      const ema9Series = chart.addLineSeries({ color: '#6366f1', lineWidth: 2, title: '', lastValueVisible: false, priceLineVisible: false });
      ema9Series.setData(normalized.map((c, i) => ({ time: c.date as Time, value: ema9[i] ?? c.close })));
      const ema21Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 2, title: '', lastValueVisible: false, priceLineVisible: false });
      ema21Series.setData(normalized.map((c, i) => ({ time: c.date as Time, value: ema21[i] ?? c.close })));

      const lastCandle = normalized[normalized.length - 1];
      const lastE9 = ema9[ema9.length - 1];
      const lastE21 = ema21[ema21.length - 1];
      if (lastCandle) {
        const chg = ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100;
        setLegend({ price: lastCandle.close.toFixed(2), ema9: lastE9?.toFixed(2), ema21: lastE21?.toFixed(2), change: chg.toFixed(2), changePositive: chg >= 0, volume: lastCandle.volume ? (lastCandle.volume / 1_000).toFixed(0) + 'K' : undefined });
      }

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          if (lastCandle) {
            const chg = ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100;
            setLegend({ price: lastCandle.close.toFixed(2), ema9: lastE9?.toFixed(2), ema21: lastE21?.toFixed(2), change: chg.toFixed(2), changePositive: chg >= 0, volume: lastCandle.volume ? (lastCandle.volume / 1_000).toFixed(0) + 'K' : undefined });
          }
          return;
        }
        const cdlP = param.seriesData.get(candlestickSeries);
        const e9P  = param.seriesData.get(ema9Series);
        const e21P = param.seriesData.get(ema21Series);
        const volP = param.seriesData.get(volumeSeries);
        const nl: LegendData = {};
        if (cdlP && 'close' in cdlP) { nl.price = cdlP.close.toFixed(2); const chg = ((cdlP.close - cdlP.open) / cdlP.open) * 100; nl.change = chg.toFixed(2); nl.changePositive = chg >= 0; }
        if (e9P && 'value' in e9P) nl.ema9 = e9P.value.toFixed(2);
        if (e21P && 'value' in e21P) nl.ema21 = e21P.value.toFixed(2);
        if (volP && 'value' in volP) nl.volume = (volP.value / 1_000).toFixed(0) + 'K';
        setLegend(nl);
      });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
    };
  }, [candles, showRsi, computedHeight]);

  // ── Effect 2: BB overlay — chart sıfırlanmaz ─────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const nc    = normalizedRef.current;
    const cls   = closesRef.current;
    if (!chart || !nc.length || showRsi) return;

    if (showBB) {
      if (bbSeriesRef.current) return;
      const bb = calculateBollingerBands(cls, 20);
      const upper  = chart.addLineSeries({ color: 'rgba(99,102,241,0.55)', lineWidth: 1, lineStyle: 2, title: '', lastValueVisible: false, priceLineVisible: false });
      upper.setData(nc.map((c, i) => ({ time: c.date as Time, value: bb.upper[i] ?? c.close })));
      const middle = chart.addLineSeries({ color: 'rgba(148,163,184,0.35)', lineWidth: 1, lineStyle: 1, title: '', lastValueVisible: false, priceLineVisible: false });
      middle.setData(nc.map((c, i) => ({ time: c.date as Time, value: bb.middle[i] ?? c.close })));
      const lower  = chart.addLineSeries({ color: 'rgba(99,102,241,0.55)', lineWidth: 1, lineStyle: 2, title: '', lastValueVisible: false, priceLineVisible: false });
      lower.setData(nc.map((c, i) => ({ time: c.date as Time, value: bb.lower[i] ?? c.close })));
      bbSeriesRef.current = { upper, middle, lower };
    } else {
      if (bbSeriesRef.current) {
        chart.removeSeries(bbSeriesRef.current.upper);
        chart.removeSeries(bbSeriesRef.current.middle);
        chart.removeSeries(bbSeriesRef.current.lower);
        bbSeriesRef.current = null;
      }
    }
  }, [showBB, showRsi]);

  // ── Effect 3: EMA 50/200 overlay ─────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const nc    = normalizedRef.current;
    const cls   = closesRef.current;
    if (!chart || !nc.length || showRsi) return;

    if (showEMA50200) {
      if (ema50SeriesRef.current) return;
      if (cls.length >= 50) {
        const ema50 = calculateEMA(cls, 50);
        const s50 = chart.addLineSeries({ color: '#10b981', lineWidth: 1, title: '', lastValueVisible: false, priceLineVisible: false });
        s50.setData(nc.map((c, i) => ({ time: c.date as Time, value: ema50[i] ?? c.close })));
        ema50SeriesRef.current = s50;
        if (cls.length >= 200) {
          const ema200 = calculateEMA(cls, 200);
          const s200 = chart.addLineSeries({ color: '#f43f5e', lineWidth: 1, title: '', lastValueVisible: false, priceLineVisible: false });
          s200.setData(nc.map((c, i) => ({ time: c.date as Time, value: ema200[i] ?? c.close })));
          ema200SeriesRef.current = s200;
        }
      }
    } else {
      if (ema50SeriesRef.current)  { chart.removeSeries(ema50SeriesRef.current);  ema50SeriesRef.current  = null; }
      if (ema200SeriesRef.current) { chart.removeSeries(ema200SeriesRef.current); ema200SeriesRef.current = null; }
    }
  }, [showEMA50200, showRsi]);

  // ── Effect 4: Destek/Direnç price line'ları ───────────────────────────────
  useEffect(() => {
    const cdlSeries = candlestickSeriesRef.current;
    if (!cdlSeries || showRsi) return;

    // Mevcut çizgileri kaldır
    srLinesRef.current.forEach((l) => { try { cdlSeries.removePriceLine(l); } catch { /* ignore */ } });
    srLinesRef.current = [];

    if (showSR) {
      const sr = calculateSRLevels(candles, 90, 3);
      sr.resistances.forEach((r) => {
        const line = cdlSeries.createPriceLine({
          price: r.price,
          color: `rgba(239,68,68,${0.45 + r.strength * 0.1})`,
          lineWidth: 2, lineStyle: 0, axisLabelVisible: false, title: '↔ D',
        });
        srLinesRef.current.push(line);
      });
      sr.supports.forEach((s) => {
        const line = cdlSeries.createPriceLine({
          price: s.price,
          color: `rgba(34,197,94,${0.45 + s.strength * 0.1})`,
          lineWidth: 2, lineStyle: 0, axisLabelVisible: false, title: '↔ S',
        });
        srLinesRef.current.push(line);
      });
    }
  }, [showSR, candles, showRsi]);

  // ── Effect 5: Sinyal marker'ları ─────────────────────────────────────────
  useEffect(() => {
    const cdlSeries = candlestickSeriesRef.current;
    const nc = normalizedRef.current;
    if (!cdlSeries || showRsi || !nc.length) return;

    if (!signals?.length) {
      cdlSeries.setMarkers([]);
      return;
    }

    const lastTime = nc[nc.length - 1]!.date as Time;

    // Sadece dominant sinyali göster — en güçlü olanı seç
    const sevMap: Record<string, number> = { 'güçlü': 2, 'orta': 1, 'zayıf': 0 };
    const dominant = [...signals].sort(
      (a, b) => (sevMap[b.severity] ?? 0) - (sevMap[a.severity] ?? 0)
    )[0]!;

    const isDown = dominant.direction === 'asagi';
    const isUp   = dominant.direction === 'yukari';

    const shortNames: Record<string, string> = {
      'RSI Uyumsuzluğu': 'RSI Div',
      'Hacim Anomalisi': 'Hacim',
      'Trend Başlangıcı': 'Trend',
      'Destek/Direnç Kırılımı': 'S/R Kırılım',
      'MACD Kesişimi': 'MACD',
      'Altın Çapraz': 'Golden X',
      'Ölüm Çaprazı': 'Death X',
      'Bollinger Sıkışması': 'BB Sıkışma',
      'RSI Seviyesi': 'RSI',
    };
    const label = signals.length > 1
      ? `${signals.length} sinyal`
      : (shortNames[dominant.type] ?? dominant.type);

    cdlSeries.setMarkers([{
      time:     lastTime,
      position: isDown ? 'aboveBar' : 'belowBar',
      shape:    isDown ? 'arrowDown' : isUp ? 'arrowUp' : 'circle',
      color:    isDown ? '#ef4444' : isUp ? '#22c55e' : '#94a3b8',
      text:     label,
      size:     2,
    }]);
  }, [signals, showRsi]);

  if (!candles.length) return null;

  const rsiVal = legend.rsi ? parseFloat(legend.rsi) : 50;
  const rsiColor = rsiVal >= 70 ? '#ef4444' : rsiVal <= 30 ? '#22c55e' : '#818cf8';
  const rsiZone  = rsiVal >= 70 ? 'Aşırı Alım' : rsiVal <= 30 ? 'Aşırı Satım' : '';

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      {/* ── İndikatör Araç Çubuğu ──────────────────────────────────────── */}
      {!showRsi && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-[11px] text-text-secondary/60 select-none">İndikatör:</span>
          <button
            type="button"
            onClick={() => setShowBB((v) => !v)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${showBB ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50' : 'text-text-secondary hover:text-text-primary hover:bg-surface-alt'}`}
          >
            BB
          </button>
          <button
            type="button"
            onClick={() => setShowEMA50200((v) => !v)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${showEMA50200 ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50' : 'text-text-secondary hover:text-text-primary hover:bg-surface-alt'}`}
          >
            EMA 50/200
          </button>
          <button
            type="button"
            onClick={() => setShowSR((v) => !v)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${showSR ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50' : 'text-text-secondary hover:text-text-primary hover:bg-surface-alt'}`}
          >
            Destek/Direnç
          </button>

          <div className="ml-auto flex items-center gap-3 text-[10px] text-text-secondary/60 select-none">
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-indigo-400 rounded" />EMA9</span>
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-amber-400 rounded" />EMA21</span>
            {showBB        && <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed border-indigo-400/60" />BB</span>}
            {showEMA50200  && <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-emerald-400 rounded" />EMA50</span>}
            {showEMA50200  && <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-rose-400 rounded" />EMA200</span>}
            {showSR        && <span className="flex items-center gap-1"><span className="inline-block h-2 w-0.5 bg-red-400 rounded" /><span className="inline-block h-2 w-0.5 bg-emerald-400 rounded" />D/R</span>}
          </div>
        </div>
      )}

      {/* ── Grafik + Legend ──────────────────────────────────────────────── */}
      <div className="relative">
        <div className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-background/80 px-2 py-1 text-xs backdrop-blur-sm">
          {showRsi ? (
            <>
              <span className="text-text-secondary/60">RSI(14)</span>
              <span className="font-mono font-semibold" style={{ color: rsiColor }}>{legend.rsi ?? '—'}</span>
              {rsiZone && <span className="text-[10px] font-medium" style={{ color: rsiColor + 'bb' }}>{rsiZone}</span>}
            </>
          ) : (
            <>
              {legend.price  && <><span className="text-text-secondary">Fiyat</span><span className="font-mono font-medium text-text-primary">{legend.price}</span></>}
              {legend.change && <span className={`font-mono font-medium ${legend.changePositive ? 'text-bullish' : 'text-bearish'}`}>{legend.changePositive ? '+' : ''}{legend.change}%</span>}
              {legend.ema9   && <><span className="text-indigo-400">EMA9</span><span className="font-mono text-indigo-400">{legend.ema9}</span></>}
              {legend.ema21  && <><span className="text-amber-400">EMA21</span><span className="font-mono text-amber-400">{legend.ema21}</span></>}
              {legend.volume && <><span className="text-text-secondary/60">Hacim</span><span className="font-mono text-text-secondary/80">{legend.volume}</span></>}
            </>
          )}
        </div>

        <div
          ref={containerRef}
          className="w-full"
          role="img"
          aria-label={showRsi ? 'RSI göstergesi grafiği' : 'Hisse fiyat grafiği'}
        />
      </div>
    </div>
  );
}
