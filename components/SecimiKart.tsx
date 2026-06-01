'use client';

import Link from 'next/link';
import { Sparkles, ChevronRight, TrendingUp, Target, Shield, Bot } from 'lucide-react';
import type { GununSecimiData } from '@/app/api/gunun-secimi/route';
import type { HaftaninSecimiData } from '@/app/api/haftanin-secimi/route';

// ── Yardımcılar ──────────────────────────────────────────────────────

function fmtTL(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M₺`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K₺`;
  return `${v.toFixed(2)}₺`;
}

function rrColor(rr: number | null): string {
  if (rr === null) return 'text-text-muted';
  if (rr >= 3)   return 'text-emerald-400 font-bold';
  if (rr >= 2)   return 'text-emerald-400';
  return 'text-yellow-400';
}

const CATEGORY_LABEL: Record<string, string> = {
  cift_onay:     '⚡ Çift Onay',
  deger_firsati: '💎 Değer Fırsatı',
  guclu_temel:   '📈 Güçlü Temel',
};

// ── Günün Seçimi Metrikleri ──────────────────────────────────────────

function GunlukMetrikler({ data }: { data: GununSecimiData }) {
  const upside = data.targetPrice && data.entryPrice
    ? ((data.targetPrice - data.entryPrice) / data.entryPrice) * 100
    : null;

  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {/* Hedef */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-2">
        <Target className="mx-auto mb-0.5 h-3 w-3 text-emerald-400" />
        <div className="text-xs font-bold text-emerald-400 tabular-nums">
          {data.targetPrice != null ? `${data.targetPrice.toFixed(2)}₺` : '—'}
        </div>
        {upside !== null && (
          <div className="text-[9px] text-emerald-400/70">+{upside.toFixed(1)}%</div>
        )}
        <div className="mt-0.5 text-[9px] text-text-muted">Hedef</div>
      </div>

      {/* Stop */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-2">
        <Shield className="mx-auto mb-0.5 h-3 w-3 text-red-400" />
        <div className="text-xs font-bold text-red-400 tabular-nums">
          {data.stopLoss != null ? `${data.stopLoss.toFixed(2)}₺` : '—'}
        </div>
        {data.stopLoss && data.entryPrice && (
          <div className="text-[9px] text-red-400/70">
            -{(((data.entryPrice - data.stopLoss) / data.entryPrice) * 100).toFixed(1)}%
          </div>
        )}
        <div className="mt-0.5 text-[9px] text-text-muted">Stop</div>
      </div>

      {/* R/R */}
      <div className="rounded-lg border border-border/50 bg-surface/50 px-2 py-2">
        <TrendingUp className="mx-auto mb-0.5 h-3 w-3 text-text-muted" />
        <div className={`text-xs tabular-nums ${rrColor(data.riskRewardRatio)}`}>
          {data.riskRewardRatio != null ? `${data.riskRewardRatio.toFixed(1)}:1` : '—'}
        </div>
        <div className="mt-0.5 text-[9px] text-text-muted">R/Ö</div>
      </div>
    </div>
  );
}

// ── Haftanın Seçimi Metrikleri ───────────────────────────────────────

function HaftalikMetrikler({ data }: { data: HaftaninSecimiData }) {
  const statusMap: Record<string, { label: string; cls: string }> = {
    undervalued: { label: 'İskontolu', cls: 'text-emerald-400' },
    fair:        { label: 'Adil Değer', cls: 'text-sky-400' },
    overvalued:  { label: 'Primli', cls: 'text-amber-400' },
  };
  const statusCfg = (data.valStatus ? statusMap[data.valStatus] : null) ?? { label: '—', cls: 'text-text-muted' };

  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {/* Potansiyel */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-2">
        <Target className="mx-auto mb-0.5 h-3 w-3 text-emerald-400" />
        <div className="text-xs font-bold text-emerald-400 tabular-nums">
          {data.valUpside != null ? `+${data.valUpside.toFixed(1)}%` : '—'}
        </div>
        <div className="text-[9px] text-emerald-400/70">
          {data.valTarget != null ? fmtTL(data.valTarget) : ''}
        </div>
        <div className="mt-0.5 text-[9px] text-text-muted">Potansiyel</div>
      </div>

      {/* Değerleme */}
      <div className="rounded-lg border border-border/50 bg-surface/50 px-2 py-2">
        <div className="mx-auto mb-0.5 h-3 w-3 text-[10px] text-center">⚖️</div>
        <div className={`text-xs font-semibold ${statusCfg.cls}`}>{statusCfg.label}</div>
        {data.peRatio != null && (
          <div className="text-[9px] text-text-muted">F/K {data.peRatio.toFixed(1)}x</div>
        )}
        <div className="mt-0.5 text-[9px] text-text-muted">Değerleme</div>
      </div>

      {/* ROE / Temettü */}
      <div className="rounded-lg border border-border/50 bg-surface/50 px-2 py-2">
        <TrendingUp className="mx-auto mb-0.5 h-3 w-3 text-text-muted" />
        <div className="text-xs font-bold text-sky-400 tabular-nums">
          {data.returnOnEquity != null ? `%${data.returnOnEquity.toFixed(0)}` : '—'}
        </div>
        {data.dividendYield != null && data.dividendYield > 0 && (
          <div className="text-[9px] text-text-muted">
            Tem. %{(data.dividendYield * 100).toFixed(1)}
          </div>
        )}
        <div className="mt-0.5 text-[9px] text-text-muted">ROE</div>
      </div>
    </div>
  );
}

// ── Ana Bileşen ───────────────────────────────────────────────────────

interface SecimiKartProps {
  type: 'gunluk' | 'haftalik';
  data: GununSecimiData | HaftaninSecimiData;
}

export function SecimiKart({ type, data }: SecimiKartProps) {
  const isGunluk    = type === 'gunluk';
  const gunlukData  = isGunluk ? (data as GununSecimiData) : null;
  const haftalikData = !isGunluk ? (data as HaftaninSecimiData) : null;

  const badgeLabel  = isGunluk ? 'GÜNÜN SEÇİMİ' : 'HAFTANIN SEÇİMİ';
  const scoreValue  = isGunluk
    ? `${gunlukData!.adjustedScore}/100`
    : `${haftalikData!.investmentScore}/100`;
  const scoreLabel  = isGunluk ? 'Teknik Skor' : 'Yatırım Skoru';
  const scoreColor  = (() => {
    const v = isGunluk ? gunlukData!.adjustedScore : haftalikData!.investmentScore;
    return v >= 75 ? 'text-emerald-400' : v >= 60 ? 'text-sky-400' : 'text-amber-400';
  })();

  const sinyallerText = gunlukData?.sinyaller.join(', ') ?? null;
  const categoryLabel = haftalikData ? CATEGORY_LABEL[haftalikData.category] : null;
  const sektorAdi     = gunlukData?.sektorAdi ?? haftalikData?.sectorName ?? '';

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/6 via-surface to-surface shadow-lg shadow-primary/5">
      {/* Üst şerit */}
      <div className="flex items-center gap-2 border-b border-primary/15 bg-primary/5 px-4 py-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
          {badgeLabel}
        </span>
        <span className="ml-auto text-[9px] text-text-muted">
          Algoritma + AI gerekçeli seçim
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {/* Sembol + skor */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl font-bold text-text-primary tracking-tight">
                {data.sembol}
              </span>
              {isGunluk && (
                <span className="flex items-center gap-0.5 rounded-full border border-green-500/30 bg-green-500/12 px-2 py-0.5 text-[10px] font-bold text-green-400">
                  <TrendingUp className="h-2.5 w-2.5" /> AL
                </span>
              )}
              {categoryLabel && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  {categoryLabel}
                </span>
              )}
              {sinyallerText && (
                <span className="rounded-full border border-violet-500/25 bg-violet-500/8 px-2 py-0.5 text-[10px] text-violet-300">
                  {sinyallerText}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-text-muted">{sektorAdi}</p>
          </div>

          {/* Skor */}
          <div className="shrink-0 text-right">
            <div className={`text-2xl font-bold tabular-nums leading-none ${scoreColor}`}>
              {isGunluk ? gunlukData!.adjustedScore : haftalikData!.investmentScore}
            </div>
            <div className="text-[9px] text-text-muted">/100</div>
            <div className="mt-0.5 text-[9px] text-text-muted">{scoreLabel}</div>
          </div>
        </div>

        {/* AI Gerekçesi */}
        {data.gerekce ? (
          <div className="mb-4 flex gap-2">
            <div className="mt-0.5 shrink-0">
              <Bot className="h-3.5 w-3.5 text-primary/60" />
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              {data.gerekce}
            </p>
          </div>
        ) : (
          <p className="mb-4 text-sm text-text-muted italic">
            Algoritma bu kurulumu {isGunluk ? 'bugünün' : 'haftanın'} en güçlü fırsatı olarak belirledi.
          </p>
        )}

        {/* Metrikler */}
        {isGunluk && gunlukData && <GunlukMetrikler data={gunlukData} />}
        {!isGunluk && haftalikData && <HaftalikMetrikler data={haftalikData} />}

        {/* CTA */}
        <Link
          href={`/hisse/${data.sembol}${!isGunluk ? '?tab=temel' : ''}`}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          Tam Analizi Gör
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
