'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import type { OHLCVCandle } from '@/types';
import { cn } from '@/lib/utils';

interface MiniChartProps {
  data: OHLCVCandle[];
  height?: number;
  className?: string;
  positive?: boolean;
}

export function MiniChart({ data, height = 56, className, positive }: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: 'var(--font-inter), system-ui',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { visible: false },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      height,
      width: containerRef.current.clientWidth,
    });

    const lineColor = positive === true ? '#22c55e' : positive === false ? '#ef4444' : '#6366f1';
    const lineSeries = chart.addLineSeries({
      color: lineColor,
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const seriesData = data.map((c) => ({
      time: c.date as string,
      value: c.close,
    }));

    lineSeries.setData(seriesData);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = lineSeries;

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
      seriesRef.current = null;
    };
  }, [data, height]);

  if (!data.length) {
    return (
      <div
        className={cn('flex items-center justify-center rounded bg-surface/50 text-text-secondary text-xs', className)}
        style={{ height }}
      >
        Veri yok
      </div>
    );
  }

  return <div ref={containerRef} className={cn(className)} style={{ height }} />;
}
