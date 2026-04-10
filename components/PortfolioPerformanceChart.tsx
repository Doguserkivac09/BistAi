'use client';

/**
 * Portföy performans grafiği
 * Her pozisyonun alış tarihi + miktar + günlük kapanış fiyatından
 * toplam portföy değerini zaman içinde hesaplar ve çizer.
 *
 * Hisse seçici dropdown ile tek hisse görüntüleme desteklenir.
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import { ChevronDown } from 'lucide-react';
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
  const [selectedSembol, setSelectedSembol] = useState<string>('__all__');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Seçime göre filtrelenmiş pozisyonlar
  const filteredPozisyonlar = useMemo(() => {
    if (selectedSembol === '__all__') return pozisyonlar;
    return pozisyonlar.filter(p => p.sembol === selectedSembol);
  }, [pozisyonlar, selectedSembol]);

  const { seriesData, totalCost, latestValue, pctChange } = useMemo(() => {
    if (!filteredPozisyonlar.length) return { seriesData: [], totalCost: 0, latestValue: 0, pctChange: 0 };

    // Tüm tarihleri birleştir
    const dateSet = new Set<string>();
    const relevantSymbols = filteredPozisyonlar.map(p => p.sembol);
    for (const sembol of relevantSymbols) {
      for (const c of ohlcvMap[sembol] ?? []) {
        dateSet.add(c.date);
      }
    }
    const allDates = Array.from(dateSet).sort();
    if (!allDates.length) return { seriesData: [], totalCost: 0, latestValue: 0, pctChange: 0 };

    // Her tarih için fiyat map'i
    const priceByDate: Record<string, Record<string, number>> = {};
    for (const sembol of relevantSymbols) {
      for (const c of ohlcvMap[sembol] ?? []) {
        if (!priceByDate[c.date]) priceByDate[c.date] = {};
        priceByDate[c.date]![sembol] = c.close;
      }
    }

    // Her tarihte toplam değeri hesapla
    const points: { time: string; value: number }[] = [];
    let lastKnownPrices: Record<string, number> = {};

    for (const date of allDates) {
      lastKnownPrices = { ...lastKnownPrices, ...(priceByDate[date] ?? {}) };

      let total = 0;
      for (const poz of filteredPozisyonlar) {
        if (date < poz.alis_tarihi) continue;
        const price = lastKnownPrices[poz.sembol];
        if (price) total += poz.miktar * price;
      }
      if (total > 0) points.push({ time: date, value: total });
    }

    const totalCost = filteredPozisyonlar.reduce((s, p) => s + p.maliyet, 0);
    const latestValue = points[points.length - 1]?.value ?? totalCost;
    const pctChange = totalCost > 0 ? ((latestValue - totalCost) / totalCost) * 100 : 0;

    return { seriesData: points, totalCost, latestValue, pctChange };
  }, [filteredPozisyonlar, ohlcvMap]);

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
  const selectedPoz = selectedSembol !== '__all__'
    ? pozisyonlar.find(p => p.sembol === selectedSembol)
    : null;

  const baslikLabel = selectedPoz ? `${selectedPoz.sembol} Değeri` : 'Portföy Değeri';
  const alisLabel   = selectedPoz
    ? `${selectedPoz.miktar} lot · alış ₺${selectedPoz.alis_fiyati}`
    : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 mb-6">
      {/* Başlık satırı */}
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          {/* Hisse seçici */}
          <div className="relative mb-2">
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/10 transition-colors"
            >
              <span>{selectedSembol === '__all__' ? 'Tüm Portföy' : selectedSembol}</span>
              <ChevronDown className={`h-3 w-3 text-text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-border bg-[#1e2130] shadow-xl">
                <button
                  onClick={() => { setSelectedSembol('__all__'); setDropdownOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors first:rounded-t-lg ${selectedSembol === '__all__' ? 'text-indigo-400 font-semibold' : 'text-text-secondary'}`}
                >
                  Tüm Portföy
                </button>
                {pozisyonlar.map(p => (
                  <button
                    key={p.sembol}
                    onClick={() => { setSelectedSembol(p.sembol); setDropdownOpen(false); }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors last:rounded-b-lg ${selectedSembol === p.sembol ? 'text-indigo-400 font-semibold' : 'text-text-secondary'}`}
                  >
                    {p.sembol}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-text-muted mb-0.5">{baslikLabel}</p>
          <p className="text-xl font-bold text-text-primary">{fmt(latestValue)}</p>
          {alisLabel && (
            <p className="text-[11px] text-text-muted mt-0.5">{alisLabel}</p>
          )}
        </div>

        <div className="text-right shrink-0">
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
        Kesik çizgi = {selectedPoz ? 'alış maliyeti' : 'toplam maliyet'} · Fiyatlar Yahoo Finance&apos;tan çekilir
      </p>
    </div>
  );
}
