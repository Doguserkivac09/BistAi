'use client';

/**
 * Hisse detay sayfasında temel analiz verilerini gösterir.
 * Veri kaynağı: AlphaVantage (ALPHA_VANTAGE_API_KEY gerektirir).
 * API key yoksa veya veri gelmezse sessizce gizlenir.
 */

import { useEffect, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import type { AVFundamentals, AVBalanceSheet } from '@/lib/alpha-vantage';

interface FundamentalsResponse {
  overview: AVFundamentals;
  balance: AVBalanceSheet | null;
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
  const [data, setData] = useState<FundamentalsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/fundamentals/${encodeURIComponent(sembol)}`)
      .then(r => r.ok ? r.json() as Promise<FundamentalsResponse> : null)
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

  if (!data) return null; // API key yoksa veya veri gelmezse hiç render etme

  const ov = data.overview;
  const bl = data.balance;

  // 52 hafta % konumu
  const week52Pct = currentPrice && ov.week52High > ov.week52Low
    ? ((currentPrice - ov.week52Low) / (ov.week52High - ov.week52Low)) * 100
    : null;

  const peColor = ov.peRatio
    ? ov.peRatio < 10 ? 'text-emerald-400'
      : ov.peRatio < 25 ? 'text-text-primary'
      : 'text-orange-400'
    : 'text-text-secondary';

  const marginColor = ov.profitMargin
    ? ov.profitMargin >= 0.15 ? 'text-emerald-400'
      : ov.profitMargin >= 0 ? 'text-text-primary'
      : 'text-red-400'
    : 'text-text-secondary';

  // Cari oran
  const cariOran = (bl?.totalCurrentAssets && bl?.totalCurrentLiabilities)
    ? bl.totalCurrentAssets / bl.totalCurrentLiabilities
    : null;

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
      {ov.sector && ov.sector !== 'Bilinmiyor' && (
        <div className="mb-3 flex flex-wrap gap-1">
          <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-text-secondary">
            {ov.sector}
          </span>
          {ov.industry && ov.industry !== ov.sector && (
            <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-text-secondary/60">
              {ov.industry}
            </span>
          )}
        </div>
      )}

      {/* Değerleme metrikleri */}
      <div>
        {ov.marketCap > 0 && (
          <DataRow label="Piyasa Değeri" value={formatMarketCap(ov.marketCap)} />
        )}
        {ov.peRatio !== null && (
          <DataRow label="F/K Oranı" value={`${ov.peRatio.toFixed(1)}x`} color={peColor} />
        )}
        {ov.eps !== null && (
          <DataRow
            label="Hisse Başı Kâr (EPS)"
            value={`₺${ov.eps.toFixed(2)}`}
            color={ov.eps >= 0 ? 'text-text-primary' : 'text-red-400'}
          />
        )}
        {ov.profitMargin !== null && (
          <DataRow
            label="Net Kâr Marjı"
            value={`%${(ov.profitMargin * 100).toFixed(1)}`}
            color={marginColor}
          />
        )}
        {ov.dividendYield !== null && ov.dividendYield > 0 && (
          <DataRow
            label="Temettü Verimi"
            value={`%${(ov.dividendYield * 100).toFixed(2)}`}
            color="text-emerald-400"
          />
        )}
      </div>

      {/* 52 Hafta Aralığı */}
      {ov.week52High > 0 && ov.week52Low > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-text-secondary">52 Hafta Aralığı</span>
            {week52Pct !== null && (
              <span className="text-text-secondary/70">%{week52Pct.toFixed(0)} konumda</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary mb-1">
            <span>₺{ov.week52Low.toFixed(2)}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              {week52Pct !== null && (
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(2, week52Pct))}%` }}
                />
              )}
            </div>
            <span>₺{ov.week52High.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Bilanço — sadece veri varsa */}
      {bl && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <p className="text-[10px] font-medium text-text-secondary/60 uppercase tracking-wider mb-2">
            Bilanço
            {bl.reportedDate && (
              <span className="ml-1 normal-case text-text-secondary/40">({bl.reportedDate})</span>
            )}
          </p>
          {bl.totalCurrentAssets !== null && (
            <DataRow label="Dönen Varlıklar" value={formatMarketCap(bl.totalCurrentAssets)} />
          )}
          {bl.totalCurrentLiabilities !== null && (
            <DataRow label="Kısa Vadeli Borç (KVB)" value={formatMarketCap(bl.totalCurrentLiabilities)} />
          )}
          {cariOran !== null && (
            <DataRow
              label="Cari Oran"
              value={`${cariOran.toFixed(2)}x`}
              color={
                cariOran >= 2 ? 'text-emerald-400'
                : cariOran >= 1 ? 'text-text-primary'
                : 'text-orange-400'
              }
            />
          )}
          {bl.totalShareholderEquity !== null && (
            <DataRow label="Öz Kaynaklar" value={formatMarketCap(bl.totalShareholderEquity)} />
          )}
          {bl.longTermDebt !== null && bl.longTermDebt > 0 && (
            <DataRow label="Uzun Vadeli Borç" value={formatMarketCap(bl.longTermDebt)} />
          )}
        </div>
      )}
    </div>
  );
}
