'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
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

interface StockChartProps {
  candles: OHLCVCandle[];
  showRsi?: boolean;
  height?: number;
}

export function StockChart({ candles, showRsi, height = 400 }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

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
        scaleMargins: { top: 0.1, bottom: showRsi ? 0.2 : 0.1 },
      },
      timeScale: {
        borderColor: '#1e1e2e',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height,
    });

    if (showRsi) {
      const closes = candles.map((c) => c.close);
      const rsiValues = calculateRSI(closes, 14);
      const rsiData = candles.map((c, i) => ({
        time: c.date as string,
        value: rsiValues[i] ?? 50,
      }));

      const rsiSeries = chart.addLineSeries({
        color: '#6366f1',
        lineWidth: 2,
        priceScaleId: 'rsi',
      });
      rsiSeries.setData(rsiData);
      chart.priceScale('rsi').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0.1 },
        borderVisible: false,
      });
      chart.timeScale().fitContent();
    } else {
      const cdlData: CandlestickData[] = candles.map((c) => ({
        time: c.date as string,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
      });
      candlestickSeries.setData(cdlData);

      const closes = candles.map((c) => c.close);
      const ema9 = calculateEMA(closes, 9);
      const ema21 = calculateEMA(closes, 21);

      const ema9Series = chart.addLineSeries({
        color: '#6366f1',
        lineWidth: 2,
        title: 'EMA 9',
      });
      ema9Series.setData(
        candles.map((c, i) => ({ time: c.date as string, value: ema9[i] ?? c.close }))
      );

      const ema21Series = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        title: 'EMA 21',
      });
      ema21Series.setData(
        candles.map((c, i) => ({ time: c.date as string, value: ema21[i] ?? c.close }))
      );

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
  }, [candles, showRsi, height]);

  if (!candles.length) return null;

  return <div ref={containerRef} className="w-full" />;
}
