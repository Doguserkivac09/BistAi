'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Trophy, Brain, Flame, TrendingUp, TrendingDown,
  ChevronRight, Activity, Target, Zap, Shield,
} from 'lucide-react';

// ── Tipler ───────────────────────────────────────────────────────────

interface WeeklyData {
  avgReturn:          number | null;
  outperformedRate:   number | null; // 0-100 (%)
  totalWeeks:         number;
  thisWeekCount:      number;
}

interface PortfolioData {
  totalValue:     number;
  totalReturn:    number;
  positionCount:  number;
  weeklyReturn?:  number;
  dailyReturn?:   number;
  winRate?:       number | null;
  initialCapital: number;
  maxDrawdown?:   number;
}

// ── Yardımcılar ──────────────────────────────────────────────────────

function fmtTL(v: number): string {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '₺';
}

function ReturnPill({
  value,
  size = 'base',
}: {
  value: number | null | undefined;
  size?: 'sm' | 'base' | 'xl';
}) {
  if (value == null) return <span className="text-text-muted">—</span>;
  const isPos = value >= 0;
  const Icon  = isPos ? TrendingUp : TrendingDown;
  const sizeClasses = {
    sm:   'text-sm font-semibold',
    base: 'text-base font-bold',
    xl:   'text-3xl font-black tabular-nums',
  }[size];
  return (
    <span className={`inline-flex items-center gap-1 ${isPos ? 'text-emerald-400' : 'text-red-400'} ${sizeClasses}`}>
      <Icon className={size === 'xl' ? 'h-6 w-6' : 'h-3.5 w-3.5'} />
      {isPos ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

// ── Skeleton yükleyici ───────────────────────────────────────────────

function SkeletonLine({ className }: { className?: string }) {
  return <div className={`rounded-md bg-border/30 animate-pulse ${className ?? 'h-4 w-full'}`} />;
}

// ── Tek portföy kartı ────────────────────────────────────────────────

interface CardConfig {
  icon:        React.ElementType;
  name:        string;
  tagline:     string;
  whoFor:      string;
  riskLabel:   string;
  riskCls:     string;
  borderCls:   string;
  headerCls:   string;
  href:        string;
}

function PortfolioCard({
  cfg,
  loading,
  mainNode,
  rows,
}: {
  cfg:      CardConfig;
  loading:  boolean;
  mainNode: React.ReactNode;
  rows:     Array<{ label: string; value: React.ReactNode }>;
}) {
  const Icon = cfg.icon;

  return (
    <div className={`flex flex-col rounded-2xl border ${cfg.borderCls} bg-surface/50 overflow-hidden transition-shadow hover:shadow-lg`}>

      {/* Başlık alanı */}
      <div className={`px-5 pt-5 pb-4 ${cfg.headerCls}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <Icon className="h-5 w-5 text-text-primary" />
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${cfg.riskCls}`}>
            {cfg.riskLabel}
          </span>
        </div>
        <h2 className="text-base font-bold text-text-primary leading-snug">{cfg.name}</h2>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">{cfg.tagline}</p>
      </div>

      {/* Ana metrik */}
      <div className="flex items-center justify-center border-y border-border/50 py-6 px-5">
        {loading ? (
          <SkeletonLine className="h-9 w-28 rounded-lg" />
        ) : (
          mainNode
        )}
      </div>

      {/* İkincil metrikler */}
      <div className="flex-1 divide-y divide-border/40">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-2.5 gap-4">
                <SkeletonLine className="h-3.5 w-28" />
                <SkeletonLine className="h-3.5 w-16" />
              </div>
            ))
          : rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-text-muted">{r.label}</span>
                <span className="font-semibold text-text-primary tabular-nums">{r.value}</span>
              </div>
            ))}
      </div>

      {/* Kime uygun */}
      <div className="px-5 py-3 bg-surface/40 border-t border-border/50">
        <p className="text-[11px] text-text-muted leading-relaxed italic">{cfg.whoFor}</p>
      </div>

      {/* CTA */}
      <div className="p-4">
        <Link
          href={cfg.href}
          className="flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/6 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/12 transition-colors"
        >
          Detaylı Görünüm <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

// ── Karşılaştırma tablosu ─────────────────────────────────────────────

const TABLE_ROWS = [
  { label: 'Karar sıklığı',    weekly: 'Haftalık',       ai: 'Haftalık',           apex: 'Günlük'         },
  { label: 'Kararı veren',     weekly: 'Algoritma',      ai: 'Claude AI',          apex: 'Algoritma'      },
  { label: 'Stop-loss',        weekly: 'Yok',            ai: '-%8 sabit',          apex: 'ATR + trailing' },
  { label: 'Pozisyon boyutu',  weekly: 'Eşit ağırlık',  ai: 'Kelly Criterion',    apex: 'Kelly (agresif)' },
  { label: 'Sermaye',          weekly: '—',              ai: '100.000₺',           apex: '100.000₺'       },
  { label: 'Maks. hisse',      weekly: '5-7',            ai: '10',                 apex: '5'              },
  { label: 'Risk seviyesi',    weekly: '🟡 Orta',        ai: '🟢 Düşük–Orta',     apex: '🔴 Yüksek'     },
];

function ComparisonTable() {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">Strateji Karşılaştırması</h2>
        <p className="text-xs text-text-muted mt-0.5">Hangisi size uygun?</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/30">
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider w-44">
                Özellik
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
                <Trophy className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                Haftanın Seçimleri
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                <Shield className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                Aegis Portföy
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold text-orange-400 uppercase tracking-wider">
                <Flame className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                APEX Portföy
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {TABLE_ROWS.map((row) => (
              <tr key={row.label} className="hover:bg-surface/50 transition-colors">
                <td className="px-6 py-3 font-medium text-text-secondary">{row.label}</td>
                <td className="px-4 py-3 text-center text-text-muted">{row.weekly}</td>
                <td className="px-4 py-3 text-center text-text-muted">{row.ai}</td>
                <td className="px-4 py-3 text-center text-text-muted">{row.apex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Ana sayfa ─────────────────────────────────────────────────────────

export default function AiPortfoylerPage() {
  const [weeklyData, setWeeklyData] = useState<WeeklyData | null>(null);
  const [aiData,     setAiData]     = useState<PortfolioData | null>(null);
  const [apexData,   setApexData]   = useState<PortfolioData | null>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();

    Promise.allSettled([
      fetch('/api/weekly-picks', { signal: ctrl.signal }).then((r) => r.json()),
      fetch('/api/ai-portfolio',  { signal: ctrl.signal }).then((r) => r.json()),
      fetch('/api/apex-portfolio',{ signal: ctrl.signal }).then((r) => r.json()),
    ]).then(([weekly, ai, apex]) => {
      if (weekly.status === 'fulfilled') {
        const d = weekly.value as { stats?: { avgReturn?: number; outperformedRate?: number; totalWeeks?: number }; thisWeek?: unknown[] };
        const rate = d.stats?.outperformedRate;
        setWeeklyData({
          avgReturn:        d.stats?.avgReturn ?? null,
          outperformedRate: rate != null ? Math.round(rate * 100) : null,
          totalWeeks:       d.stats?.totalWeeks ?? 0,
          thisWeekCount:    (d.thisWeek ?? []).length,
        });
      }
      if (ai.status === 'fulfilled') {
        const s = (ai.value as { summary?: PortfolioData & { weeklyReturn?: number } }).summary;
        if (s) setAiData({ totalValue: s.totalValue, totalReturn: s.totalReturn, positionCount: s.positionCount, weeklyReturn: s.weeklyReturn, initialCapital: s.initialCapital, maxDrawdown: s.maxDrawdown });
      }
      if (apex.status === 'fulfilled') {
        const s = (apex.value as { summary?: PortfolioData & { dailyReturn?: number; winRate?: number } }).summary;
        if (s) setApexData({ totalValue: s.totalValue, totalReturn: s.totalReturn, positionCount: s.positionCount, dailyReturn: s.dailyReturn, winRate: s.winRate, initialCapital: s.initialCapital, maxDrawdown: s.maxDrawdown });
      }
      setLoading(false);
    });

    return () => ctrl.abort();
  }, []);

  const cards: Array<{
    cfg: CardConfig;
    mainNode: React.ReactNode;
    rows: Array<{ label: string; value: React.ReactNode }>;
  }> = [
    {
      cfg: {
        icon:      Trophy,
        name:      'Haftanın Seçimleri',
        tagline:   'Her Pazartesi algoritma, confluence + ADV + piyasa aşamasına göre en güçlü 5-7 hisseyi seçer. Cuma kapanışında BIST\'e karşı başarısı ölçülür.',
        whoFor:    'Haftalık zaman dilimiyle çalışan, aktif portföy yönetmek istemeyen yatırımcılar için.',
        riskLabel: 'Haftalık · Düşük Bakım',
        riskCls:   'border-sky-500/30 bg-sky-500/10 text-sky-400',
        borderCls: 'border-sky-500/15 hover:border-sky-500/30',
        headerCls: '',
        href:      '/haftalik-secimler',
      },
      mainNode: weeklyData?.avgReturn != null
        ? <ReturnPill value={weeklyData.avgReturn} size="xl" />
        : <span className="text-lg text-text-muted">Veri bekleniyor</span>,
      rows: [
        { label: 'Ort. haftalık getiri',  value: <ReturnPill value={weeklyData?.avgReturn} /> },
        { label: 'BIST\'i geçme oranı',   value: weeklyData?.outperformedRate != null ? `%${weeklyData.outperformedRate}` : '—' },
        { label: 'Takip edilen hafta',    value: weeklyData?.totalWeeks ?? '—' },
        { label: 'Bu hafta seçim',        value: weeklyData?.thisWeekCount != null ? `${weeklyData.thisWeekCount} hisse` : '—' },
      ],
    },
    {
      cfg: {
        icon:      Shield,
        name:      'Aegis Portföy',
        tagline:   'Sermayeyi koruyarak büyüt. 100.000₺ sanal sermaye, Kelly Criterion, -%8 stop-loss, Claude haftalık kararları. Disiplinli, orta vadeli.',
        whoFor:    'Sistematik, orta vadeli strateji izlemek isteyen dengeli yatırımcılar için.',
        riskLabel: 'Haftalık · Orta Risk',
        riskCls:   'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        borderCls: 'border-emerald-500/15 hover:border-emerald-500/30',
        headerCls: '',
        href:      '/yapay-zeka-portfoyu',
      },
      mainNode: aiData
        ? <ReturnPill value={aiData.totalReturn} size="xl" />
        : <span className="text-lg text-text-muted">Portföy başlatılmadı</span>,
      rows: [
        { label: 'Toplam değer',     value: aiData ? fmtTL(aiData.totalValue) : '—' },
        { label: 'Açık pozisyon',    value: aiData != null ? `${aiData.positionCount} hisse` : '—' },
        { label: 'Haftalık getiri',  value: <ReturnPill value={aiData?.weeklyReturn} /> },
        { label: 'Maks. drawdown',   value: aiData?.maxDrawdown != null ? `${aiData.maxDrawdown.toFixed(1)}%` : '—' },
      ],
    },
    {
      cfg: {
        icon:      Flame,
        name:      'APEX Portföy',
        tagline:   'Agresif momentum stratejisi. Confluence ≥75 + RelVol ≥3 filtresi, günlük kararlar, ATR bazlı stop + trailing. Kapanışa 15dk kala hareket eder.',
        whoFor:    'Aktif, kısa vadeli, yüksek volatilite toleransı olan deneyimli yatırımcılar için.',
        riskLabel: 'Günlük · Yüksek Risk',
        riskCls:   'border-orange-500/30 bg-orange-500/10 text-orange-400',
        borderCls: 'border-orange-500/15 hover:border-orange-500/30',
        headerCls: '',
        href:      '/apex-portfoyu',
      },
      mainNode: apexData
        ? <ReturnPill value={apexData.totalReturn} size="xl" />
        : <span className="text-lg text-text-muted">Portföy başlatılmadı</span>,
      rows: [
        { label: 'Toplam değer',   value: apexData ? fmtTL(apexData.totalValue) : '—' },
        { label: 'Açık pozisyon',  value: apexData != null ? `${apexData.positionCount} hisse` : '—' },
        { label: 'Win rate',       value: apexData?.winRate != null ? `%${apexData.winRate.toFixed(0)}` : '—' },
        { label: 'Maks. drawdown', value: apexData?.maxDrawdown != null ? `${apexData.maxDrawdown.toFixed(1)}%` : '—' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-10">

        {/* ── Başlık ── */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/6 px-4 py-1.5 text-xs font-semibold text-primary mb-4">
            <Activity className="h-3.5 w-3.5" />
            Algoritmik Portföyler
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight mb-3">
            AI Portföyler
          </h1>
          <p className="text-text-muted max-w-lg mx-auto text-sm leading-relaxed">
            Üç farklı strateji, tek platformda. Muhafazakârdan agresife — hangisinin
            yaklaşımı size uygun?
          </p>
        </div>

        {/* ── Strateji spektrum çizgisi ── */}
        <div className="mb-8 flex items-center justify-center gap-2 text-xs text-text-muted">
          <Shield className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-sky-400 font-medium">Muhafazakâr</span>
          <div className="flex-1 max-w-[200px] h-px bg-gradient-to-r from-sky-400/40 via-emerald-400/40 to-orange-400/40" />
          <span className="text-orange-400 font-medium">Agresif</span>
          <Zap className="h-3.5 w-3.5 text-orange-400" />
        </div>

        {/* ── 3 Portföy Kartı ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {cards.map((card) => (
            <PortfolioCard
              key={card.cfg.name}
              cfg={card.cfg}
              loading={loading}
              mainNode={card.mainNode}
              rows={card.rows}
            />
          ))}
        </div>

        {/* ── Karşılaştırma tablosu ── */}
        <ComparisonTable />

        {/* ── Hızlı bağlantılar ── */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs">
          {[
            { href: '/haftalik-secimler',   label: '→ Haftanın Seçimleri',  cls: 'text-sky-400 hover:text-sky-300' },
            { href: '/yapay-zeka-portfoyu', label: '→ AI Portföy Detayı',   cls: 'text-emerald-400 hover:text-emerald-300' },
            { href: '/apex-portfoyu',       label: '→ APEX Portföy Detayı', cls: 'text-orange-400 hover:text-orange-300' },
          ].map((l) => (
            <Link key={l.href} href={l.href} className={`transition-colors ${l.cls}`}>
              {l.label}
            </Link>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] text-text-muted/60 italic">
          Tüm portföyler sanal sermaye üzerinde çalışır.
          Geçmiş performans gelecekteki sonuçları garanti etmez. Yatırım tavsiyesi değildir.
        </p>
      </div>
    </div>
  );
}
