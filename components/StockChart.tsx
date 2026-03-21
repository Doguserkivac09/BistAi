'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts';
import type { OHLCVCandle } from '@/types';

function calculateEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i]!;
      if (i === period - 1) {
        ema.push(sum / period);
      } else {
        ema.push(values[i]!);
      }
      continue;
    }
    const next = values[i]! * k + ema[i - 1]! * (1 - k);
    ema.push(next);
  }
  return ema;
}

function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      rsi.push(50);
      continue;
    }
    const slice = closes.slice(i - period, i + 1);
    let gains = 0;
    let losses = 0;
    for (let j = 1; j < slice.length; j++) {
      const diff = slice[j]! - slice[j - 1]!;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgLoss = losses / period;
    if (avgLoss === 0) {
      rsi.push(100);
      continue;
    }
    const rs = (gains / period) / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }
  return rsi;
}

interface LegendData {
  price?: string;
  ema9?: string;
  ema21?: string;
  rsi?: string;
  change?: string;
  changePositive?: boolean;
  volume?: string;
}

interface StockChartProps {
  candles: OHLCVCandle[];
  showRsi?: boolean;
  height?: number;
  className?: string;
}

export function StockChart({ candles, showRsi, height, className }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<LegendData>({});

  const computedHeight = height ?? (typeof window !== 'undefined' && window.innerWidth < 640 ? 300 : 400);

  useEffect(() => {
    if (!containerRef.current || !candles.length) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#12121a' },
        textColor: '#94a3b8',
        fontFamily: 'var(--font-inter), system-ui',
      },
      grid: {
        vertLines: { color: '#1e1e2e' },
        horzLines: { color: '#1e1e2e' },
      },
      rightPriceScale: {
        borderColor: '#1e1e2e',
        scaleMargins: { top: 0.08, bottom: showRsi ? 0.2 : 0.28 },
      },
      timeScale: {
        borderColor: '#1e1e2e',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { labelVisible: true },
        horzLine: { labelVisible: true },
      },
      width: containerRef.current.clientWidth,
      height: computedHeight,
    });

    const toMs = (d: string | number) =>
      typeof d === 'number' ? d * 1000 : new Date(d).getTime();

    const normalizedCandles = Array.from(
      new Map(
        candles
          .slice()
          .sort((a, b) => toMs(a.date) - toMs(b.date))
          .map((c) => [String(c.date), c] as const)
      ).values()
    );

    const closes = normalizedCandles.map((c) => c.close);

    if (showRsi) {
      const rsiValues = calculateRSI(closes, 14);
      const lastRsi = rsiValues[rsiValues.length - 1] ?? 50;

      const rsiData = normalizedCandles.map((c, i) => ({
        time: c.date as Time,
        value: rsiValues[i] ?? 50,
      }));

      // RSI area series — gradient fill
      const rsiSeries = chart.addAreaSeries({
        lineColor: '#6366f1',
        topColor: 'rgba(99,102,241,0.18)',
        bottomColor: 'rgba(99,102,241,0.02)',
        lineWidth: 2,
        priceScaleId: 'rsi',
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      rsiSeries.setData(rsiData);

      // Referans çizgileri
      rsiSeries.createPriceLine({
        price: 70,
        color: '#ef444488',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '70',
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: '#22c55e88',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '30',
      });
      rsiSeries.createPriceLine({
        price: 50,
        color: '#ffffff18',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: false,
        title: '',
      });

      chart.priceScale('rsi').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0.05 },
        borderVisible: false,
      });

      setLegend({ rsi: lastRsi.toFixed(1) });

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          setLegend({ rsi: lastRsi.toFixed(1) });
          return;
        }
        const rsiPoint = param.seriesData.get(rsiSeries);
        if (rsiPoint && 'value' in rsiPoint) {
          setLegend({ rsi: rsiPoint.value.toFixed(1) });
        }
      });

      chart.timeScale().fitContent();
    } else {
      const cdlData: CandlestickData[] = normalizedCandles.map((c) => ({
        time: c.date as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });
      candlestickSeries.setData(cdlData);

      // Volume histogram
      const volumeSeries = chart.addHistogramSeries({
        priceScaleId: 'volume',
        color: '#6366f140',
      });
      volumeSeries.setData(
        normalizedCandles.map((c) => ({
          time: c.date as Time,
          value: c.volume ?? 0,
          color: c.close >= c.open ? '#22c55e28' : '#ef444428',
        }))
      );
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        borderVisible: false,
      });

      const ema9 = calculateEMA(closes, 9);
      const ema21 = calculateEMA(closes, 21);

      const ema9Series = chart.addLineSeries({
        color: '#6366f1',
        lineWidth: 2,
        title: 'EMA 9',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      ema9Series.setData(
        normalizedCandles.map((c, i) => ({
          time: c.date as Time,
          value: ema9[i] ?? c.close,
        }))
      );

      const ema21Series = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        title: 'EMA 21',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      ema21Series.setData(
        normalizedCandles.map((c, i) => ({
          time: c.date as Time,
          value: ema21[i] ?? c.close,
        }))
      );

      // İlk değerleri ayarla
      const lastCandle = normalizedCandles[normalizedCandles.length - 1];
      const lastEma9 = ema9[ema9.length - 1];
      const lastEma21 = ema21[ema21.length - 1];
      if (lastCandle) {
        const chg = ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100;
        setLegend({
          price: lastCandle.close.toFixed(2),
          ema9: lastEma9?.toFixed(2),
          ema21: lastEma21?.toFixed(2),
          change: chg.toFixed(2),
          changePositive: chg >= 0,
          volume: lastCandle.volume ? (lastCandle.volume / 1_000).toFixed(0) + 'K' : undefined,
        });
      }

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          if (lastCandle) {
            const chg = ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100;
            setLegend({
              price: lastCandle.close.toFixed(2),
              ema9: lastEma9?.toFixed(2),
              ema21: lastEma21?.toFixed(2),
              change: chg.toFixed(2),
              changePositive: chg >= 0,
              volume: lastCandle.volume ? (lastCandle.volume / 1_000).toFixed(0) + 'K' : undefined,
            });
          }
          return;
        }

        const candlePoint = param.seriesData.get(candlestickSeries);
        const ema9Point = param.seriesData.get(ema9Series);
        const ema21Point = param.seriesData.get(ema21Series);
        const volPoint = param.seriesData.get(volumeSeries);

        const newLegend: LegendData = {};

        if (candlePoint && 'close' in candlePoint) {
          newLegend.price = candlePoint.close.toFixed(2);
          const chg = ((candlePoint.close - candlePoint.open) / candlePoint.open) * 100;
          newLegend.change = chg.toFixed(2);
          newLegend.changePositive = chg >= 0;
        }
        if (ema9Point && 'value' in ema9Point) {
          newLegend.ema9 = ema9Point.value.toFixed(2);
        }
        if (ema21Point && 'value' in ema21Point) {
          newLegend.ema21 = ema21Point.value.toFixed(2);
        }
        if (volPoint && 'value' in volPoint) {
          newLegend.volume = (volPoint.value / 1_000).toFixed(0) + 'K';
        }

        setLegend(newLegend);
      });

      chart.timeScale().fitContent();
    }

    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, showRsi, computedHeight]);

  if (!candles.length) return null;

  const rsiVal = legend.rsi ? parseFloat(legend.rsi) : 50;
  const rsiColor = rsiVal >= 70 ? '#ef4444' : rsiVal <= 30 ? '#22c55e' : '#818cf8';
  const rsiZone = rsiVal >= 70 ? 'Aşırı Alım' : rsiVal <= 30 ? 'Aşırı Satım' : '';

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Legend overlay */}
      <div className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-background/80 px-2 py-1 text-xs backdrop-blur-sm">
        {showRsi ? (
          <>
            <span className="text-text-secondary/60">RSI(14)</span>
            <span className="font-mono font-semibold" style={{ color: rsiColor }}>
              {legend.rsi ?? '—'}
            </span>
            {rsiZone && (
              <span className="text-[10px] font-medium" style={{ color: rsiColor + 'bb' }}>
                {rsiZone}
              </span>
            )}
          </>
        ) : (
          <>
            {legend.price && (
              <>
                <span className="text-text-secondary">Fiyat</span>
                <span className="font-mono font-medium text-text-primary">{legend.price}</span>
              </>
            )}
            {legend.change && (
              <span className={`font-mono font-medium ${legend.changePositive ? 'text-bullish' : 'text-bearish'}`}>
                {legend.changePositive ? '+' : ''}{legend.change}%
              </span>
            )}
            {legend.ema9 && (
              <>
                <span className="text-indigo-400">EMA9</span>
                <span className="font-mono text-indigo-400">{legend.ema9}</span>
              </>
            )}
            {legend.ema21 && (
              <>
                <span className="text-amber-400">EMA21</span>
                <span className="font-mono text-amber-400">{legend.ema21}</span>
              </>
            )}
            {legend.volume && (
              <>
                <span className="text-text-secondary/60">Hacim</span>
                <span className="font-mono text-text-secondary/80">{legend.volume}</span>
              </>
            )}
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
  );
}
