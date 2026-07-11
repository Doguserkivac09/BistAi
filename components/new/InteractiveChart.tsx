'use client';

/**
 * InteractiveChart — TradingView-benzeri "pro" grafik (lightweight-charts, kendi verimiz).
 *
 * Özellikler:
 *  - Grafik tipi: mum / çizgi / alan
 *  - İndikatörler: EMA9/21, Bollinger, EMA50/200, RSI (ayrı panel), MACD (ayrı panel), hacim
 *  - Çizim araçları: trend çizgisi, yatay çizgi, fibonacci, dikdörtgen, metin (canvas overlay,
 *    veri-koordinatına sabit → pan/zoom'da yerinde kalır) + magnet + seçim/sil/temizle
 *  - localStorage kalıcılığı (sembol başına) + tam ekran
 *  - Açık/karanlık tema (ThemeProvider) veya themeOverride
 *
 * Veri: `candles` prop'undan ya da `symbol` ile /api/ohlcv'den. Lisans/harici bağımlılık YOK.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, ColorType, LineStyle, CrosshairMode,
  type IChartApi, type ISeriesApi, type Time, type Logical,
  type CandlestickData, type LineData, type AreaData,
} from 'lightweight-charts';
import type { OHLCVCandle } from '@/types';
import { useTheme } from '@/components/ThemeProvider';
import { calculateEMA, calculateBollingerBands, calculateRSI, calculateMACD } from '@/lib/indicators';
import { calculateSRLevels } from '@/lib/support-resistance';
import {
  loadDrawings, saveDrawings, newDrawingId, FIB_LEVELS,
  type Drawing, type DrawTool, type Anchor,
} from '@/lib/chart-drawings';

const TOK = { up: '#16a35b', down: '#e5484d', ai: '#6b6ff5', ema9: '#6366f1', ema21: '#f59e0b', ema50: '#10b981', ema200: '#f43f5e' };

type ChartType = 'candle' | 'line' | 'area';

interface Theme { bg: string; text: string; grid: string; border: string; }
function themeColors(t: 'light' | 'dark'): Theme {
  return t === 'dark'
    ? { bg: 'transparent', text: '#9aa4b2', grid: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)' }
    : { bg: 'transparent', text: '#5b6472', grid: 'rgba(0,0,0,0.05)', border: 'rgba(0,0,0,0.10)' };
}

interface InteractiveChartProps {
  candles?: OHLCVCandle[];
  symbol?: string;
  timeframe?: string;
  height?: number;
  themeOverride?: 'light' | 'dark';
}

const DRAW_TOOLS: { key: DrawTool; label: string; icon: string }[] = [
  { key: 'cursor', label: 'İmleç', icon: '↖' },
  { key: 'trend', label: 'Trend çizgisi', icon: '╱' },
  { key: 'hline', label: 'Yatay çizgi', icon: '─' },
  { key: 'fib', label: 'Fibonacci', icon: '≣' },
  { key: 'rect', label: 'Dikdörtgen', icon: '▭' },
  { key: 'text', label: 'Metin', icon: 'T' },
];

export function InteractiveChart({ candles: candlesProp, symbol, timeframe = '1d', height = 460, themeOverride }: InteractiveChartProps) {
  const { theme: ctxTheme } = useTheme();
  const theme = themeOverride ?? ctxTheme;
  const C = themeColors(theme);

  // ── Veri ──
  const [candles, setCandles] = useState<OHLCVCandle[]>(candlesProp ?? []);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (candlesProp) setCandles(candlesProp); }, [candlesProp]);
  useEffect(() => {
    if (candlesProp || !symbol) return;
    let cancelled = false; setLoading(true);
    fetch(`/api/ohlcv?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`)
      .then((r) => r.json())
      .then((d: { candles?: OHLCVCandle[] }) => { if (!cancelled) setCandles(d.candles ?? []); })
      .catch(() => { if (!cancelled) setCandles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, timeframe, candlesProp]);

  // Normalize + dedupe + sort
  const norm = useMemo(() => {
    const toMs = (d: string | number) => typeof d === 'number' ? d * 1000 : new Date(d).getTime();
    return Array.from(new Map(
      candles.slice().sort((a, b) => toMs(a.date) - toMs(b.date)).map((c) => [String(c.date), c] as const),
    ).values());
  }, [candles]);
  const timeIndex = useMemo(() => {
    const m = new Map<string, number>();
    norm.forEach((c, i) => m.set(String(c.date), i));
    return m;
  }, [norm]);

  // ── UI durumu ──
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [ind, setInd] = useState({ ema: true, bb: false, ema50200: false, sr: false, rsi: false, macd: false });
  const [tool, setTool] = useState<DrawTool>('cursor');
  const [magnet, setMagnet] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legend, setLegend] = useState<{ price?: string; change?: string; up?: boolean }>({});
  const [textInput, setTextInput] = useState<{ x: number; y: number; anchor: Anchor } | null>(null);

  // ── Refs ──
  const mainRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | null>(null);
  const syncingRef = useRef(false);
  const drawingsRef = useRef<Drawing[]>([]);
  const draftRef = useRef<{ tool: DrawTool; a: Anchor; b: Anchor } | null>(null);
  drawingsRef.current = drawings;

  // ── Kalıcılık ──
  useEffect(() => {
    if (symbol) setDrawings(loadDrawings(symbol));
  }, [symbol]);
  const persist = useCallback((next: Drawing[]) => {
    setDrawings(next);
    if (symbol) saveDrawings(symbol, next);
  }, [symbol]);

  // ── Koordinat yardımcıları ──
  const anchorToX = useCallback((a: Anchor): number | null => {
    const chart = chartRef.current; if (!chart) return null;
    const idx = timeIndex.get(String(a.time));
    if (idx == null) return null;
    return chart.timeScale().logicalToCoordinate(idx as Logical);
  }, [timeIndex]);
  const priceToY = useCallback((price: number): number | null => {
    return priceSeriesRef.current?.priceToCoordinate(price) ?? null;
  }, []);
  const xyToAnchor = useCallback((x: number, y: number, useMagnet: boolean): Anchor | null => {
    const chart = chartRef.current, series = priceSeriesRef.current;
    if (!chart || !series) return null;
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical == null) return null;
    const idx = Math.max(0, Math.min(norm.length - 1, Math.round(logical as number)));
    const c = norm[idx]; if (!c) return null;
    let price = series.coordinateToPrice(y) ?? c.close;
    if (useMagnet) {
      const cands = [c.open, c.high, c.low, c.close];
      price = cands.reduce((best, v) => Math.abs(v - price) < Math.abs(best - price) ? v : best, cands[0]!);
    }
    return { time: c.date, price };
  }, [norm]);

  // ── Overlay çizim ──
  const rightAxisW = () => { try { return chartRef.current?.priceScale('right').width() ?? 0; } catch { return 0; } };

  const redraw = useCallback(() => {
    const cv = overlayRef.current; const chart = chartRef.current;
    if (!cv || !chart) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const paneR = Math.max(0, w - rightAxisW());

    const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string, width = 1.5, dash: number[] = []) => {
      ctx.beginPath(); ctx.setLineDash(dash); ctx.lineWidth = width; ctx.strokeStyle = color;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    };

    const all = [...drawingsRef.current];
    // taslak (çizim sürerken)
    const draft = draftRef.current;
    for (const d of all) {
      const sel = d.id === selectedId;
      const col = sel ? '#3b82f6' : d.color;
      if (d.tool === 'hline') {
        const y = priceToY(d.price); if (y == null) continue;
        drawLine(0, y, paneR, y, col, sel ? 2 : 1.5, [6, 4]);
        ctx.fillStyle = col; ctx.font = '10px monospace'; ctx.fillText(d.price.toFixed(2), 4, y - 3);
      } else if (d.tool === 'trend') {
        const x1 = anchorToX(d.a), y1 = priceToY(d.a.price), x2 = anchorToX(d.b), y2 = priceToY(d.b.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        drawLine(x1, y1, x2, y2, col, sel ? 2.5 : 1.8);
        if (sel) { for (const [px, py] of [[x1, y1], [x2, y2]] as const) { ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill(); } }
      } else if (d.tool === 'rect') {
        const x1 = anchorToX(d.a), y1 = priceToY(d.a.price), x2 = anchorToX(d.b), y2 = priceToY(d.b.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        ctx.fillStyle = col + '20'; ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.4;
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      } else if (d.tool === 'fib') {
        const x1 = anchorToX(d.a), x2 = anchorToX(d.b);
        if (x1 == null || x2 == null) continue;
        const p1 = d.a.price, p2 = d.b.price;
        const xl = Math.min(x1, x2), xr = Math.max(x1, x2);
        for (const lv of FIB_LEVELS) {
          const price = p1 + (p2 - p1) * (1 - lv); // 0=başlangıç(p1), 1=bitiş(p2)
          const y = priceToY(price); if (y == null) continue;
          drawLine(xl, y, paneR, y, col, sel ? 1.6 : 1, lv === 0 || lv === 1 ? [] : [3, 3]);
          ctx.fillStyle = col; ctx.font = '9px monospace';
          ctx.fillText(`${(lv * 100).toFixed(1)}%  ${price.toFixed(2)}`, xr + 4 > paneR ? xl + 4 : xr + 4, y - 2);
        }
      } else if (d.tool === 'text') {
        const x = anchorToX(d.at), y = priceToY(d.at.price);
        if (x == null || y == null) continue;
        ctx.fillStyle = col; ctx.font = sel ? 'bold 13px sans-serif' : '13px sans-serif';
        ctx.fillText(d.text, x, y);
        if (sel) { ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; const tw = ctx.measureText(d.text).width; ctx.strokeRect(x - 2, y - 13, tw + 4, 18); }
      }
    }
    // taslak
    if (draft) {
      const x1 = anchorToX(draft.a), y1 = priceToY(draft.a.price), x2 = anchorToX(draft.b), y2 = priceToY(draft.b.price);
      if (x1 != null && y1 != null && x2 != null && y2 != null) {
        if (draft.tool === 'rect') { ctx.strokeStyle = TOK.ai; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.4; ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.setLineDash([]); }
        else drawLine(x1, y1, x2, y2, TOK.ai, 1.4, [4, 3]);
      }
    }
  }, [anchorToX, priceToY, selectedId]);

  // ── Ana grafik kurulumu ──
  useEffect(() => {
    if (!mainRef.current || !norm.length) return;
    const prevRange = chartRef.current?.timeScale().getVisibleLogicalRange();

    const chart = createChart(mainRef.current, {
      layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: 'var(--font-manrope), system-ui' },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.1, bottom: 0.24 } },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: tool === 'cursor' ? CrosshairMode.Normal : CrosshairMode.Magnet, vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
      width: mainRef.current.clientWidth,
      height,
    });

    let priceSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'>;
    if (chartType === 'candle') {
      const s = chart.addCandlestickSeries({ upColor: TOK.up, downColor: TOK.down, borderVisible: false, wickUpColor: TOK.up, wickDownColor: TOK.down });
      s.setData(norm.map((c): CandlestickData => ({ time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
      priceSeries = s;
    } else if (chartType === 'line') {
      const s = chart.addLineSeries({ color: TOK.ai, lineWidth: 2, priceLineVisible: false });
      s.setData(norm.map((c): LineData => ({ time: c.date as Time, value: c.close })));
      priceSeries = s;
    } else {
      const s = chart.addAreaSeries({ lineColor: TOK.ai, topColor: TOK.ai + '55', bottomColor: TOK.ai + '05', lineWidth: 2, priceLineVisible: false });
      s.setData(norm.map((c): AreaData => ({ time: c.date as Time, value: c.close })));
      priceSeries = s;
    }
    priceSeriesRef.current = priceSeries;

    // Hacim
    const vol = chart.addHistogramSeries({ priceScaleId: 'volume', color: TOK.ai + '40', priceFormat: { type: 'custom', formatter: (p: number) => p >= 1e6 ? (p / 1e6).toFixed(1) + 'M' : p >= 1e3 ? (p / 1e3).toFixed(0) + 'K' : p.toFixed(0) } });
    vol.setData(norm.map((c) => ({ time: c.date as Time, value: c.volume ?? 0, color: c.close >= c.open ? TOK.up + '28' : TOK.down + '28' })));
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });

    const closes = norm.map((c) => c.close);
    // EMA9/21
    if (ind.ema) {
      const e9 = calculateEMA(closes, 9), e21 = calculateEMA(closes, 21);
      const s9 = chart.addLineSeries({ color: TOK.ema9, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s9.setData(norm.map((c, i) => ({ time: c.date as Time, value: e9[i] ?? c.close })));
      const s21 = chart.addLineSeries({ color: TOK.ema21, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s21.setData(norm.map((c, i) => ({ time: c.date as Time, value: e21[i] ?? c.close })));
    }
    // BB
    if (ind.bb) {
      const bb = calculateBollingerBands(closes, 20);
      for (const [key, style] of [['upper', 2], ['middle', 1], ['lower', 2]] as const) {
        const s = chart.addLineSeries({ color: key === 'middle' ? 'rgba(148,163,184,0.4)' : 'rgba(99,102,241,0.5)', lineWidth: 1, lineStyle: style as LineStyle, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(norm.map((c, i) => ({ time: c.date as Time, value: bb[key][i] ?? c.close })));
      }
    }
    // EMA50/200
    if (ind.ema50200) {
      if (closes.length >= 50) { const e50 = calculateEMA(closes, 50); const s = chart.addLineSeries({ color: TOK.ema50, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData(norm.map((c, i) => ({ time: c.date as Time, value: e50[i] ?? c.close }))); }
      if (closes.length >= 200) { const e200 = calculateEMA(closes, 200); const s = chart.addLineSeries({ color: TOK.ema200, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData(norm.map((c, i) => ({ time: c.date as Time, value: e200[i] ?? c.close }))); }
    }
    // S/R
    if (ind.sr && chartType === 'candle') {
      const sr = calculateSRLevels(norm, 90, 3);
      sr.resistances.forEach((r) => priceSeries.createPriceLine({ price: r.price, color: `rgba(239,68,68,${0.4 + r.strength * 0.1})`, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: 'D' }));
      sr.supports.forEach((s) => priceSeries.createPriceLine({ price: s.price, color: `rgba(34,197,94,${0.4 + s.strength * 0.1})`, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: 'S' }));
    }

    const last = norm[norm.length - 1];
    if (last) { const chg = ((last.close - last.open) / last.open) * 100; setLegend({ price: last.close.toFixed(2), change: chg.toFixed(2), up: chg >= 0 }); }
    chart.subscribeCrosshairMove((param) => {
      const p = param.seriesData.get(priceSeries) as { close?: number; value?: number; open?: number } | undefined;
      if (p) { const close = p.close ?? p.value; if (close != null) { const open = p.open ?? close; const chg = ((close - open) / open) * 100; setLegend({ price: close.toFixed(2), change: chg.toFixed(2), up: chg >= 0 }); } }
    });

    if (prevRange) chart.timeScale().setVisibleLogicalRange(prevRange); else chart.timeScale().fitContent();
    chartRef.current = chart;

    // Overlay yeniden çizim tetikleyicileri
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => redraw());
    const ro = new ResizeObserver(() => { chart.applyOptions({ width: mainRef.current!.clientWidth }); redraw(); });
    ro.observe(mainRef.current);
    // ilk çizim
    requestAnimationFrame(redraw);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; priceSeriesRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [norm, chartType, theme, height, ind.ema, ind.bb, ind.ema50200, ind.sr]);

  // Seçim değişince yeniden çiz
  useEffect(() => { redraw(); }, [drawings, selectedId, redraw]);

  // ── RSI paneli ──
  useEffect(() => {
    if (!ind.rsi || !rsiRef.current || !norm.length) return;
    const rsi = calculateRSI(norm.map((c) => c.close), 14);
    const chart = createChart(rsiRef.current, {
      layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: 'var(--font-manrope), system-ui' },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border }, timeScale: { borderColor: C.border, visible: false },
      width: rsiRef.current.clientWidth, height: 110,
    });
    const s = chart.addLineSeries({ color: TOK.ema9, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
    s.setData(norm.map((c, i) => ({ time: c.date as Time, value: rsi[i] ?? 50 })));
    s.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    s.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.6)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
    s.createPriceLine({ price: 30, color: 'rgba(34,197,94,0.6)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
    syncRange(chart);
    const ro = new ResizeObserver(() => chart.applyOptions({ width: rsiRef.current!.clientWidth }));
    ro.observe(rsiRef.current);
    return () => { ro.disconnect(); chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ind.rsi, norm, theme]);

  // ── MACD paneli ──
  useEffect(() => {
    if (!ind.macd || !macdRef.current || !norm.length) return;
    const { macd, signal, histogram } = calculateMACD(norm.map((c) => c.close));
    const chart = createChart(macdRef.current, {
      layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: 'var(--font-manrope), system-ui' },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border }, timeScale: { borderColor: C.border, visible: false },
      width: macdRef.current.clientWidth, height: 110,
    });
    const hist = chart.addHistogramSeries({ priceLineVisible: false });
    hist.setData(norm.map((c, i) => ({ time: c.date as Time, value: histogram[i] ?? 0, color: (histogram[i] ?? 0) >= 0 ? TOK.up + '99' : TOK.down + '99' })));
    const mS = chart.addLineSeries({ color: TOK.ema9, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    mS.setData(norm.map((c, i) => ({ time: c.date as Time, value: macd[i] ?? 0 })));
    const sS = chart.addLineSeries({ color: TOK.ema21, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    sS.setData(norm.map((c, i) => ({ time: c.date as Time, value: signal[i] ?? 0 })));
    syncRange(chart);
    const ro = new ResizeObserver(() => chart.applyOptions({ width: macdRef.current!.clientWidth }));
    ro.observe(macdRef.current);
    return () => { ro.disconnect(); chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ind.macd, norm, theme]);

  // Alt panelleri ana grafikle zaman-senkronla
  function syncRange(sub: IChartApi) {
    const main = chartRef.current; if (!main) return;
    const apply = (from: IChartApi, to: IChartApi) => {
      if (syncingRef.current) return;
      const r = from.timeScale().getVisibleLogicalRange(); if (!r) return;
      syncingRef.current = true; try { to.timeScale().setVisibleLogicalRange(r); } finally { syncingRef.current = false; }
    };
    const r0 = main.timeScale().getVisibleLogicalRange(); if (r0) sub.timeScale().setVisibleLogicalRange(r0);
    main.timeScale().subscribeVisibleLogicalRangeChange(() => apply(main, sub));
    sub.timeScale().subscribeVisibleLogicalRangeChange(() => apply(sub, main));
  }

  // ── Overlay fare olayları ──
  const onOverlayDown = (e: React.MouseEvent) => {
    if (tool === 'cursor') { hitTestSelect(e); return; }
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const a = xyToAnchor(x, y, magnet); if (!a) return;
    if (tool === 'hline') { persist([...drawingsRef.current, { id: newDrawingId(), tool: 'hline', color: TOK.ai, price: a.price }]); setTool('cursor'); return; }
    if (tool === 'text') { setTextInput({ x, y, anchor: a }); return; }
    draftRef.current = { tool, a, b: a }; redraw();
  };
  const onOverlayMove = (e: React.MouseEvent) => {
    if (!draftRef.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const a = xyToAnchor(e.clientX - rect.left, e.clientY - rect.top, magnet); if (!a) return;
    draftRef.current.b = a; redraw();
  };
  const onOverlayUp = () => {
    const d = draftRef.current; if (!d) return;
    draftRef.current = null;
    if (d.tool === 'trend' || d.tool === 'fib' || d.tool === 'rect') {
      persist([...drawingsRef.current, { id: newDrawingId(), tool: d.tool, color: TOK.ai, a: d.a, b: d.b } as Drawing]);
    }
    setTool('cursor'); redraw();
  };
  const hitTestSelect = (e: React.MouseEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let found: string | null = null;
    for (const d of [...drawingsRef.current].reverse()) {
      if (d.tool === 'hline') { const y = priceToY(d.price); if (y != null && Math.abs(y - my) < 6) { found = d.id; break; } }
      else if (d.tool === 'trend') { const x1 = anchorToX(d.a), y1 = priceToY(d.a.price), x2 = anchorToX(d.b), y2 = priceToY(d.b.price); if (x1 != null && y1 != null && x2 != null && y2 != null && distToSeg(mx, my, x1, y1, x2, y2) < 6) { found = d.id; break; } }
      else if (d.tool === 'rect' || d.tool === 'fib') { const x1 = anchorToX(d.a), y1 = priceToY(d.a.price), x2 = anchorToX(d.b), y2 = priceToY(d.b.price); if (x1 != null && y1 != null && x2 != null && y2 != null && mx >= Math.min(x1, x2) - 4 && mx <= Math.max(x1, x2) + 4 && my >= Math.min(y1, y2) - 4 && my <= Math.max(y1, y2) + 4) { found = d.id; break; } }
      else if (d.tool === 'text') { const x = anchorToX(d.at), y = priceToY(d.at.price); if (x != null && y != null && Math.abs(x - mx) < 40 && Math.abs(y - my) < 12) { found = d.id; break; } }
    }
    setSelectedId(found);
  };

  const deleteSelected = () => { if (!selectedId) return; persist(drawingsRef.current.filter((d) => d.id !== selectedId)); setSelectedId(null); };
  const clearAll = () => { persist([]); setSelectedId(null); };

  // Delete tuşu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !textInput) deleteSelected(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, textInput]);

  const commitText = (text: string) => {
    if (textInput && text.trim()) persist([...drawingsRef.current, { id: newDrawingId(), tool: 'text', color: theme === 'dark' ? '#fff' : '#111', at: textInput.anchor, text: text.trim() }]);
    setTextInput(null); setTool('cursor');
  };

  const toggle = (k: keyof typeof ind) => setInd((s) => ({ ...s, [k]: !s[k] }));

  const btn = (active: boolean) => `rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${active ? 'bg-ink text-onink' : 'text-t3 hover:text-ink hover:bg-fill'}`;

  return (
    <div className={fullscreen ? 'fixed inset-0 z-[120] flex flex-col bg-panel p-3' : 'w-full'}>
      {/* Üst araç çubuğu */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {/* Grafik tipi */}
        <div className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5">
          {([['candle', 'Mum'], ['line', 'Çizgi'], ['area', 'Alan']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setChartType(k)} className={btn(chartType === k)}>{l}</button>
          ))}
        </div>
        {/* İndikatörler */}
        <div className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5">
          {([['ema', 'EMA'], ['bb', 'BB'], ['ema50200', 'EMA50/200'], ['sr', 'S/R'], ['rsi', 'RSI'], ['macd', 'MACD']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => toggle(k)} className={btn(ind[k])}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={() => setFullscreen((v) => !v)} className={`ml-auto ${btn(fullscreen)}`} title="Tam ekran">
          {fullscreen ? '✕ Kapat' : '⛶ Tam ekran'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-1.5">
        {/* Sol çizim araç çubuğu */}
        <div className="flex flex-col gap-0.5 rounded-lg border border-hairline p-1">
          {DRAW_TOOLS.map((t) => (
            <button key={t.key} type="button" title={t.label} onClick={() => { setTool(t.key); setSelectedId(null); }}
              className={`h-7 w-7 rounded-md text-[13px] font-bold transition-colors ${tool === t.key ? 'bg-ink text-onink' : 'text-t2 hover:bg-fill'}`}>
              {t.icon}
            </button>
          ))}
          <div className="my-0.5 h-px bg-hairline" />
          <button type="button" title="Magnet (OHLC'ye yapış)" onClick={() => setMagnet((v) => !v)}
            className={`h-7 w-7 rounded-md text-[13px] transition-colors ${magnet ? 'bg-ai text-white' : 'text-t2 hover:bg-fill'}`}>🧲</button>
          <button type="button" title="Seçili çizimi sil" onClick={deleteSelected} disabled={!selectedId}
            className="h-7 w-7 rounded-md text-[13px] text-t2 hover:bg-fill disabled:opacity-30">🗑</button>
          <button type="button" title="Tüm çizimleri temizle" onClick={clearAll} disabled={!drawings.length}
            className="h-7 w-7 rounded-md text-[11px] text-t2 hover:bg-fill disabled:opacity-30">⌫</button>
        </div>

        {/* Grafik alanı */}
        <div className="min-w-0 flex-1">
          <div className="relative w-full" style={{ height }}>
            <div ref={mainRef} className="h-full w-full" />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 h-full w-full"
              style={{ pointerEvents: tool === 'cursor' && !selectedId ? 'none' : 'auto', cursor: tool === 'cursor' ? 'default' : 'crosshair' }}
              onMouseDown={onOverlayDown} onMouseMove={onOverlayMove} onMouseUp={onOverlayUp}
            />
            {/* İmleç modunda seçim için overlay tıklanabilir kalsın */}
            {tool === 'cursor' && (
              <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />
            )}
            {/* Legend */}
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2 rounded bg-panel/80 px-2 py-1 text-xs backdrop-blur">
              {legend.price && <span className="font-mono font-semibold text-ink">{legend.price}</span>}
              {legend.change && <span className={`font-mono ${legend.up ? 'text-up' : 'text-down'}`}>{legend.up ? '+' : ''}{legend.change}%</span>}
              {loading && <span className="text-t3">yükleniyor…</span>}
            </div>
            {/* Metin girişi */}
            {textInput && (
              <input
                autoFocus
                className="absolute z-20 rounded border border-ai bg-panel px-1 text-[13px] text-ink outline-none"
                style={{ left: textInput.x, top: textInput.y - 10, width: 140 }}
                placeholder="Metin…"
                onKeyDown={(e) => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value); if (e.key === 'Escape') { setTextInput(null); setTool('cursor'); } }}
                onBlur={(e) => commitText(e.target.value)}
              />
            )}
          </div>
          {ind.rsi && <div className="mt-1"><div className="mb-0.5 text-[10px] font-semibold text-t4">RSI (14)</div><div ref={rsiRef} className="w-full" style={{ height: 110 }} /></div>}
          {ind.macd && <div className="mt-1"><div className="mb-0.5 text-[10px] font-semibold text-t4">MACD (12/26/9)</div><div ref={macdRef} className="w-full" style={{ height: 110 }} /></div>}
        </div>
      </div>
    </div>
  );
}

// Nokta-parça mesafesi (piksel hit-test)
function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1; const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export default InteractiveChart;
