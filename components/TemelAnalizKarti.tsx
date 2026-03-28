'use client';

/**
 * Hisse detay sayfasında temel analiz verilerini gösterir.
 * Veri kaynağı: AlphaVantage (ALPHA_VANTAGE_API_KEY gerektirir).
 * API key yoksa veya veri gelmezse sessizce gizlenir.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, BarChart2, DollarSign, Percent } from 'lucide-react';

interface Fundamentals {
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  peRatio: number | null;
  eps: number | null;
  revenuePerShareTTM: number | null;
  profitMargin: number | null;
  dividendYield: number | null;
  week52High: number;
  week52Low: number;
  movingAverage50: number | null;
  movingAverage200: number | null;
}

interface Props {
  sembol: string;
  currentPrice?: number;
}

function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `₺${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9)  return `₺${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6)  return `₺${(cap / 1e6).toFixed(0)}M`;
  return `₺${cap.toLocaleString('tr-TR')}`;
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
  const [data, setData] = useState<Fundamentals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/fundamentals?symbol=${encodeURIComponent(sembol)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d?.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
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

  if (!data) return null; // API key yoksa veya veri gelmezse hiç render etme

  // 52 hafta % konumu
  const week52Pct = currentPrice && data.week52High > data.week52Low
    ? ((currentPrice - data.week52Low) / (data.week52High - data.week52Low)) * 100
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

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Başlık */}
      <div className="mb-3 flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-text-primary">Temel Analiz</h3>
        <span className="ml-auto text-[10px] text-text-secondary/50 bg-surface border border-border rounded px-1.5 py-0.5">
          AlphaVantage
        </span>
      </div>

      {/* Sektör bilgisi */}
      {data.sector && data.sector !== 'Bilinmiyor' && (
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

      {/* Veri satırları */}
      <div>
        {data.marketCap > 0 && (
          <DataRow label="Piyasa Değeri" value={formatMarketCap(data.marketCap)} />
        )}
        {data.peRatio !== null && (
          <DataRow label="F/K Oranı" value={data.peRatio.toFixed(1)} color={peColor} />
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
      {data.week52High > 0 && data.week52Low > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-text-secondary">52 Hafta Aralığı</span>
            {week52Pct !== null && (
              <span className="text-text-secondary/70">%{week52Pct.toFixed(0)} konumda</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary mb-1">
            <span>₺{data.week52Low.toFixed(2)}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              {week52Pct !== null && (
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(2, week52Pct))}%` }}
                />
              )}
            </div>
            <span>₺{data.week52High.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
