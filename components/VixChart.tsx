'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type LineData,
  type Time,
} from 'lightweight-charts';

interface VixDataPoint {
  date: string;
  close: number;
}

interface VixChartProps {
  data: VixDataPoint[];
  height?: number;
}

function computeSMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += values[j]!;
    }
    result.push(sum / period);
  }
  return result;
}

export default function VixChart({ data, height = 250 }: VixChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    try {
      // Sırala ve deduplicate et
      const sorted = [...data]
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter((d, i, arr) => i === 0 || d.date !== arr[i - 1]!.date);

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#a1a1aa',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#27272a' },
          horzLines: { color: '#27272a' },
        },
        rightPriceScale: { borderColor: '#3f3f46' },
        timeScale: { borderColor: '#3f3f46' },
        crosshair: {
          vertLine: { color: '#71717a', labelBackgroundColor: '#27272a' },
          horzLine: { color: '#71717a', labelBackgroundColor: '#27272a' },
        },
      });
      chartRef.current = chart;

      // VIX çizgisi
      const vixSeries = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        title: 'VIX',
      });

      const vixLineData: LineData[] = sorted.map((d) => ({
        time: d.date as Time,
        value: d.close,
      }));
      vixSeries.setData(vixLineData);

      // SMA20 çizgisi
      const closes = sorted.map((d) => d.close);
      const sma20Values = computeSMA(closes, 20);

      const sma20Series = chart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: 2,
        title: 'SMA20',
      });

      const sma20Data: LineData[] = [];
      for (let i = 0; i < sorted.length; i++) {
        const val = sma20Values[i];
        if (val != null) {
          sma20Data.push({
            time: sorted[i]!.date as Time,
            value: val,
          });
        }
      }
      sma20Series.setData(sma20Data);

      chart.timeScale().fitContent();

      // Resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        chart.remove();
        chartRef.current = null;
      };
    } catch {
      setError(true);
    }
  }, [data, height]);

  if (error) {
    return (
      <div className="h-[250px] flex items-center justify-center text-zinc-500 text-sm">
        VIX grafik yüklenemedi.
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-zinc-500 text-sm">
        VIX verisi bulunamadı.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
      <h3 className="text-lg font-semibold text-zinc-100 mb-3">
        VIX Volatilite Endeksi
      </h3>
      <div ref={containerRef} />
    </div>
  );
}
