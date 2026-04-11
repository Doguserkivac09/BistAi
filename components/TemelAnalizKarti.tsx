'use client';

/**
 * Hisse detay sayfasında temel analiz verilerini gösterir.
 * Veri kaynağı: Yahoo Finance (yahoo-finance2 — API key gerektirmez).
 * Veri gelmezse sessizce gizlenir.
 */

import { useEffect, useState } from 'react';
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

function MetricCard({
  label, value, sub, color, badge,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  badge?: { text: string; color: string };
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3.5 flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`text-xl font-bold font-mono leading-none ${color ?? 'text-text-primary'}`}>{value}</p>
      <div className="flex items-center gap-1.5 min-h-[16px]">
        {sub && <p className="text-[10px] text-text-muted flex-1">{sub}</p>}
        {badge && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${badge.color}`}>
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-4 pb-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

function FinancialRow({
  label, value, color, note,
}: {
  label: string; value: string; color?: string; note?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
      <div>
        <p className="text-xs text-text-secondary">{label}</p>
        {note && <p className="text-[10px] text-text-muted mt-0.5">{note}</p>}
      </div>
      <span className={`text-sm font-bold font-mono ${color ?? 'text-text-primary'}`}>{value}</span>
    </div>
  );
}

function MaRow({
  label, maValue, price, isAbove,
}: {
  label: string; maValue: number; price: number; isAbove: boolean;
}) {
  const diff = ((price - maValue) / maValue) * 100;
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-medium ${isAbove ? 'text-emerald-400' : 'text-red-400'}`}>
          {isAbove ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}%
        </span>
        <span className="text-xs font-mono font-semibold text-text-primary">
          ₺{maValue.toFixed(2)}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
          isAbove ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {isAbove ? 'Üstünde' : 'Altında'}
        </span>
      </div>
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
      <div className="space-y-3 animate-pulse">
        <div className="flex gap-2">
          <div className="h-6 w-24 rounded-full bg-surface" />
          <div className="h-6 w-32 rounded-full bg-surface" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-[88px] rounded-xl bg-surface" />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-[88px] rounded-xl bg-surface" />)}
        </div>
        <div className="h-28 rounded-xl bg-surface" />
        <div className="h-24 rounded-xl bg-surface" />
      </div>
    );
  }

  if (!data) return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center">
      <p className="text-sm text-text-secondary">Temel veri bulunamadı.</p>
    </div>
  );

  const week52High = data.week52High;
  const week52Low  = data.week52Low;
  const week52Pct  = (currentPrice && week52High && week52Low && week52High > week52Low)
    ? ((currentPrice - week52Low) / (week52High - week52Low)) * 100
    : null;

  const peColor = data.peRatio
    ? data.peRatio < 10 ? 'text-emerald-400' : data.peRatio < 25 ? 'text-text-primary' : 'text-orange-400'
    : undefined;
  const peBadge = data.peRatio
    ? data.peRatio < 10
      ? { text: 'Ucuz', color: 'bg-emerald-500/10 text-emerald-400' }
      : data.peRatio < 25
      ? { text: 'Makul', color: 'bg-amber-500/10 text-amber-400' }
      : { text: 'Pahalı', color: 'bg-orange-500/10 text-orange-400' }
    : undefined;

  const marginColor = data.profitMargin
    ? data.profitMargin >= 0.15 ? 'text-emerald-400' : data.profitMargin >= 0 ? 'text-text-primary' : 'text-red-400'
    : undefined;
  const marginSub = data.profitMargin !== null
    ? data.profitMargin >= 0.15 ? 'Güçlü karlılık' : data.profitMargin >= 0 ? 'Pozitif' : 'Negatif'
    : undefined;

  const curRatioColor = data.currentRatio
    ? data.currentRatio >= 2 ? 'text-emerald-400' : data.currentRatio >= 1 ? 'text-text-primary' : 'text-orange-400'
    : undefined;
  const curRatioNote = data.currentRatio !== null
    ? data.currentRatio >= 2 ? 'Güçlü likidite' : data.currentRatio >= 1 ? 'Yeterli likidite' : 'Zayıf likidite'
    : undefined;

  const hasMovingAvgs = currentPrice && (data.movingAverage50 || data.movingAverage200);
  const hasFinancial  = data.currentRatio !== null || data.totalDebt !== null || data.totalCash !== null;

  return (
    <div>
      {/* Sektör & Kaynak */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {data.sector && (
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {data.sector}
          </span>
        )}
        {data.industry && data.industry !== data.sector && (
          <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-text-muted">
            {data.industry}
          </span>
        )}
        <span className="ml-auto text-[10px] text-text-secondary/40 bg-surface border border-border/50 rounded px-1.5 py-0.5">
          Yahoo Finance
        </span>
      </div>

      {/* ─── Değerleme ──────────────────────────────────────────────────── */}
      <SectionTitle>Değerleme</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.marketCap !== null && data.marketCap > 0 && (
          <MetricCard
            label="Piyasa Değeri"
            value={formatVal(data.marketCap)}
            sub="Toplam değer"
          />
        )}
        {data.peRatio !== null && (
          <MetricCard
            label="F/K Oranı"
            value={`${data.peRatio.toFixed(1)}x`}
            color={peColor}
            badge={peBadge}
            sub="Fiyat / Kazanç"
          />
        )}
        {data.priceToBook !== null && (
          <MetricCard
            label="F/DD Oranı"
            value={`${data.priceToBook.toFixed(2)}x`}
            sub="Fiyat / Defter"
          />
        )}
        {data.eps !== null && (
          <MetricCard
            label="EPS"
            value={`₺${data.eps.toFixed(2)}`}
            color={data.eps >= 0 ? 'text-emerald-400' : 'text-red-400'}
            sub="Hisse Başı Kâr"
            badge={
              data.eps >= 0
                ? { text: 'Kârlı', color: 'bg-emerald-500/10 text-emerald-400' }
                : { text: 'Zararlı', color: 'bg-red-500/10 text-red-400' }
            }
          />
        )}
      </div>

      {/* ─── Karlılık & Temettü ─────────────────────────────────────────── */}
      <SectionTitle>Karlılık &amp; Temettü</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {data.profitMargin !== null && (
          <MetricCard
            label="Net Kâr Marjı"
            value={`%${(data.profitMargin * 100).toFixed(1)}`}
            color={marginColor}
            sub={marginSub}
          />
        )}
        {data.dividendYield !== null && data.dividendYield > 0 ? (
          <MetricCard
            label="Temettü Verimi"
            value={`%${(data.dividendYield * 100).toFixed(2)}`}
            color="text-emerald-400"
            sub="Yıllık temettü oranı"
            badge={{ text: 'Temettü var', color: 'bg-emerald-500/10 text-emerald-400' }}
          />
        ) : (
          <div className="rounded-xl border border-border bg-background/60 p-3.5 flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Temettü Verimi</p>
            <p className="text-xl font-bold text-text-muted">—</p>
            <p className="text-[10px] text-text-muted">Temettü dağıtılmıyor</p>
          </div>
        )}
      </div>

      {/* ─── 52 Hafta Aralığı ───────────────────────────────────────────── */}
      {week52High !== null && week52Low !== null && week52High > 0 && (
        <>
          <SectionTitle>52 Hafta Aralığı</SectionTitle>
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-center justify-between text-xs mb-4">
              <div className="text-center">
                <p className="text-[10px] text-text-muted mb-0.5">52H Düşük</p>
                <p className="font-mono font-bold text-red-400">₺{week52Low.toFixed(2)}</p>
              </div>
              {week52Pct !== null && (
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                  week52Pct >= 70 ? 'bg-emerald-500/15 text-emerald-400' :
                  week52Pct >= 30 ? 'bg-amber-500/15 text-amber-400' :
                  'bg-red-500/15 text-red-400'
                }`}>
                  %{week52Pct.toFixed(0)} konumda
                </span>
              )}
              <div className="text-center">
                <p className="text-[10px] text-text-muted mb-0.5">52H Yüksek</p>
                <p className="font-mono font-bold text-emerald-400">₺{week52High.toFixed(2)}</p>
              </div>
            </div>
            <div className="relative h-3 rounded-full bg-gradient-to-r from-red-500/25 via-amber-500/15 to-emerald-500/25">
              {week52Pct !== null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-background shadow-lg bg-primary transition-all"
                  style={{ left: `calc(${Math.min(95, Math.max(5, week52Pct))}% - 10px)` }}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Teknik Seviyeler (MA) ───────────────────────────────────────── */}
      {hasMovingAvgs && (
        <>
          <SectionTitle>Teknik Seviyeler</SectionTitle>
          <div className="rounded-xl border border-border bg-background/60 px-4 divide-y divide-border/30">
            {currentPrice && data.movingAverage50 && (
              <MaRow
                label="MA 50 (Kısa Vade)"
                maValue={data.movingAverage50}
                price={currentPrice}
                isAbove={currentPrice > data.movingAverage50}
              />
            )}
            {currentPrice && data.movingAverage200 && (
              <MaRow
                label="MA 200 (Uzun Vade)"
                maValue={data.movingAverage200}
                price={currentPrice}
                isAbove={currentPrice > data.movingAverage200}
              />
            )}
          </div>
        </>
      )}

      {/* ─── Finansal Sağlık ─────────────────────────────────────────────── */}
      {hasFinancial && (
        <>
          <SectionTitle>Finansal Sağlık</SectionTitle>
          <div className="rounded-xl border border-border bg-background/60 px-4">
            {data.currentRatio !== null && (
              <FinancialRow
                label="Cari Oran"
                value={`${data.currentRatio.toFixed(2)}x`}
                color={curRatioColor}
                note={curRatioNote}
              />
            )}
            {data.totalCash !== null && data.totalCash > 0 && (
              <FinancialRow
                label="Nakit & Eşdeğerleri"
                value={formatVal(data.totalCash)}
                color="text-emerald-400"
              />
            )}
            {data.totalDebt !== null && data.totalDebt > 0 && (
              <FinancialRow
                label="Toplam Borç"
                value={formatVal(data.totalDebt)}
                color="text-red-400"
              />
            )}
            {data.totalDebt !== null && data.totalCash !== null && data.totalDebt > 0 && data.totalCash > 0 && (
              <FinancialRow
                label="Net Borç"
                value={formatVal(Math.abs(data.totalDebt - data.totalCash))}
                color={data.totalDebt > data.totalCash ? 'text-orange-400' : 'text-emerald-400'}
                note={data.totalDebt > data.totalCash ? 'Borç > Nakit' : 'Nakit > Borç'}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
