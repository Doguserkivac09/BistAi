'use client';

/**
 * SignalChart — kendi OHLCV + AL/SAT/stop/target overlay'li mum grafiği (FAZ LC).
 *
 * StockChart (eski tema) ile aynı lightweight-charts temeline dayanır ama:
 *  - Yeni tasarım token renkleri (up/down/ai) + açık/karanlık tema (ThemeProvider).
 *  - Sinyal marker'ları (AL/SAT), stop/target yatay çizgileri, opsiyonel formasyon bölgeleri.
 *  - Veriyi `candles` prop'undan alır ya da `symbol` verilirse `/api/ohlcv`'den çeker.
 *
 * Kullanım: Fırsatlar/Bugün/VIOP ekranlarında SVG sparkline'ın DETAY yükseltmesi olarak
 * (liste sparkline'ları hafif kalsın; bu detay/modal görünüm içindir — VIOP-TRADINGVIEW-PLAN LC-2).
 */

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { OHLCVCandle } from '@/types';
import { useTheme } from '@/components/ThemeProvider';

// Tasarım token'ları (tailwind.config.js ile aynı hex'ler; lightweight-charts CSS var kabul etmez)
const TOKENS = {
  up: '#16a35b',
  down: '#e5484d',
  ai: '#6b6ff5',
};

/** Grafik üstüne konacak sinyal marker'ı. */
export interface SignalMarker {
  /** Mum tarihi (candle.date ile aynı format) veya son mum için boş bırakılabilir. */
  time?: string | number;
  direction: 'al' | 'sat' | 'notr';
  label: string;
}

interface SignalChartProps {
  /** Doğrudan mum verisi. `symbol` verilmezse zorunlu. */
  candles?: OHLCVCandle[];
  /** Verilirse /api/ohlcv'den çeker (candles'a göre önceliklidir değil — candles varsa o kullanılır). */
  symbol?: string;
  /** OHLCV fetch timeframe (varsayılan '1d'). */
  timeframe?: string;
  height?: number;
  className?: string;
  /** AL/SAT marker'ları. */
  markers?: SignalMarker[];
  /** Stop-loss yatay çizgisi. */
  stopPrice?: number;
  /** Hedef (take-profit) yatay çizgisi. */
  targetPrice?: number;
}

function themeColors(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    return {
      background: 'transparent',
      text: '#9aa4b2',
      grid: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.10)',
    };
  }
  return {
    background: 'transparent',
    text: '#5b6472',
    grid: 'rgba(0,0,0,0.05)',
    border: 'rgba(0,0,0,0.10)',
  };
}

export function SignalChart({
  candles: candlesProp,
  symbol,
  timeframe = '1d',
  height = 360,
  className,
  markers,
  stopPrice,
  targetPrice,
}: SignalChartProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [candles, setCandles] = useState<OHLCVCandle[]>(candlesProp ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prop güncellenirse state'i eşitle
  useEffect(() => {
    if (candlesProp) setCandles(candlesProp);
  }, [candlesProp]);

  // symbol verildiyse (ve candles prop yoksa) OHLCV çek
  useEffect(() => {
    if (candlesProp || !symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/ohlcv?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`)
      .then((r) => r.json())
      .then((data: { candles?: OHLCVCandle[] }) => {
        if (cancelled) return;
        setCandles(data.candles ?? []);
      })
      .catch(() => { if (!cancelled) setError('Veri yüklenemedi.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, timeframe, candlesProp]);

  // Grafik çizimi — veri / tema / overlay değişince yeniden kurulur
  useEffect(() => {
    if (!containerRef.current || !candles.length) return;
    const c = themeColors(theme);

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: c.background },
        textColor: c.text,
        fontFamily: 'var(--font-manrope), system-ui',
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.1, bottom: 0.25 } },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
      width: containerRef.current.clientWidth,
      height,
    });

    const toMs = (d: string | number) => (typeof d === 'number' ? d * 1000 : new Date(d).getTime());
    const normalized = Array.from(
      new Map(
        candles.slice().sort((a, b) => toMs(a.date) - toMs(b.date))
          .map((cd) => [String(cd.date), cd] as const)
      ).values()
    );

    const cdlData: CandlestickData[] = normalized.map((cd) => ({
      time: cd.date as Time, open: cd.open, high: cd.high, low: cd.low, close: cd.close,
    }));
    const candleSeries = chart.addCandlestickSeries({
      upColor: TOKENS.up, downColor: TOKENS.down, borderVisible: false,
      wickUpColor: TOKENS.up, wickDownColor: TOKENS.down,
    });
    candleSeries.setData(cdlData);

    // Hacim
    const volumeSeries = chart.addHistogramSeries({
      priceScaleId: 'volume', color: TOKENS.ai + '40', title: '',
      priceFormat: {
        type: 'custom',
        formatter: (p: number) =>
          p >= 1_000_000 ? (p / 1_000_000).toFixed(1) + 'M' : p >= 1_000 ? (p / 1_000).toFixed(0) + 'K' : p.toFixed(0),
      },
    });
    volumeSeries.setData(normalized.map((cd) => ({
      time: cd.date as Time, value: cd.volume ?? 0,
      color: cd.close >= cd.open ? TOKENS.up + '28' : TOKENS.down + '28',
    })));
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });

    // Stop / target yatay çizgileri
    if (typeof stopPrice === 'number' && Number.isFinite(stopPrice)) {
      candleSeries.createPriceLine({
        price: stopPrice, color: TOKENS.down, lineWidth: 1, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, title: 'Stop',
      });
    }
    if (typeof targetPrice === 'number' && Number.isFinite(targetPrice)) {
      candleSeries.createPriceLine({
        price: targetPrice, color: TOKENS.up, lineWidth: 1, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, title: 'Hedef',
      });
    }

    // Sinyal marker'ları
    if (markers?.length && normalized.length) {
      const lastTime = normalized[normalized.length - 1]!.date as Time;
      const seriesMarkers: SeriesMarker<Time>[] = markers.map((m) => {
        const isSat = m.direction === 'sat';
        const isAl = m.direction === 'al';
        return {
          time: (m.time ?? lastTime) as Time,
          position: isSat ? 'aboveBar' : 'belowBar',
          shape: isSat ? 'arrowDown' : isAl ? 'arrowUp' : 'circle',
          color: isSat ? TOKENS.down : isAl ? TOKENS.up : TOKENS.ai,
          text: m.label,
          size: 2,
        };
      });
      candleSeries.setMarkers(seriesMarkers);
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
    };
  }, [candles, theme, height, stopPrice, targetPrice, markers]);

  return (
    <div className={`w-full ${className ?? ''}`}>
      {loading && !candles.length && (
        <div className="flex items-center justify-center text-sm text-t3" style={{ height }}>
          Grafik yükleniyor…
        </div>
      )}
      {error && !candles.length && (
        <div className="flex items-center justify-center text-sm text-down" style={{ height }}>
          {error}
        </div>
      )}
      {!!candles.length && (
        <div
          ref={containerRef}
          className="w-full"
          role="img"
          aria-label="Fiyat grafiği ve sinyal işaretleri"
        />
      )}
    </div>
  );
}

export default SignalChart;
