'use client';

/**
 * InteractiveChart — profesyonel "pro" grafik (lightweight-charts, kendi verimiz).
 *
 *  - Grafik tipi: mum / çizgi / alan
 *  - İndikatörler: EMA9/21, Bollinger, EMA50/200, VWAP, RSI (panel), MACD (panel), hacim
 *  - Hacim Profili: Görünür Aralık (VPVR, pan/zoom'da dinamik) + Sabit Aralık (FRVP, çizim aracı)
 *    → POC + Değer Alanı (VA)
 *  - Çizim: trend / yatay / fibonacci / dikdörtgen / metin — SEÇ + SÜRÜKLEYEREK DÜZENLE (uç/gövde)
 *    + magnet + sil (seçili/son/tümü). Veri-koordinatına sabit; pan/zoom native.
 *  - localStorage kalıcılığı (sembol başına) + tam ekran (Fullscreen API + yeniden kurma)
 *  - Açık/karanlık tema.
 *
 * Veri: `candles` prop'undan ya da `symbol` ile /api/ohlcv'den. Harici/lisanslı bağımlılık YOK.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, ColorType, LineStyle, CrosshairMode,
  type IChartApi, type ISeriesApi, type Time, type Logical,
  type CandlestickData, type LineData, type AreaData,
} from 'lightweight-charts';
import type { OHLCVCandle } from '@/types';
import { useTheme } from '@/components/ThemeProvider';
import { calculateEMA, calculateBollingerBands, calculateRSI, calculateMACD, calculateVWAP } from '@/lib/indicators';
import { calculateSRLevels } from '@/lib/support-resistance';
import { computeVolumeProfile } from '@/lib/volume-profile';
import {
  loadDrawings, saveDrawings, newDrawingId, FIB_LEVELS,
  type Drawing, type DrawTool, type Anchor,
} from '@/lib/chart-drawings';

const TOK = { up: '#16a35b', down: '#e5484d', ai: '#6b6ff5', ema9: '#6366f1', ema21: '#f59e0b', ema50: '#10b981', ema200: '#f43f5e', vwap: '#e879f9', poc: '#facc15' };

type ChartType = 'candle' | 'line' | 'area';
type HitPart = 'a' | 'b' | 'body';

interface HitResult { id: string; part: HitPart; }

function themeColors(t: 'light' | 'dark') {
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
  { key: 'cursor', label: 'İmleç / seç-düzenle', icon: '⤢' },
  { key: 'trend', label: 'Trend çizgisi', icon: '╱' },
  { key: 'hline', label: 'Yatay çizgi', icon: '─' },
  { key: 'fib', label: 'Fibonacci', icon: '≣' },
  { key: 'rect', label: 'Dikdörtgen', icon: '▭' },
  { key: 'frvp', label: 'Sabit Aralık Hacim Profili', icon: '▮' },
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

  const norm = useMemo(() => {
    const toMs = (d: string | number) => typeof d === 'number' ? d * 1000 : new Date(d).getTime();
    return Array.from(new Map(
      candles.slice().sort((a, b) => toMs(a.date) - toMs(b.date)).map((c) => [String(c.date), c] as const),
    ).values());
  }, [candles]);
  const timeIndex = useMemo(() => { const m = new Map<string, number>(); norm.forEach((c, i) => m.set(String(c.date), i)); return m; }, [norm]);

  // ── UI durumu ──
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [ind, setInd] = useState({ ema: true, bb: false, ema50200: false, sr: false, vwap: false, rsi: false, macd: false });
  const [vp, setVp] = useState(false); // Görünür Aralık Hacim Profili
  const [tool, setTool] = useState<DrawTool>('cursor');
  const [magnet, setMagnet] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legend, setLegend] = useState<{ price?: string; change?: string; up?: boolean }>({});
  const [textInput, setTextInput] = useState<{ x: number; y: number; anchor: Anchor } | null>(null);

  // ── Refs ──
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | null>(null);
  const syncingRef = useRef(false);
  const drawingsRef = useRef<Drawing[]>([]); drawingsRef.current = drawings;
  const draftRef = useRef<{ tool: DrawTool; a: Anchor; b: Anchor } | null>(null);
  const dragRef = useRef<{ id: string; part: HitPart; startIdx: number; startPrice: number; snap: Drawing } | null>(null);
  const vpRef = useRef(false); vpRef.current = vp;
  const toolRef = useRef<DrawTool>('cursor'); toolRef.current = tool;
  const selRef = useRef<string | null>(null); selRef.current = selectedId;

  // ── Kalıcılık ──
  useEffect(() => { if (symbol) setDrawings(loadDrawings(symbol)); }, [symbol]);
  const persist = useCallback((next: Drawing[]) => { setDrawings(next); if (symbol) saveDrawings(symbol, next); }, [symbol]);

  // ── Koordinat yardımcıları ──
  const anchorToX = useCallback((a: Anchor): number | null => {
    const chart = chartRef.current; if (!chart) return null;
    const idx = timeIndex.get(String(a.time)); if (idx == null) return null;
    return chart.timeScale().logicalToCoordinate(idx as Logical);
  }, [timeIndex]);
  const priceToY = useCallback((p: number): number | null => priceSeriesRef.current?.priceToCoordinate(p) ?? null, []);
  const xToIndex = useCallback((x: number): number | null => {
    const chart = chartRef.current; if (!chart) return null;
    const l = chart.timeScale().coordinateToLogical(x); if (l == null) return null;
    return Math.max(0, Math.min(norm.length - 1, Math.round(l as number)));
  }, [norm.length]);
  const yToPrice = useCallback((y: number): number | null => priceSeriesRef.current?.coordinateToPrice(y) ?? null, []);
  const idxToAnchor = useCallback((idx: number, price: number, useMagnet: boolean): Anchor => {
    const c = norm[Math.max(0, Math.min(norm.length - 1, idx))];
    let p = price;
    if (useMagnet && c) { const o = [c.open, c.high, c.low, c.close]; p = o.reduce((b, v) => Math.abs(v - price) < Math.abs(b - price) ? v : b, o[0]!); }
    return { time: c ? c.date : norm[0]?.date ?? 0, price: p };
  }, [norm]);
  const rightAxisW = () => { try { return chartRef.current?.priceScale('right').width() ?? 0; } catch { return 0; } };

  // ── Hacim Profili çizimi ──
  const drawVP = useCallback((ctx: CanvasRenderingContext2D, cands: OHLCVCandle[], xLeft: number, xRight: number, paneR: number) => {
    const profile = computeVolumeProfile(cands, 24); if (!profile) return;
    const maxBarW = Math.min(160, (xRight - xLeft) * 0.9);
    const anchorX = xRight; // barlar sağdan sola
    for (const bin of profile.bins) {
      const yTop = priceToY(bin.high), yBot = priceToY(bin.low); if (yTop == null || yBot == null) continue;
      const h = Math.max(1, Math.abs(yBot - yTop) - 1);
      const w = profile.maxVol > 0 ? (bin.volume / profile.maxVol) * maxBarW : 0;
      const isPoc = bin.low <= profile.pocPrice && profile.pocPrice <= bin.high;
      const buyW = bin.volume > 0 ? w * (bin.buyVol / bin.volume) : 0;
      // alım (yeşil) + satım (kırmızı) yığılmış
      ctx.fillStyle = TOK.up + (isPoc ? '80' : '55'); ctx.fillRect(anchorX - w, Math.min(yTop, yBot), buyW, h);
      ctx.fillStyle = TOK.down + (isPoc ? '80' : '55'); ctx.fillRect(anchorX - w + buyW, Math.min(yTop, yBot), w - buyW, h);
    }
    // POC çizgisi
    const yPoc = priceToY(profile.pocPrice);
    if (yPoc != null) { ctx.strokeStyle = TOK.poc; ctx.lineWidth = 1.4; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(xLeft, yPoc); ctx.lineTo(paneR, yPoc); ctx.stroke(); ctx.fillStyle = TOK.poc; ctx.font = '9px monospace'; ctx.fillText('POC ' + profile.pocPrice.toFixed(2), xLeft + 3, yPoc - 3); }
    // Değer Alanı sınırları
    for (const p of [profile.vaHigh, profile.vaLow]) { const y = priceToY(p); if (y == null) continue; ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xLeft, y); ctx.lineTo(paneR, y); ctx.stroke(); ctx.setLineDash([]); }
  }, [priceToY]);

  // ── Overlay ana çizim ──
  const redraw = useCallback(() => {
    const cv = overlayRef.current, chart = chartRef.current; if (!cv || !chart) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const paneR = Math.max(0, w - rightAxisW());

    const line = (x1: number, y1: number, x2: number, y2: number, color: string, width = 1.5, dash: number[] = []) => {
      ctx.beginPath(); ctx.setLineDash(dash); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    };
    const handle = (x: number, y: number) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill(); ctx.stroke(); };

    // 1) Görünür Aralık Hacim Profili (dinamik)
    if (vpRef.current) {
      const r = chart.timeScale().getVisibleLogicalRange();
      if (r) { const from = Math.max(0, Math.floor(r.from as number)), to = Math.min(norm.length - 1, Math.ceil(r.to as number)); if (to > from) drawVP(ctx, norm.slice(from, to + 1), paneR - Math.min(160, paneR * 0.9), paneR, paneR); }
    }

    // 2) Çizimler
    for (const d of drawingsRef.current) {
      const sel = d.id === selRef.current; const col = sel ? '#3b82f6' : d.color;
      if (d.tool === 'hline') {
        const y = priceToY(d.price); if (y == null) continue; line(0, y, paneR, y, col, sel ? 2 : 1.5, [6, 4]);
        ctx.fillStyle = col; ctx.font = '10px monospace'; ctx.fillText(d.price.toFixed(2), 4, y - 3);
        if (sel) handle(paneR / 2, y);
      } else if (d.tool === 'trend') {
        const x1 = anchorToX(d.a), y1 = priceToY(d.a.price), x2 = anchorToX(d.b), y2 = priceToY(d.b.price); if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        line(x1, y1, x2, y2, col, sel ? 2.4 : 1.8); if (sel) { handle(x1, y1); handle(x2, y2); }
      } else if (d.tool === 'rect') {
        const x1 = anchorToX(d.a), y1 = priceToY(d.a.price), x2 = anchorToX(d.b), y2 = priceToY(d.b.price); if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        ctx.fillStyle = col + '20'; ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.4; ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); if (sel) { handle(x1, y1); handle(x2, y2); }
      } else if (d.tool === 'fib') {
        const x1 = anchorToX(d.a), x2 = anchorToX(d.b); if (x1 == null || x2 == null) continue;
        const xl = Math.min(x1, x2), xr = Math.max(x1, x2);
        for (const lv of FIB_LEVELS) { const price = d.a.price + (d.b.price - d.a.price) * (1 - lv); const y = priceToY(price); if (y == null) continue; line(xl, y, paneR, y, col, sel ? 1.6 : 1, lv === 0 || lv === 1 ? [] : [3, 3]); ctx.fillStyle = col; ctx.font = '9px monospace'; ctx.fillText(`${(lv * 100).toFixed(1)}%  ${price.toFixed(2)}`, xr + 4 > paneR ? xl + 4 : xr + 4, y - 2); }
        if (sel) { const ya = priceToY(d.a.price), yb = priceToY(d.b.price); if (ya != null) handle(x1, ya); if (yb != null) handle(x2, yb); }
      } else if (d.tool === 'frvp') {
        const x1 = anchorToX(d.a), x2 = anchorToX(d.b); if (x1 == null || x2 == null) continue;
        const xl = Math.min(x1, x2), xr = Math.max(x1, x2);
        const ia = timeIndex.get(String(d.a.time)) ?? 0, ib = timeIndex.get(String(d.b.time)) ?? 0;
        const lo = Math.min(ia, ib), hi = Math.max(ia, ib);
        line(xl, 0, xl, ctx.canvas.clientHeight, col, sel ? 1.6 : 1, [2, 3]); line(xr, 0, xr, ctx.canvas.clientHeight, col, sel ? 1.6 : 1, [2, 3]);
        drawVP(ctx, norm.slice(lo, hi + 1), xl, xr, paneR);
        if (sel) { const ya = priceToY(d.a.price), yb = priceToY(d.b.price); if (ya != null) handle(x1, ya); if (yb != null) handle(x2, yb); }
      } else if (d.tool === 'text') {
        const x = anchorToX(d.at), y = priceToY(d.at.price); if (x == null || y == null) continue;
        ctx.fillStyle = col; ctx.font = sel ? 'bold 13px sans-serif' : '13px sans-serif'; ctx.fillText(d.text, x, y);
        if (sel) { ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; const tw = ctx.measureText(d.text).width; ctx.strokeRect(x - 2, y - 13, tw + 4, 18); }
      }
    }

    // 3) Taslak (çizim sürerken)
    const draft = draftRef.current;
    if (draft) {
      const x1 = anchorToX(draft.a), y1 = priceToY(draft.a.price), x2 = anchorToX(draft.b), y2 = priceToY(draft.b.price);
      if (x1 != null && y1 != null && x2 != null && y2 != null) {
        if (draft.tool === 'rect' || draft.tool === 'frvp') { ctx.strokeStyle = TOK.ai; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.4; ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.setLineDash([]); }
        else line(x1, y1, x2, y2, TOK.ai, 1.4, [4, 3]);
      }
    }
  }, [anchorToX, priceToY, drawVP, norm, timeIndex]);

  // ── Ana grafik ──
  useEffect(() => {
    if (!mainRef.current || !norm.length) return;
    const chart = createChart(mainRef.current, {
      layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: 'var(--font-manrope), system-ui', attributionLogo: false },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.1, bottom: 0.24 } },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
      width: mainRef.current.clientWidth, height: mainRef.current.clientHeight,
    });

    let priceSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'>;
    if (chartType === 'candle') {
      const s = chart.addCandlestickSeries({ upColor: TOK.up, downColor: TOK.down, borderVisible: false, wickUpColor: TOK.up, wickDownColor: TOK.down });
      s.setData(norm.map((c): CandlestickData => ({ time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close }))); priceSeries = s;
    } else if (chartType === 'line') {
      const s = chart.addLineSeries({ color: TOK.ai, lineWidth: 2, priceLineVisible: false }); s.setData(norm.map((c): LineData => ({ time: c.date as Time, value: c.close }))); priceSeries = s;
    } else {
      const s = chart.addAreaSeries({ lineColor: TOK.ai, topColor: TOK.ai + '55', bottomColor: TOK.ai + '05', lineWidth: 2, priceLineVisible: false }); s.setData(norm.map((c): AreaData => ({ time: c.date as Time, value: c.close }))); priceSeries = s;
    }
    priceSeriesRef.current = priceSeries;

    const vol = chart.addHistogramSeries({ priceScaleId: 'volume', color: TOK.ai + '40', priceFormat: { type: 'custom', formatter: (p: number) => p >= 1e6 ? (p / 1e6).toFixed(1) + 'M' : p >= 1e3 ? (p / 1e3).toFixed(0) + 'K' : p.toFixed(0) } });
    vol.setData(norm.map((c) => ({ time: c.date as Time, value: c.volume ?? 0, color: c.close >= c.open ? TOK.up + '28' : TOK.down + '28' })));
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });

    const closes = norm.map((c) => c.close);
    const addLine = (color: string, vals: number[], lw: 1 | 2 = 1) => { const s = chart.addLineSeries({ color, lineWidth: lw, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData(norm.map((c, i) => ({ time: c.date as Time, value: vals[i] ?? c.close }))); };
    if (ind.ema) { addLine(TOK.ema9, calculateEMA(closes, 9)); addLine(TOK.ema21, calculateEMA(closes, 21)); }
    if (ind.bb) { const bb = calculateBollingerBands(closes, 20); addLine('rgba(99,102,241,0.5)', bb.upper); addLine('rgba(148,163,184,0.4)', bb.middle); addLine('rgba(99,102,241,0.5)', bb.lower); }
    if (ind.ema50200) { if (closes.length >= 50) addLine(TOK.ema50, calculateEMA(closes, 50)); if (closes.length >= 200) addLine(TOK.ema200, calculateEMA(closes, 200)); }
    if (ind.vwap) addLine(TOK.vwap, calculateVWAP(norm), 2);
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
      // İmleç modunda çizim üstünde miysek düzenleme için pointer-events aç
      if (toolRef.current === 'cursor' && param.point && !dragRef.current) {
        const hit = hitTest(param.point.x, param.point.y);
        const cv = overlayRef.current;
        if (cv) cv.style.pointerEvents = hit || selRef.current ? 'auto' : 'none';
        if (cv) cv.style.cursor = hit ? (hit.part === 'body' ? 'move' : 'nwse-resize') : 'default';
      }
    });

    chart.timeScale().fitContent();
    chartRef.current = chart;
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => redraw());
    requestAnimationFrame(redraw);
    return () => { chart.remove(); chartRef.current = null; priceSeriesRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [norm, chartType, theme, height, ind.ema, ind.bb, ind.ema50200, ind.sr, ind.vwap, isFs]);

  // Çizim / seçim / VP değişince yeniden çiz
  useEffect(() => { redraw(); }, [drawings, selectedId, vp, redraw]);

  // Konteyner boyutu / tam ekran → yeniden boyutlandır
  useEffect(() => {
    const fit = () => { const el = mainRef.current, chart = chartRef.current; if (el && chart) { chart.resize(el.clientWidth, el.clientHeight); redraw(); } };
    const id = window.setTimeout(fit, 120); window.addEventListener('resize', fit);
    return () => { window.clearTimeout(id); window.removeEventListener('resize', fit); };
  }, [isFs, redraw]);

  // ── Alt paneller (RSI / MACD) ──
  useEffect(() => {
    if (!ind.rsi || !rsiRef.current || !norm.length) return;
    const rsi = calculateRSI(norm.map((c) => c.close), 14);
    const chart = createChart(rsiRef.current, { layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: 'var(--font-manrope), system-ui', attributionLogo: false }, grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } }, rightPriceScale: { borderColor: C.border }, timeScale: { borderColor: C.border, visible: false }, width: rsiRef.current.clientWidth, height: 110 });
    const s = chart.addLineSeries({ color: TOK.ema9, lineWidth: 1, priceLineVisible: false });
    s.setData(norm.map((c, i) => ({ time: c.date as Time, value: rsi[i] ?? 50 }))); s.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    s.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.6)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
    s.createPriceLine({ price: 30, color: 'rgba(34,197,94,0.6)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
    syncRange(chart);
    const ro = new ResizeObserver(() => chart.applyOptions({ width: rsiRef.current!.clientWidth })); ro.observe(rsiRef.current);
    return () => { ro.disconnect(); chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ind.rsi, norm, theme, isFs]);
  useEffect(() => {
    if (!ind.macd || !macdRef.current || !norm.length) return;
    const { macd, signal, histogram } = calculateMACD(norm.map((c) => c.close));
    const chart = createChart(macdRef.current, { layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: 'var(--font-manrope), system-ui', attributionLogo: false }, grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } }, rightPriceScale: { borderColor: C.border }, timeScale: { borderColor: C.border, visible: false }, width: macdRef.current.clientWidth, height: 110 });
    const hist = chart.addHistogramSeries({ priceLineVisible: false }); hist.setData(norm.map((c, i) => ({ time: c.date as Time, value: histogram[i] ?? 0, color: (histogram[i] ?? 0) >= 0 ? TOK.up + '99' : TOK.down + '99' })));
    const mS = chart.addLineSeries({ color: TOK.ema9, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); mS.setData(norm.map((c, i) => ({ time: c.date as Time, value: macd[i] ?? 0 })));
    const sS = chart.addLineSeries({ color: TOK.ema21, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); sS.setData(norm.map((c, i) => ({ time: c.date as Time, value: signal[i] ?? 0 })));
    syncRange(chart);
    const ro = new ResizeObserver(() => chart.applyOptions({ width: macdRef.current!.clientWidth })); ro.observe(macdRef.current);
    return () => { ro.disconnect(); chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ind.macd, norm, theme, isFs]);
  function syncRange(sub: IChartApi) {
    const main = chartRef.current; if (!main) return;
    const apply = (from: IChartApi, to: IChartApi) => { if (syncingRef.current) return; const r = from.timeScale().getVisibleLogicalRange(); if (!r) return; syncingRef.current = true; try { to.timeScale().setVisibleLogicalRange(r); } finally { syncingRef.current = false; } };
    const r0 = main.timeScale().getVisibleLogicalRange(); if (r0) sub.timeScale().setVisibleLogicalRange(r0);
    main.timeScale().subscribeVisibleLogicalRangeChange(() => apply(main, sub));
    sub.timeScale().subscribeVisibleLogicalRangeChange(() => apply(sub, main));
  }

  // ── Hit-test (seçim/düzenleme) ──
  const hitTest = useCallback((mx: number, my: number): HitResult | null => {
    const near = (x: number, y: number) => Math.hypot(x - mx, y - my) < 8;
    for (const d of [...drawingsRef.current].reverse()) {
      if (d.tool === 'hline') { const y = priceToY(d.price); if (y != null && Math.abs(y - my) < 6) return { id: d.id, part: 'body' }; }
      else if (d.tool === 'text') { const x = anchorToX(d.at), y = priceToY(d.at.price); if (x != null && y != null && Math.abs(x - mx) < 45 && Math.abs(y - my) < 12) return { id: d.id, part: 'body' }; }
      else { // trend/fib/rect/frvp: uçlar + gövde
        const xa = anchorToX((d as { a: Anchor }).a), ya = priceToY((d as { a: Anchor }).a.price), xb = anchorToX((d as { b: Anchor }).b), yb = priceToY((d as { b: Anchor }).b.price);
        if (xa == null || ya == null || xb == null || yb == null) continue;
        if (near(xa, ya)) return { id: d.id, part: 'a' };
        if (near(xb, yb)) return { id: d.id, part: 'b' };
        if (d.tool === 'trend') { if (distToSeg(mx, my, xa, ya, xb, yb) < 6) return { id: d.id, part: 'body' }; }
        else if (mx >= Math.min(xa, xb) - 4 && mx <= Math.max(xa, xb) + 4 && my >= Math.min(ya, yb) - 4 && my <= Math.max(ya, yb) + 4) return { id: d.id, part: 'body' };
      }
    }
    return null;
  }, [anchorToX, priceToY]);

  // ── Overlay fare olayları ──
  const localXY = (e: React.MouseEvent) => { const r = overlayRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onOverlayDown = (e: React.MouseEvent) => {
    const { x, y } = localXY(e);
    if (tool === 'cursor') {
      const hit = hitTest(x, y);
      if (hit) { const snap = drawingsRef.current.find((d) => d.id === hit.id)!; setSelectedId(hit.id); dragRef.current = { id: hit.id, part: hit.part, startIdx: xToIndex(x) ?? 0, startPrice: yToPrice(y) ?? 0, snap: JSON.parse(JSON.stringify(snap)) }; }
      else setSelectedId(null);
      return;
    }
    const idx = xToIndex(x), pr = yToPrice(y); if (idx == null || pr == null) return;
    const a = idxToAnchor(idx, pr, magnet);
    if (tool === 'hline') { persist([...drawingsRef.current, { id: newDrawingId(), tool: 'hline', color: TOK.ai, price: a.price }]); return; }
    if (tool === 'text') { setTextInput({ x, y, anchor: a }); return; }
    draftRef.current = { tool, a, b: a }; redraw();
  };
  const onOverlayMove = (e: React.MouseEvent) => {
    const { x, y } = localXY(e);
    // düzenleme sürüklemesi
    if (dragRef.current) {
      const idx = xToIndex(x), pr = yToPrice(y); if (idx == null || pr == null) return;
      const { part, startIdx, startPrice, snap } = dragRef.current;
      const dIdx = idx - startIdx, dPrice = pr - startPrice;
      const next = drawingsRef.current.map((d) => {
        if (d.id !== dragRef.current!.id) return d;
        const s = snap as Drawing;
        const shift = (an: Anchor): Anchor => { const oi = timeIndex.get(String(an.time)) ?? 0; return idxToAnchor(oi + dIdx, an.price + dPrice, false); };
        if (s.tool === 'hline') return { ...s, price: magnet ? idxToAnchor(idx, pr, true).price : pr } as Drawing;
        if (s.tool === 'text') return { ...s, at: part === 'body' ? shift(s.at) : s.at } as Drawing;
        const sa = s as { a: Anchor; b: Anchor };
        if (part === 'a') return { ...s, a: idxToAnchor(idx, pr, magnet) } as Drawing;
        if (part === 'b') return { ...s, b: idxToAnchor(idx, pr, magnet) } as Drawing;
        return { ...s, a: shift(sa.a), b: shift(sa.b) } as Drawing;
      });
      drawingsRef.current = next; setDrawings(next); redraw(); return;
    }
    if (draftRef.current) { const idx = xToIndex(x), pr = yToPrice(y); if (idx == null || pr == null) return; draftRef.current.b = idxToAnchor(idx, pr, magnet); redraw(); return; }
    // hover imleç (cursor modunda pe zaten crosshair'dan yönetiliyor; burada overlay pe auto iken)
    if (tool === 'cursor') { const hit = hitTest(x, y); const cv = overlayRef.current!; cv.style.cursor = hit ? (hit.part === 'body' ? 'move' : 'nwse-resize') : 'default'; if (!hit && !selectedId) cv.style.pointerEvents = 'none'; }
  };
  const onOverlayUp = () => {
    if (dragRef.current) { dragRef.current = null; if (symbol) saveDrawings(symbol, drawingsRef.current); return; }
    const d = draftRef.current; if (!d) { return; }
    draftRef.current = null;
    if (d.tool === 'trend' || d.tool === 'fib' || d.tool === 'rect' || d.tool === 'frvp') {
      if (String(d.a.time) !== String(d.b.time) || d.a.price !== d.b.price) persist([...drawingsRef.current, { id: newDrawingId(), tool: d.tool, color: TOK.ai, a: d.a, b: d.b } as Drawing]);
    }
    redraw();
  };

  const deleteSelected = () => { const list = drawingsRef.current; const id = selectedId ?? list[list.length - 1]?.id; if (!id) return; persist(list.filter((d) => d.id !== id)); setSelectedId(null); };
  const clearAll = () => { persist([]); setSelectedId(null); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const el = document.activeElement; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return; if (e.key === 'Delete' && !textInput && drawingsRef.current.length) deleteSelected(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, textInput]);
  const commitText = (text: string) => { if (textInput && text.trim()) persist([...drawingsRef.current, { id: newDrawingId(), tool: 'text', color: theme === 'dark' ? '#fff' : '#111', at: textInput.anchor, text: text.trim() }]); setTextInput(null); };

  const toggle = (k: keyof typeof ind) => setInd((s) => ({ ...s, [k]: !s[k] }));
  const toggleFullscreen = () => { const el = rootRef.current; if (!el) return; if (!isFs) { setIsFs(true); el.requestFullscreen?.().catch(() => {}); } else { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); setIsFs(false); } setTimeout(redraw, 80); };
  useEffect(() => {
    const onFsChange = () => { if (!document.fullscreenElement) setIsFs(false); setTimeout(redraw, 60); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) setIsFs(false); };
    document.addEventListener('fullscreenchange', onFsChange); window.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('fullscreenchange', onFsChange); window.removeEventListener('keydown', onEsc); };
  }, [redraw]);

  const btn = (active: boolean) => `rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${active ? 'bg-ink text-onink' : 'text-t3 hover:text-ink hover:bg-fill'}`;

  return (
    <div ref={rootRef} className="flex w-full flex-col" style={isFs ? { position: 'fixed', inset: 0, zIndex: 130, height: '100vh', width: '100vw', background: theme === 'dark' ? '#0d0e12' : '#ffffff', padding: 12 } : undefined}>
      {/* Üst araç çubuğu */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5">
          {([['candle', 'Mum'], ['line', 'Çizgi'], ['area', 'Alan']] as const).map(([k, l]) => (<button key={k} type="button" onClick={() => setChartType(k)} className={btn(chartType === k)}>{l}</button>))}
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5">
          {([['ema', 'EMA'], ['bb', 'BB'], ['ema50200', 'EMA50/200'], ['vwap', 'VWAP'], ['sr', 'S/R'], ['rsi', 'RSI'], ['macd', 'MACD']] as const).map(([k, l]) => (<button key={k} type="button" onClick={() => toggle(k)} className={btn(ind[k])}>{l}</button>))}
        </div>
        <button type="button" onClick={() => setVp((v) => !v)} className={btn(vp)} title="Görünür Aralık Hacim Profili (dinamik)">Hacim Profili</button>
        <button type="button" onClick={toggleFullscreen} className={`ml-auto ${btn(isFs)}`} title="Tam ekran">{isFs ? '✕ Kapat' : '⛶ Tam ekran'}</button>
      </div>

      <div className="flex min-h-0 flex-1 gap-1.5">
        {/* Sol çizim araç çubuğu */}
        <div className="flex flex-col gap-0.5 rounded-lg border border-hairline p-1">
          {DRAW_TOOLS.map((t) => (<button key={t.key} type="button" title={t.label} onClick={() => { setTool(t.key); setSelectedId(null); const cv = overlayRef.current; if (cv) cv.style.pointerEvents = t.key === 'cursor' ? 'none' : 'auto'; }} className={`h-7 w-7 rounded-md text-[13px] font-bold transition-colors ${tool === t.key ? 'bg-ink text-onink' : 'text-t2 hover:bg-fill'}`}>{t.icon}</button>))}
          <div className="my-0.5 h-px bg-hairline" />
          <button type="button" title="Magnet (OHLC'ye yapış)" onClick={() => setMagnet((v) => !v)} className={`h-7 w-7 rounded-md text-[13px] transition-colors ${magnet ? 'bg-ai text-white' : 'text-t2 hover:bg-fill'}`}>🧲</button>
          <button type="button" title="Seçili/son çizimi sil" onClick={deleteSelected} disabled={!drawings.length} className="h-7 w-7 rounded-md text-[13px] text-t2 hover:bg-fill disabled:opacity-30">🗑</button>
          <button type="button" title="Tüm çizimleri temizle" onClick={clearAll} disabled={!drawings.length} className="h-7 w-7 rounded-md text-[11px] text-t2 hover:bg-fill disabled:opacity-30">⌫</button>
        </div>

        {/* Grafik alanı */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={`relative w-full ${isFs ? 'min-h-0 flex-1' : ''}`} style={isFs ? undefined : { height }}>
            <div ref={mainRef} className="h-full w-full" />
            <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" style={{ zIndex: 5, pointerEvents: tool === 'cursor' ? 'none' : 'auto', cursor: tool === 'cursor' ? 'default' : 'crosshair' }} onMouseDown={onOverlayDown} onMouseMove={onOverlayMove} onMouseUp={onOverlayUp} onMouseLeave={onOverlayUp} />
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2 rounded bg-panel/80 px-2 py-1 text-xs backdrop-blur">
              {legend.price && <span className="font-mono font-semibold text-ink">{legend.price}</span>}
              {legend.change && <span className={`font-mono ${legend.up ? 'text-up' : 'text-down'}`}>{legend.up ? '+' : ''}{legend.change}%</span>}
              {loading && <span className="text-t3">yükleniyor…</span>}
            </div>
            {textInput && (<input autoFocus className="absolute z-20 rounded border border-ai bg-panel px-1 text-[13px] text-ink outline-none" style={{ left: textInput.x, top: textInput.y - 10, width: 140 }} placeholder="Metin…" onKeyDown={(e) => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value); if (e.key === 'Escape') setTextInput(null); }} onBlur={(e) => commitText(e.target.value)} />)}
          </div>
          {ind.rsi && <div className="mt-1"><div className="mb-0.5 text-[10px] font-semibold text-t4">RSI (14)</div><div ref={rsiRef} className="w-full" style={{ height: 110 }} /></div>}
          {ind.macd && <div className="mt-1"><div className="mb-0.5 text-[10px] font-semibold text-t4">MACD (12/26/9)</div><div ref={macdRef} className="w-full" style={{ height: 110 }} /></div>}
        </div>
      </div>
    </div>
  );
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1; const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export default InteractiveChart;
