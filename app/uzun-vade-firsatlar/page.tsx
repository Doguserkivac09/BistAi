'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Diamond, Star, Zap, BarChart2, Filter, TrendingUp, TrendingDown, Shield, Target, AlertTriangle } from 'lucide-react';
import type { LongTermResult, ValuationResult } from '@/app/api/uzun-vade-firsatlar/route';
import type { HaftaninSecimiData } from '@/app/api/haftanin-secimi/route';
import { MiniChart } from '@/components/MiniChart';
import { SecimiKart } from '@/components/SecimiKart';

type Category = 'tumu' | 'cift_onay' | 'deger_firsati' | 'guclu_temel';

interface ApiResponse {
  ok: boolean;
  results: LongTermResult[];
  cached: boolean;
}

function fmtB(v: number | null): string {
  if (!v) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B₺';
  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M₺';
  return (v / 1e3).toFixed(0) + 'K₺';
}

function fmtPct(v: number | null, plus = true): string {
  if (v === null || v === undefined) return '—';
  return `${plus && v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

// ── Değerleme Durumu Rozeti ──────────────────────────────────────────
function ValuationBadge({ val }: { val: ValuationResult | null }) {
  if (!val || val.status === 'unknown') return null;
  const cfg = {
    undervalued: { label: 'İskontolu',    cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300', icon: '🎯' },
    fair:        { label: 'Adil Değer',   cls: 'bg-sky-500/15 border-sky-500/30 text-sky-300',             icon: '⚖️' },
    overvalued:  { label: 'Primli',       cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300',       icon: '⚠️' },
  }[val.status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Risk/Ödül Badge ──────────────────────────────────────────────────
function RRBadge({ rr }: { rr: ValuationResult['riskReward'] }) {
  if (!rr) return null;
  const cfg = {
    excellent: { label: 'Mükemmel',  cls: 'text-emerald-400 font-bold' },
    good:      { label: 'İyi',       cls: 'text-sky-400' },
    fair:      { label: 'Orta',      cls: 'text-amber-400' },
    poor:      { label: 'Zayıf',     cls: 'text-red-400' },
  }[rr];
  return <span className={`text-[10px] ${cfg.cls}`}>R/Ö: {cfg.label}</span>;
}

// ── Hedef Fiyat Barı ────────────────────────────────────────────────
function TargetBar({ val, currentPrice }: { val: ValuationResult; currentPrice: number }) {
  if (!val.target || val.upside === null) return null;
  const isPos = val.upside > 0;
  return (
    <div className={`rounded-lg border px-3 py-2 ${
      isPos ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/25 bg-red-500/5'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          <Target className="h-3 w-3" />
          Kurumsal Hedef
          <span className="text-[9px] opacity-60">({val.method})</span>
        </span>
        <span className={`text-[10px] ${val.confidence === 'high' ? 'text-emerald-400' : val.confidence === 'medium' ? 'text-amber-400' : 'text-text-muted'}`}>
          {val.confidence === 'high' ? '●●●' : val.confidence === 'medium' ? '●●○' : '●○○'} Güven
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-lg font-bold tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
          {val.target.toFixed(2)}₺
        </span>
        <span className={`text-sm font-semibold tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
          ({isPos ? '+' : ''}{val.upside.toFixed(1)}%)
        </span>
        <RRBadge rr={val.riskReward} />
      </div>
      {/* Breakdown — yöntem dağılımı */}
      {val.breakdown.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {val.breakdown.map((b) => (
            <span key={b.method} className="text-[9px] text-text-muted">
              {b.method}: {b.target.toFixed(2)}₺ ({b.upside > 0 ? '+' : ''}{b.upside.toFixed(0)}%)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Yatırım Tezi ────────────────────────────────────────────────────
function ThesisCard({ thesis, status }: { thesis: string; status: ValuationResult['status'] }) {
  if (!thesis) return null;
  return (
    <div className="rounded-lg bg-surface/50 px-3 py-2 text-[11px] text-text-secondary leading-relaxed border border-border/40">
      {thesis}
    </div>
  );
}

// ── Temel Metrik Tablosu ────────────────────────────────────────────
function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-0 text-xs">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${color ?? 'text-text-primary'}`}>{value}</span>
    </div>
  );
}

// ── Sahiplik Barı ───────────────────────────────────────────────────
function OwnershipBar({ foreign, insiders }: { foreign: number | null; insiders: number | null }) {
  if (!foreign && !insiders) return null;
  const retail = Math.max(0, 100 - (foreign ?? 0) - (insiders ?? 0));
  return (
    <div>
      <p className="text-[10px] text-text-muted mb-1">Sahiplik Yapısı</p>
      <div className="h-2 w-full rounded-full overflow-hidden flex">
        {foreign !== null && <div className="h-full bg-blue-500" style={{ width: `${foreign}%` }} title={`Kurumsal: %${foreign}`} />}
        {insiders !== null && <div className="h-full bg-violet-500" style={{ width: `${insiders}%` }} title={`İçeriden: %${insiders}`} />}
        <div className="h-full bg-white/10 flex-1" title={`Perakende: %${retail.toFixed(0)}`} />
      </div>
      <div className="flex gap-3 mt-1 text-[9px]">
        {foreign !== null && <span className="text-blue-400">Kurumsal %{foreign}</span>}
        {insiders !== null && <span className="text-violet-400">İçeriden %{insiders}</span>}
      </div>
    </div>
  );
}

// ── Ana Kart ─────────────────────────────────────────────────────────
function UzunVadeKart({ r }: { r: LongTermResult }) {
  const catCfg = CATEGORY_CONFIG[r.category];
  const val = r.valuation;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
      {/* Başlık */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/hisse/${r.sembol}?tab=temel`}
              className="text-base font-bold text-text-primary hover:text-primary transition-colors">
              {r.sembol}
            </Link>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${catCfg.bg} ${catCfg.color}`}>
              {catCfg.emoji} {catCfg.label}
            </span>
            {val && <ValuationBadge val={val} />}
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">{r.sectorName}</p>
        </div>
        {/* Yatırım Skoru */}
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold tabular-nums ${
            r.investmentScore >= 75 ? 'text-emerald-400' :
            r.investmentScore >= 60 ? 'text-sky-400' :
            r.investmentScore >= 50 ? 'text-amber-400' : 'text-orange-400'
          }`}>{r.investmentScore}</div>
          <p className="text-[9px] text-text-muted">/{100} Skor</p>
          <p className={`text-[10px] font-semibold ${
            r.investmentRating.includes('İyi') ? 'text-emerald-400' : 'text-text-muted'
          }`}>{r.investmentRating}</p>
        </div>
      </div>

      {/* Teknik Skor */}
      {r.technicalScore !== null && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-text-muted shrink-0">Teknik</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className={`h-full rounded-full ${
              r.technicalScore >= 70 ? 'bg-emerald-500' :
              r.technicalScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
            }`} style={{ width: `${r.technicalScore}%` }} />
          </div>
          <span className={`font-semibold tabular-nums ${
            r.technicalScore >= 70 ? 'text-emerald-400' :
            r.technicalScore >= 50 ? 'text-amber-400' : 'text-red-400'
          }`}>{r.technicalScore}</span>
        </div>
      )}

      {/* Sparkline — son 60 günlük fiyat trendi */}
      {r.candles && r.candles.length >= 20 && (() => {
        const last  = r.candles[r.candles.length - 1]?.close;
        const prev20 = r.candles[r.candles.length - 20]?.close;
        const isPositive = last && prev20 ? last > prev20 : undefined;
        return (
          <div className="overflow-hidden rounded-lg border border-border/30">
            <MiniChart data={r.candles} height={44} positive={isPositive} />
          </div>
        );
      })()}

      {/* Kurumsal Hedef Fiyat */}
      {val && r.lastPrice && <TargetBar val={val} currentPrice={r.lastPrice} />}

      {/* Yatırım Tezi */}
      {val?.thesis && <ThesisCard thesis={val.thesis} status={val.status ?? 'unknown'} />}

      {/* Temel Metrikler */}
      <div className="rounded-lg border border-border/40 bg-surface/30 px-3 py-2">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
          Temel Analiz
        </p>
        <div className="grid grid-cols-2 gap-x-4">
          <div>
            {r.peRatio !== null && <MetricRow label="F/K" value={`${r.peRatio.toFixed(1)}x`}
              color={r.peRatio < 8 ? 'text-emerald-400' : r.peRatio < 18 ? 'text-text-primary' : 'text-amber-400'} />}
            {r.bookValue !== null && r.lastPrice && <MetricRow label="F/DD" value={`${(r.lastPrice / r.bookValue).toFixed(2)}x`} />}
            {r.returnOnEquity !== null && <MetricRow label="ROE" value={`%${r.returnOnEquity.toFixed(1)}`}
              color={r.returnOnEquity > 15 ? 'text-emerald-400' : r.returnOnEquity > 8 ? 'text-text-primary' : 'text-red-400'} />}
            {r.revenueGrowth !== null && <MetricRow label="Gelir Büy." value={fmtPct(r.revenueGrowth)}
              color={(r.revenueGrowth ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'} />}
          </div>
          <div>
            {r.dividendYield !== null && r.dividendYield > 0 && <MetricRow label="Temettü" value={fmtPct(r.dividendYield * 100, false)}
              color="text-emerald-400" />}
            {r.debtToEquity !== null && <MetricRow label="Borç/Öz." value={`${(r.debtToEquity / 100).toFixed(1)}x`}
              color={(r.debtToEquity / 100) < 1 ? 'text-emerald-400' : (r.debtToEquity / 100) < 2 ? 'text-text-primary' : 'text-red-400'} />}
            {r.earningsGrowth !== null && <MetricRow label="Kâr Büy." value={fmtPct(r.earningsGrowth)}
              color={(r.earningsGrowth ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'} />}
            {r.beta !== null && <MetricRow label="Beta" value={r.beta.toFixed(2)}
              color={r.beta < 0.8 ? 'text-emerald-400' : r.beta < 1.2 ? 'text-text-primary' : 'text-amber-400'} />}
          </div>
        </div>
        {r.marketCap !== null && (
          <div className="mt-1.5 pt-1.5 border-t border-border/30 flex items-center justify-between text-[10px]">
            <span className="text-text-muted">Piyasa Değeri</span>
            <span className="font-mono text-text-secondary">{fmtB(r.marketCap)}</span>
          </div>
        )}
      </div>

      {/* Sahiplik */}
      {(r.foreignOwnership !== null || r.insidersOwnership !== null) && (
        <OwnershipBar foreign={r.foreignOwnership} insiders={r.insidersOwnership} />
      )}

      {/* Risk göstergeleri */}
      {(r.shortRatio !== null || r.beta !== null) && (
        <div className="flex items-center gap-3 text-[10px] text-text-muted">
          {r.shortRatio !== null && r.shortRatio > 3 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Yüksek Short Ratio ({r.shortRatio.toFixed(1)})
            </span>
          )}
          {r.beta !== null && (
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Beta {r.beta.toFixed(2)} — {r.beta < 0.8 ? 'Savunmacı' : r.beta < 1.2 ? 'Piyasayla Paralel' : 'Agresif'}
            </span>
          )}
        </div>
      )}

      {/* Detay linki */}
      <Link
        href={`/hisse/${r.sembol}?tab=temel`}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
      >
        <BarChart2 className="h-3.5 w-3.5" />
        Tam Analiz & Backtest
      </Link>
    </div>
  );
}

const CATEGORY_CONFIG = {
  cift_onay: {
    label: 'Çift Onay',
    emoji: '⚡',
    color: 'text-amber-300',
    bg: 'bg-amber-500/10 border-amber-500/30',
    desc: 'Teknik ve temel güçlü — en güçlü kurulum',
  },
  deger_firsati: {
    label: 'Değer Fırsatı',
    emoji: '💎',
    color: 'text-sky-300',
    bg: 'bg-sky-500/10 border-sky-500/30',
    desc: 'Şirket sağlam, fiyat düşük — sabırlı yatırımcı için',
  },
  guclu_temel: {
    label: 'Güçlü Temel',
    emoji: '📈',
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    desc: 'Temel veriler güçlü — uzun vade yatırım',
  },
};

export default function UzunVadeFirsatlarPage() {
  const [data,     setData]     = useState<LongTermResult[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [category, setCategory] = useState<Category>('tumu');
  const [sortBy,   setSortBy]   = useState<'score' | 'upside' | 'pe' | 'divYield'>('score');
  const [haftaninSecimi, setHaftaninSecimi] = useState<HaftaninSecimiData | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/uzun-vade-firsatlar');
      const json = await res.json() as ApiResponse;
      setData(json.results ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const fetchHaftaninSecimi = async () => {
    try {
      const res  = await fetch('/api/haftanin-secimi');
      if (!res.ok) return;
      const json = await res.json() as { ok: boolean; data: HaftaninSecimiData | null };
      setHaftaninSecimi(json.data ?? null);
    } catch { /* gösterilemezse gizlenir */ }
  };

  useEffect(() => {
    void fetchData();
    void fetchHaftaninSecimi();
  }, []);

  const filtered = data
    .filter((r) => category === 'tumu' || r.category === category)
    .sort((a, b) => {
      if (sortBy === 'upside') return (b.valuation?.upside ?? -999) - (a.valuation?.upside ?? -999);
      if (sortBy === 'pe')     return (a.peRatio ?? 999) - (b.peRatio ?? 999);
      if (sortBy === 'divYield') return ((b.dividendYield ?? 0)) - ((a.dividendYield ?? 0));
      return b.investmentScore - a.investmentScore;
    });

  const counts = {
    tumu:          data.length,
    cift_onay:     data.filter((r) => r.category === 'cift_onay').length,
    deger_firsati: data.filter((r) => r.category === 'deger_firsati').length,
    guclu_temel:   data.filter((r) => r.category === 'guclu_temel').length,
  };

  // İstatistikler
  const withTarget = data.filter((r) => r.valuation?.upside !== null);
  const avgUpside  = withTarget.length > 0
    ? withTarget.reduce((s, r) => s + (r.valuation?.upside ?? 0), 0) / withTarget.length
    : null;
  const excellent  = data.filter((r) => r.valuation?.riskReward === 'excellent').length;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-7xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Diamond className="h-6 w-6 text-sky-400" />
              <h1 className="text-2xl font-bold text-text-primary">Uzun Vade Fırsatlar</h1>
            </div>
            <p className="text-sm text-text-secondary">
              5 yöntemli kurumsal değerleme modeli — Graham Sayısı · Sektör F/K · PEG · F/DD · ROE Momentumu
            </p>
          </div>
          <button onClick={() => void fetchData()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 self-start">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile (6sa cache)
          </button>
        </div>

        {/* Haftanın Seçimi — pinned kart */}
        {haftaninSecimi && <SecimiKart type="haftalik" data={haftaninSecimi} />}

        {/* İstatistik özeti */}
        {!loading && data.length > 0 && (
          <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Analiz Edilen', value: data.length, color: 'text-text-primary' },
              { label: 'Mükemmel R/Ö', value: excellent, color: 'text-emerald-400' },
              { label: 'Ort. Potansiyel', value: avgUpside !== null ? `${avgUpside > 0 ? '+' : ''}${avgUpside.toFixed(1)}%` : '—', color: (avgUpside ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Çift Onay', value: counts.cift_onay, color: 'text-amber-400' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-surface p-3 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filtreler */}
        <div className="mb-5 flex flex-wrap gap-2">
          {(Object.entries({
            tumu:          { label: 'Tümü',         emoji: '📊' },
            cift_onay:     { label: 'Çift Onay',    emoji: '⚡' },
            deger_firsati: { label: 'Değer Fırsatı', emoji: '💎' },
            guclu_temel:   { label: 'Güçlü Temel',  emoji: '📈' },
          }) as Array<[Category, { label: string; emoji: string }]>).map(([key, cfg]) => (
            <button key={key} onClick={() => setCategory(key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                category === key ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-surface text-text-secondary hover:border-primary/40'
              }`}>
              <span>{cfg.emoji}</span>
              <span>{cfg.label}</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{counts[key]}</span>
            </button>
          ))}

          <div className="ml-auto flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-text-muted" />
            {[
              { key: 'score',    label: 'Skor' },
              { key: 'upside',   label: 'Potansiyel' },
              { key: 'pe',       label: 'Ucuz F/K' },
              { key: 'divYield', label: 'Temettü' },
            ].map((opt) => (
              <button key={opt.key} onClick={() => setSortBy(opt.key as typeof sortBy)}
                className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                  sortBy === opt.key ? 'border-primary bg-primary/15 text-primary' : 'border-border text-text-muted hover:text-text-primary'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-96 rounded-xl border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/30 p-8 text-center text-text-muted">
            Bu kategoride hisse bulunamadı
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => <UzunVadeKart key={r.sembol} r={r} />)}
          </div>
        )}

        <p className="mt-8 text-center text-[10px] text-text-muted/60 italic">
          Kurumsal değerleme 5 bağımsız yöntemin ağırlıklı ortalamasıdır.
          Graham Sayısı · Sektör F/K Normalizasyonu · PEG Bazlı · F/DD (Banka/GYO) · ROE Momentumu.
          Geçmiş performans geleceği garanti etmez. Yatırım tavsiyesi değildir.
        </p>
      </main>
    </div>
  );
}
