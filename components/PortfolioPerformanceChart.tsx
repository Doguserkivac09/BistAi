'use client';

/**
 * Portföy performans grafiği
 * Her pozisyonun alış tarihi + miktar + günlük kapanış fiyatından
 * toplam portföy değerini zaman içinde hesaplar ve çizer.
 */

import { useEffect, useRef, useMemo } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import type { PortfolyoPozisyonWithStats } from '@/types';

interface Candle {
  date: string; // "YYYY-MM-DD"
  close: number;
}

interface Props {
  pozisyonlar: PortfolyoPozisyonWithStats[];
  ohlcvMap: Record<string, Candle[]>; // sembol → mum dizisi
}

function fmt(n: number) {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function PortfolioPerformanceChart({ pozisyonlar, ohlcvMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Günlük portföy değerini hesapla
  const { seriesData, totalCost, latestValue, pctChange } = useMemo(() => {
    if (!pozisyonlar.length) return { seriesData: [], totalCost: 0, latestValue: 0, pctChange: 0 };

    // Tüm tarihleri birleştir (tüm sembollerin ortak iş günleri)
    const dateSet = new Set<string>();
    for (const sembol of Object.keys(ohlcvMap)) {
      for (const c of ohlcvMap[sembol] ?? []) {
        dateSet.add(c.date);
      }
    }
    const allDates = Array.from(dateSet).sort();
    if (!allDates.length) return { seriesData: [], totalCost: 0, latestValue: 0, pctChange: 0 };

    // Her tarih için fiyat map'i oluştur
    const priceByDate: Record<string, Record<string, number>> = {};
    for (const [sembol, candles] of Object.entries(ohlcvMap)) {
      for (const c of candles) {
        if (!priceByDate[c.date]) priceByDate[c.date] = {};
        priceByDate[c.date]![sembol] = c.close;
      }
    }

    // Her tarihte toplam portföy değerini hesapla
    const points: { time: string; value: number }[] = [];
    let lastKnownPrices: Record<string, number> = {};

    for (const date of allDates) {
      // Fiyatları güncelle (forward-fill)
      lastKnownPrices = { ...lastKnownPrices, ...(priceByDate[date] ?? {}) };

      let total = 0;
      for (const poz of pozisyonlar) {
        // Sadece alış tarihinden sonraki günleri say
        if (date < poz.alis_tarihi) continue;
        const price = lastKnownPrices[poz.sembol];
        if (price) total += poz.miktar * price;
      }
      if (total > 0) points.push({ time: date, value: total });
    }

    const totalCost = pozisyonlar.reduce((s, p) => s + p.maliyet, 0);
    const latestValue = points[points.length - 1]?.value ?? totalCost;
    const pctChange = totalCost > 0 ? ((latestValue - totalCost) / totalCost) * 100 : 0;

    return { seriesData: points, totalCost, latestValue, pctChange };
  }, [pozisyonlar, ohlcvMap]);

  useEffect(() => {
    if (!containerRef.current || !seriesData.length) return;

    const profit = latestValue >= totalCost;
    const lineColor = profit ? '#10b981' : '#ef4444';
    const areaTop   = profit ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    const areaBot   = profit ? 'rgba(16, 185, 129, 0.01)' : 'rgba(239, 68, 68, 0.01)';

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.2)', width: 1 },
        horzLine: { color: 'rgba(255,255,255,0.2)', width: 1 },
      },
      width: containerRef.current.clientWidth,
      height: 220,
    });

    // Alan serisi
    const areaSeries = chart.addAreaSeries({
      lineColor,
      topColor: areaTop,
      bottomColor: areaBot,
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: fmt },
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBackgroundColor: lineColor,
    });
    areaSeries.setData(seriesData);

    // Maliyet (baseline) çizgisi
    areaSeries.createPriceLine({
      price: totalCost,
      color: 'rgba(148,163,184,0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Maliyet',
    });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [seriesData, totalCost, latestValue]);

  if (!seriesData.length) return null;

  const profit = pctChange >= 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 mb-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-text-muted mb-0.5">Portföy Değeri</p>
          <p className="text-xl font-bold text-text-primary">{fmt(latestValue)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted mb-0.5">Toplam Getiri</p>
          <p className={`text-lg font-semibold ${profit ? 'text-emerald-400' : 'text-red-400'}`}>
            {profit ? '+' : ''}{pctChange.toFixed(2)}%
          </p>
          <p className={`text-xs ${profit ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
            {profit ? '+' : ''}{fmt(latestValue - totalCost)}
          </p>
        </div>
      </div>

      {/* Grafik */}
      <div ref={containerRef} />

      <p className="text-[10px] text-text-muted mt-2">
        Kesik çizgi = toplam maliyet · Fiyatlar Yahoo Finance&apos;tan çekilir
      </p>
    </div>
  );
}
