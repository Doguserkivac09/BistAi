'use client';

/**
 * Hisse detay sayfasında kurumsal & içeriden sahiplik yapısını gösterir.
 * Kaynak: Yahoo Finance (yahoo-finance2 — API key gerektirmez).
 *
 * Yorumlama:
 *  - Kurumsal sahiplik yüksek (>%40) → yabancı/kurumsal ilgi güçlü → bullish eğilim
 *  - Short Ratio yüksek (>5) → açığa satış baskısı var → dikkat
 *  - İçeriden sahiplik düşük (<5%) → yönetim hisseye güvensiz olabilir
 */

import { useEffect, useState } from 'react';
import type { YahooFundamentals } from '@/lib/yahoo-fundamentals';

interface Props {
  sembol: string;
}

function Gauge({
  value,
  label,
  color,
  max = 100,
}: {
  value: number;
  label: string;
  color: string;
  max?: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted">{label}</span>
        <span className={`text-xs font-bold font-mono ${color}`}>
          %{value.toFixed(1)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function TakasKarti({ sembol }: Props) {
  const [data, setData]       = useState<YahooFundamentals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    fetch(`/api/fundamentals/${encodeURIComponent(sembol)}`)
      .then((r) => (r.ok ? (r.json() as Promise<YahooFundamentals>) : null))
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [sembol]);

  if (loading) return <TakasSkeleton />;

  // Gerekli alanların ikisi de null ise kartı gizle
  if (
    !data ||
    (data.institutionsPercentHeld === null && data.insidersPercentHeld === null)
  ) {
    return null;
  }

  const instPct    = data.institutionsPercentHeld !== null
    ? data.institutionsPercentHeld * 100
    : null;
  const insiderPct = data.insidersPercentHeld !== null
    ? data.insidersPercentHeld * 100
    : null;
  const shortRatio = data.shortRatio;

  // Kurumsal sahiplik sinyali
  const instSignal =
    instPct === null    ? 'nötr'
    : instPct >= 40     ? 'bullish'
    : instPct >= 20     ? 'nötr'
    : 'bearish';

  const instConfig = {
    bullish: {
      label: 'Güçlü Kurumsal İlgi',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      icon: '🏦',
    },
    nötr: {
      label: 'Orta Kurumsal İlgi',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/30',
      icon: '⚖️',
    },
    bearish: {
      label: 'Düşük Kurumsal İlgi',
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/30',
      icon: '📉',
    },
  } as const;

  const cfg = instConfig[instSignal];

  // Short ratio uyarısı
  const shortWarning = shortRatio !== null && shortRatio > 5;

  // Açıklama metni
  const aciklama =
    instPct === null
      ? 'Kurumsal sahiplik verisi mevcut değil.'
      : instPct >= 40
      ? `Hissenin %${instPct.toFixed(1)}'i kurumsal yatırımcılar tarafından tutuluyor. Bu oran, güçlü kurumsal / yabancı ilgiye işaret eder.`
      : instPct >= 20
      ? `Kurumsal sahiplik %${instPct.toFixed(1)} düzeyinde — orta seviyede kurumsal ilgi mevcut.`
      : `Kurumsal sahiplik oranı %${instPct.toFixed(1)} ile düşük. Kurumsal yatırımcı ilgisi sınırlı görünüyor.`;

  return (
    <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
      {/* Başlık */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className="text-sm">{cfg.icon}</span>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Sahiplik Yapısı
          </p>
          <span className="text-[9px] text-text-muted bg-surface border border-border/50 rounded px-1.5 py-0.5">
            Yahoo Finance
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}
        >
          {cfg.label}
        </span>
      </div>

      <div className="p-4 space-y-4">

        {/* Gauge çubukları */}
        <div className="space-y-3">
          {instPct !== null && (
            <Gauge
              value={instPct}
              label="Kurumsal Sahiplik"
              color={
                instPct >= 40 ? 'text-emerald-400' :
                instPct >= 20 ? 'text-amber-400'   :
                'text-red-400'
              }
            />
          )}
          {insiderPct !== null && (
            <Gauge
              value={insiderPct}
              label="İçeriden Sahiplik (Yönetim)"
              color={
                insiderPct >= 10 ? 'text-emerald-400' :
                insiderPct >= 3  ? 'text-text-primary' :
                'text-text-muted'
              }
            />
          )}
          {/* Geriye kalan halka açık float */}
          {instPct !== null && insiderPct !== null && (() => {
            const floatPct = Math.max(0, 100 - instPct - insiderPct);
            return (
              <Gauge
                value={floatPct}
                label="Halka Açık Float"
                color="text-blue-400"
              />
            );
          })()}
        </div>

        {/* Metrik kartlar */}
        <div className={`grid gap-3 ${shortRatio !== null ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {instPct !== null && (
            <div className="rounded-lg border border-border/40 bg-surface/30 p-3 text-center">
              <p className={`text-xl font-bold font-mono ${cfg.color}`}>
                %{instPct.toFixed(1)}
              </p>
              <p className="text-[10px] text-text-muted mt-1">Kurumsal</p>
            </div>
          )}
          {insiderPct !== null && (
            <div className="rounded-lg border border-border/40 bg-surface/30 p-3 text-center">
              <p className={`text-xl font-bold font-mono ${
                insiderPct >= 10 ? 'text-emerald-400' :
                insiderPct >= 3  ? 'text-text-primary' :
                'text-text-muted'
              }`}>
                %{insiderPct.toFixed(1)}
              </p>
              <p className="text-[10px] text-text-muted mt-1">İçeriden</p>
            </div>
          )}
          {shortRatio !== null && (
            <div className={`rounded-lg border p-3 text-center ${
              shortWarning
                ? 'border-orange-500/30 bg-orange-500/5'
                : 'border-border/40 bg-surface/30'
            }`}>
              <p className={`text-xl font-bold font-mono ${
                shortWarning ? 'text-orange-400' : 'text-text-primary'
              }`}>
                {shortRatio.toFixed(1)}
              </p>
              <p className="text-[10px] text-text-muted mt-1">Short Ratio</p>
            </div>
          )}
        </div>

        {/* Short uyarısı */}
        {shortWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
            <span className="text-orange-400 text-xs mt-0.5">⚠</span>
            <p className="text-[11px] text-orange-300/80 leading-relaxed">
              Short Ratio {shortRatio!.toFixed(1)} — açığa satış baskısı ortalamanın üzerinde.
              Fiyat düşüşlerinde kısa vadeli volatilite görülebilir.
            </p>
          </div>
        )}

        {/* Yorum */}
        <p className="text-[11px] text-text-muted leading-relaxed">{aciklama}</p>

        {/* Referans */}
        <div className="rounded-lg bg-surface/30 border border-border/20 px-3 py-2">
          <p className="text-[10px] text-text-muted/60 leading-relaxed">
            <strong className="text-text-muted">Yorum kılavuzu:</strong>{' '}
            Kurumsal sahiplik {'>'}%40 → güçlü ilgi · %20–40 → orta · {'<'}%20 → düşük.
            Short Ratio {'>'} 5 → açığa satış baskısı var. İçeriden {'>'} %10 → yönetim inancı güçlü.
          </p>
        </div>
      </div>
    </div>
  );
}

function TakasSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-surface" />
        <div className="h-5 w-36 rounded-full bg-surface" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-24 rounded bg-surface" />
              <div className="h-3 w-10 rounded bg-surface" />
            </div>
            <div className="h-2 w-full rounded-full bg-surface" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-surface" />)}
      </div>
    </div>
  );
}
