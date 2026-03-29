'use client';

/**
 * Hisse detay sayfasında temel analiz verilerini gösterir.
 * Veri kaynağı: Yahoo Finance (yahoo-finance2 — API key gerektirmez).
 * Veri gelmezse sessizce gizlenir.
 */

import { useEffect, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import type { YahooFundamentals } from '@/lib/yahoo-fundamentals';

interface Props {
  sembol: string;
  currentPrice?: number;
}

function formatVal(val: number): string {
  if (val >= 1e12) return `₺${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9)  return `₺${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6)  return `₺${(val / 1e6).toFixed(0)}M`;
  return `₺${val.toLocaleString('tr-TR')}`;
}

function DataRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`text-sm font-semibold ${color ?? 'text-text-primary'}`}>{value}</span>
    </div>
  );
}

export function TemelAnalizKarti({ sembol, currentPrice }: Props) {
  const [data, setData] = useState<YahooFundamentals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/fundamentals/${encodeURIComponent(sembol)}`)
      .then(r => r.ok ? r.json() as Promise<YahooFundamentals> : null)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sembol]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-7 animate-pulse rounded bg-white/5" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const week52High = data.week52High;
  const week52Low  = data.week52Low;

  const week52Pct = (currentPrice && week52High && week52Low && week52High > week52Low)
    ? ((currentPrice - week52Low) / (week52High - week52Low)) * 100
    : null;

  const peColor = data.peRatio
    ? data.peRatio < 10 ? 'text-emerald-400'
      : data.peRatio < 25 ? 'text-text-primary'
      : 'text-orange-400'
    : 'text-text-secondary';

  const marginColor = data.profitMargin
    ? data.profitMargin >= 0.15 ? 'text-emerald-400'
      : data.profitMargin >= 0 ? 'text-text-primary'
      : 'text-red-400'
    : 'text-text-secondary';

  const hasFinancial = data.currentRatio !== null
    || data.totalDebt !== null
    || data.totalCash !== null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Başlık */}
      <div className="mb-3 flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-text-primary">Temel Analiz</h3>
        <span className="ml-auto text-[10px] text-text-secondary/50 bg-surface border border-border rounded px-1.5 py-0.5">
          Yahoo Finance
        </span>
      </div>

      {/* Sektör bilgisi */}
      {data.sector && (
        <div className="mb-3 flex flex-wrap gap-1">
          <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-text-secondary">
            {data.sector}
          </span>
          {data.industry && data.industry !== data.sector && (
            <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-text-secondary/60">
              {data.industry}
            </span>
          )}
        </div>
      )}

      {/* Değerleme metrikleri */}
      <div>
        {data.marketCap !== null && data.marketCap > 0 && (
          <DataRow label="Piyasa Değeri" value={formatVal(data.marketCap)} />
        )}
        {data.peRatio !== null && (
          <DataRow label="F/K Oranı" value={`${data.peRatio.toFixed(1)}x`} color={peColor} />
        )}
        {data.priceToBook !== null && (
          <DataRow label="F/DD Oranı" value={`${data.priceToBook.toFixed(2)}x`} />
        )}
        {data.eps !== null && (
          <DataRow
            label="Hisse Başı Kâr (EPS)"
            value={`₺${data.eps.toFixed(2)}`}
            color={data.eps >= 0 ? 'text-text-primary' : 'text-red-400'}
          />
        )}
        {data.profitMargin !== null && (
          <DataRow
            label="Net Kâr Marjı"
            value={`%${(data.profitMargin * 100).toFixed(1)}`}
            color={marginColor}
          />
        )}
        {data.dividendYield !== null && data.dividendYield > 0 && (
          <DataRow
            label="Temettü Verimi"
            value={`%${(data.dividendYield * 100).toFixed(2)}`}
            color="text-emerald-400"
          />
        )}
      </div>

      {/* 52 Hafta Aralığı */}
      {week52High !== null && week52Low !== null && week52High > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-text-secondary">52 Hafta Aralığı</span>
            {week52Pct !== null && (
              <span className="text-text-secondary/70">%{week52Pct.toFixed(0)} konumda</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary mb-1">
            <span>₺{week52Low.toFixed(2)}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              {week52Pct !== null && (
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(2, week52Pct))}%` }}
                />
              )}
            </div>
            <span>₺{week52High.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Finansal Veriler */}
      {hasFinancial && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <p className="text-[10px] font-medium text-text-secondary/60 uppercase tracking-wider mb-2">
            Finansal Durum
          </p>
          {data.currentRatio !== null && (
            <DataRow
              label="Cari Oran"
              value={`${data.currentRatio.toFixed(2)}x`}
              color={
                data.currentRatio >= 2 ? 'text-emerald-400'
                : data.currentRatio >= 1 ? 'text-text-primary'
                : 'text-orange-400'
              }
            />
          )}
          {data.totalCash !== null && data.totalCash > 0 && (
            <DataRow label="Nakit & Eşdeğerleri" value={formatVal(data.totalCash)} />
          )}
          {data.totalDebt !== null && data.totalDebt > 0 && (
            <DataRow label="Toplam Borç" value={formatVal(data.totalDebt)} />
          )}
        </div>
      )}
    </div>
  );
}
