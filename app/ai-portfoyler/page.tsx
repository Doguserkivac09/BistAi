'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Trophy, Brain, Flame, TrendingUp, TrendingDown,
  ChevronRight, Activity, Target, Zap, Shield, Lock,
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

function fmtUSD(v: number): string {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  flag?:       string;      // '🇹🇷' veya '🇺🇸'
  tagline:     string;
  whoFor:      string;
  riskLabel:   string;
  riskCls:     string;
  borderCls:   string;
  headerCls:   string;
  href:        string;
  disabled?:   boolean;     // Yakında
  comingSoon?: string;
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
    <div className={`relative flex flex-col rounded-2xl border ${cfg.borderCls} bg-surface/50 overflow-hidden transition-shadow ${cfg.disabled ? 'opacity-60' : 'hover:shadow-lg'}`}>

      {/* Disabled overlay */}
      {cfg.disabled && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface/70 backdrop-blur-[2px] rounded-2xl">
          <Lock className="h-6 w-6 text-text-muted mb-2" />
          <p className="text-sm font-semibold text-text-muted">{cfg.comingSoon ?? 'Yakında'}</p>
          <p className="text-xs text-text-muted/60 mt-0.5">Faz 3</p>
        </div>
      )}

      {/* Başlık alanı */}
      <div className={`px-5 pt-5 pb-4 ${cfg.headerCls}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <Icon className="h-5 w-5 text-text-primary" />
            </div>
            {cfg.flag && <span className="text-xl">{cfg.flag}</span>}
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
  { label: 'Piyasa',           apexBIST: '🇹🇷 BIST',        apexUS: '🇺🇸 ABD',          aegis: '🇹🇷 BIST'        },
  { label: 'Karar sıklığı',   apexBIST: 'Günlük',          apexUS: 'Günlük',          aegis: 'Haftalık'        },
  { label: 'Kararı veren',    apexBIST: 'Algoritma',       apexUS: 'Algoritma',       aegis: 'Claude AI'       },
  { label: 'Stop-loss',       apexBIST: 'ATR + trailing',  apexUS: 'ATR + trailing',  aegis: '-%8 sabit'       },
  { label: 'Pozisyon boyutu', apexBIST: 'Kelly (agresif)', apexUS: 'Kelly · maks %50',aegis: 'Kelly · maks %25'},
  { label: 'Sermaye',         apexBIST: '100.000₺',        apexUS: '$2.000',          aegis: '100.000₺'        },
  { label: 'Kesirli pay',     apexBIST: 'Hayır',           apexUS: 'Evet (0.0001x)',  aegis: 'Hayır'           },
  { label: 'Haber analizi',   apexBIST: 'Hayır',           apexUS: '4-faktör matris', aegis: 'Hayır'           },
  { label: 'Risk seviyesi',   apexBIST: '🔴 Yüksek',       apexUS: '🔴 Yüksek',       aegis: '🟢 Düşük–Orta'  },
];

function ComparisonTable() {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">Strateji Karşılaştırması</h2>
        <p className="text-xs text-text-muted mt-0.5">APEX (kısa vade) vs Aegis (orta vade) — BIST ve ABD</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/30">
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider w-36">Özellik</th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold text-orange-400 uppercase tracking-wider">
                <Flame className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />🇹🇷 APEX BIST
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
                <Flame className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />🇺🇸 APEX US
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                <Shield className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />🇹🇷 Aegis
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {TABLE_ROWS.map((row) => (
              <tr key={row.label} className="hover:bg-surface/50 transition-colors">
                <td className="px-6 py-2.5 font-medium text-text-secondary text-xs">{row.label}</td>
                <td className="px-4 py-2.5 text-center text-text-muted text-xs">{row.apexBIST}</td>
                <td className="px-4 py-2.5 text-center text-text-muted text-xs">{row.apexUS}</td>
                <td className="px-4 py-2.5 text-center text-text-muted text-xs">{row.aegis}</td>
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
  const [weeklyData,  setWeeklyData]  = useState<WeeklyData | null>(null);
  const [aiData,      setAiData]      = useState<PortfolioData | null>(null);
  const [apexData,    setApexData]    = useState<PortfolioData | null>(null);
  const [apexUSData,  setApexUSData]  = useState<PortfolioData | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();

    Promise.allSettled([
      fetch('/api/weekly-picks',       { signal: ctrl.signal }).then((r) => r.json()),
      fetch('/api/ai-portfolio',       { signal: ctrl.signal }).then((r) => r.json()),
      fetch('/api/apex-portfolio',     { signal: ctrl.signal }).then((r) => r.json()),
      fetch('/api/apex-us-portfolio',  { signal: ctrl.signal }).then((r) => r.json()),
    ]).then(([weekly, ai, apex, apexUS]) => {
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
      if (apexUS.status === 'fulfilled') {
        const s = (apexUS.value as { summary?: PortfolioData & { dailyReturn?: number; winRate?: number } }).summary;
        if (s) setApexUSData({ totalValue: s.totalValue, totalReturn: s.totalReturn, positionCount: s.positionCount, dailyReturn: s.dailyReturn, winRate: s.winRate, initialCapital: s.initialCapital, maxDrawdown: s.maxDrawdown });
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
        flag:      '🇹🇷',
        name:      'APEX BIST',
        tagline:   'Agresif momentum. BIST\'te confluence ≥75 + RelVol ≥3, günlük kararlar, sinyal bazlı kısmi kâr + ATR trailing.',
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
    {
      cfg: {
        icon:      Flame,
        flag:      '🇺🇸',
        name:      'APEX US',
        tagline:   'ABD hisse piyasası agresif momentum. $2.000 başlangıç, kesirli pay, haber fiyatlandırma analizi. 23:45 TRT kapanış sonrası karar.',
        whoFor:    'ABD borsasını takip eden, kısa vadeli ve yüksek volatilite toleranslı yatırımcılar için.',
        riskLabel: 'Günlük · Yüksek Risk · USD',
        riskCls:   'border-blue-500/30 bg-blue-500/10 text-blue-400',
        borderCls: 'border-blue-500/15 hover:border-blue-500/30',
        headerCls: '',
        href:      '/apex-us-portfoyu',
      },
      mainNode: apexUSData
        ? <ReturnPill value={apexUSData.totalReturn} size="xl" />
        : <span className="text-lg text-text-muted">Portföy başlatılmadı</span>,
      rows: [
        { label: 'Toplam değer',   value: apexUSData ? fmtUSD(apexUSData.totalValue) : '—' },
        { label: 'Açık pozisyon',  value: apexUSData != null ? `${apexUSData.positionCount} hisse` : '—' },
        { label: 'Win rate',       value: apexUSData?.winRate != null ? `%${apexUSData.winRate.toFixed(0)}` : '—' },
        { label: 'Maks. drawdown', value: apexUSData?.maxDrawdown != null ? `${apexUSData.maxDrawdown.toFixed(1)}%` : '—' },
      ],
    },
    {
      cfg: {
        icon:      Shield,
        flag:      '🇺🇸',
        name:      'Aegis US',
        tagline:   'ABD borsasında haftalık Claude kararları, Kelly Criterion, -%8 stop-loss. Orta vadeli, disiplinli.',
        whoFor:    'ABD borsasını sistematik ve orta vadeli izlemek isteyen dengeli yatırımcılar için.',
        riskLabel: 'Haftalık · Orta Risk · USD',
        riskCls:   'border-slate-500/30 bg-slate-500/10 text-slate-400',
        borderCls: 'border-slate-500/15',
        headerCls: '',
        href:      '/yapay-zeka-portfoyu',
        disabled:  true,
        comingSoon: 'Aegis US — Yakında',
      },
      mainNode: <span className="text-lg text-text-muted">Faz 3</span>,
      rows: [
        { label: 'Toplam değer',   value: '—' },
        { label: 'Açık pozisyon',  value: '—' },
        { label: 'Win rate',       value: '—' },
        { label: 'Maks. drawdown', value: '—' },
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
          <p className="text-text-muted max-w-xl mx-auto text-sm leading-relaxed">
            BIST ve ABD borsasında dört algoritmik strateji — muhafazakârdan agresife,
            Türkiye'den Amerika'ya. Hangisi sizi temsil ediyor?
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

        {/* ── 4 Portföy Kartı — 2×2 grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
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
            { href: '/apex-portfoyu',       label: '🇹🇷 APEX BIST',       cls: 'text-orange-400 hover:text-orange-300' },
            { href: '/apex-us-portfoyu',    label: '🇺🇸 APEX US',          cls: 'text-blue-400 hover:text-blue-300' },
            { href: '/yapay-zeka-portfoyu', label: '🇹🇷 Aegis BIST',       cls: 'text-emerald-400 hover:text-emerald-300' },
            { href: '/haftalik-secimler',   label: '→ Haftanın Seçimleri', cls: 'text-sky-400 hover:text-sky-300' },
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
