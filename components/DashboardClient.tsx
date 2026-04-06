'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Star, BookMarked, Clock, Search, BarChart2, TrendingUp, Users,
  Briefcase, Newspaper, PieChart, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BeamsBackground } from '@/components/ui/beams-background';
import { DashboardWatchlist } from '@/components/DashboardWatchlist';
import { DashboardSignals } from '@/components/DashboardSignals';
import { MacroWindGauge } from '@/components/MacroWindGauge';
import type { WatchlistItem, SavedSignal } from '@/types';
import type { MacroScoreResult } from '@/lib/macro-score';

// 6 meteor yeterli (12'den düşürüldü — jank azaltma)
const METEORS = [
  { top: '8%',  left: '5%',  delay: 0,   duration: 2.2, width: 70 },
  { top: '35%', left: '3%',  delay: 2.4, duration: 2.6, width: 90 },
  { top: '65%', left: '8%',  delay: 1.8, duration: 2.3, width: 80 },
  { top: '12%', left: '40%', delay: 3.0, duration: 1.7, width: 55 },
  { top: '45%', left: '35%', delay: 2.0, duration: 2.1, width: 45 },
  { top: '20%', left: '70%', delay: 3.5, duration: 1.8, width: 50 },
];

function Meteors() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {METEORS.map((m, i) => (
        <div
          key={i}
          className="absolute rounded-full meteor-line"
          style={{
            top: m.top,
            left: m.left,
            width: `${m.width}px`,
            height: '1.5px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)',
            animationDuration: `${m.duration + 4}s`,
            animationDelay: `${m.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// Saate göre selamlama
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6)  return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

// Avatar rengi
const AVATAR_COLORS = [
  'from-violet-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
];

function avatarGradient(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

const QUICK_ACTIONS = [
  {
    href: '/tarama',
    icon: Search,
    label: 'Tarama Yap',
    desc: 'AI sinyal tara',
    color: 'from-indigo-500/20 to-violet-500/20 border-indigo-500/30 hover:border-indigo-400/50 hover:from-indigo-500/30 hover:to-violet-500/30',
  },
  {
    href: '/makro',
    icon: BarChart2,
    label: 'Makro Radar',
    desc: 'Piyasa geneli',
    color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30 hover:border-blue-400/50 hover:from-blue-500/30 hover:to-cyan-500/30',
  },
  {
    href: '/backtesting',
    icon: TrendingUp,
    label: 'Backtest',
    desc: 'Geçmiş performans',
    color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 hover:border-emerald-400/50 hover:from-emerald-500/30 hover:to-teal-500/30',
  },
  {
    href: '/sohbet',
    icon: MessageSquare,
    label: 'AI Sohbet',
    desc: 'Asistanla konuş',
    color: 'from-violet-500/20 to-purple-500/20 border-violet-500/30 hover:border-violet-400/50 hover:from-violet-500/30 hover:to-purple-500/30',
  },
  {
    href: '/topluluk',
    icon: Users,
    label: 'Topluluk',
    desc: 'Analist görüşleri',
    color: 'from-pink-500/20 to-rose-500/20 border-pink-500/30 hover:border-pink-400/50 hover:from-pink-500/30 hover:to-rose-500/30',
  },
  {
    href: '/haberler',
    icon: Newspaper,
    label: 'Gündem',
    desc: 'Haber & takvim',
    color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 hover:border-amber-400/50 hover:from-amber-500/30 hover:to-orange-500/30',
  },
  {
    href: '/sektorler',
    icon: PieChart,
    label: 'Sektörler',
    desc: 'Sektör momentumu',
    color: 'from-teal-500/20 to-cyan-500/20 border-teal-500/30 hover:border-teal-400/50 hover:from-teal-500/30 hover:to-cyan-500/30',
  },
];

function SignalDistribution({ signals }: { signals: SavedSignal[] }) {
  const counts = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.signal_type] = (acc[s.signal_type] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = signals.length;

  return (
    <div className="space-y-2.5">
      {sorted.map(([type, count]) => {
        const pct = Math.round((count / total) * 100);
        return (
          <div key={type}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-white/50">{type}</span>
              <span className="text-xs font-semibold text-white/70 tabular-nums">
                {count} ({pct}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60 progress-bar"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TIER_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  free:    { label: 'Ücretsiz', color: 'text-white/40',   border: 'border-white/15 bg-white/5'      },
  pro:     { label: 'Pro',      color: 'text-blue-400',   border: 'border-blue-500/30 bg-blue-500/10' },
  premium: { label: 'Premium',  color: 'text-yellow-400', border: 'border-yellow-500/30 bg-yellow-500/10' },
};

const DAILY_LIMITS: Record<string, number> = { free: 7, pro: 20, premium: 50 };

interface Props {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  dailyAiCount: number;
  watchlist: WatchlistItem[];
  savedSignals: SavedSignal[];
  savedSignalsCount: number;
  lastSignalAt: string;
  portfolyoCount: number;
  macroScore: MacroScoreResult | null;
}

export function DashboardClient({
  email,
  displayName,
  avatarUrl: initialAvatarUrl,
  tier,
  dailyAiCount,
  watchlist,
  savedSignals,
  savedSignalsCount,
  lastSignalAt,
  portfolyoCount,
  macroScore,
}: Props) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  // Listen for avatar changes from profile page
  useEffect(() => {
    function onAvatarChange(e: Event) {
      setAvatarUrl((e as CustomEvent<string>).detail);
    }
    window.addEventListener('avatar-changed', onAvatarChange);
    return () => window.removeEventListener('avatar-changed', onAvatarChange);
  }, []);

  const STAT_CARDS = [
    {
      icon: Star,
      label: 'İzleme Listesi',
      value: watchlist.length,
      unit: 'hisse',
      href: '/watchlist',
    },
    {
      icon: BookMarked,
      label: 'Kayıtlı Sinyal',
      value: savedSignalsCount,
      unit: 'sinyal',
      href: '/dashboard#sinyaller',
    },
    {
      icon: Briefcase,
      label: 'Portföy Pozisyon',
      value: portfolyoCount,
      unit: 'pozisyon',
      href: '/portfolyo',
    },
    {
      icon: Clock,
      label: 'Son Sinyal',
      value: lastSignalAt,
      unit: '',
      href: '/dashboard#sinyaller',
    },
  ];

  return (
    <div className="relative isolate min-h-screen bg-[#050510]">
      <BeamsBackground fixed intensity="medium" />
      <Meteors />

      <div className="relative z-10 min-h-screen">
        <div className="container mx-auto max-w-5xl px-4">

          {/* ── Hero ── */}
          <div className="pt-10 pb-10 text-center">
            <div className="animate-fade-in-up">
              {/* Avatar */}
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="mx-auto mb-5 h-20 w-20 rounded-full object-cover shadow-lg ring-4 ring-white/10"
                />
              ) : (
                <div
                  className={cn(
                    'mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-black text-white shadow-lg ring-4 ring-white/10',
                    avatarGradient(displayName)
                  )}
                >
                  {displayName[0]?.toUpperCase() ?? 'U'}
                </div>
              )}

              <p className="text-xs font-mono text-white/35 tracking-widest uppercase mb-2">
                {getGreeting()}
              </p>
              <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-2">
                {displayName}
              </h1>
              <div className="flex items-center justify-center gap-2 mb-1">
                <p className="text-white/35 text-sm">{email}</p>
                {(() => {
                  const tc = TIER_CONFIG[tier] ?? TIER_CONFIG.free!;
                  return (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tc.color} ${tc.border}`}>
                      {tc.label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Stat Kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10 mb-8">
              {STAT_CARDS.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className={`animate-fade-in-up stagger-${i + 4}`}
                  >
                    <Link
                      href={stat.href}
                      className="block rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 hover:border-primary/30 hover:bg-white/8 transition-colors cursor-pointer"
                    >
                      <div className="flex justify-center mb-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 border border-primary/20">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                      <p className="text-xl font-bold text-white leading-none">{stat.value}</p>
                      <p className="text-xs text-white/40 mt-1.5">{stat.label}</p>
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* AI Kullanım Şeridi */}
            {(() => {
              const limit = DAILY_LIMITS[tier] ?? 7;
              const pct   = Math.min(100, Math.round((dailyAiCount / limit) * 100));
              const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-primary';
              return (
                <div className="animate-fade-in-up stagger-7 rounded-xl border border-white/8 bg-black/30 backdrop-blur-md px-5 py-3 flex items-center gap-4">
                  <MessageSquare className="h-4 w-4 text-white/30 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-white/45">AI Asistan — Bugün</span>
                      <span className="text-xs font-semibold text-white/60 tabular-nums">
                        {dailyAiCount} / {limit} mesaj
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {tier === 'free' && pct >= 60 && (
                    <Link
                      href="/fiyatlandirma"
                      className="shrink-0 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                    >
                      Yükselt
                    </Link>
                  )}
                </div>
              );
            })()}

            {/* Hızlı Eylemler */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 animate-fade-in-up stagger-7">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className={`group flex flex-col items-center gap-1.5 rounded-xl border bg-gradient-to-br p-4 transition-all duration-200 text-center ${action.color}`}
                  >
                    <Icon className="h-5 w-5 text-white/55 group-hover:text-white transition-colors" />
                    <span className="text-xs font-semibold text-white/65 group-hover:text-white transition-colors leading-tight">
                      {action.label}
                    </span>
                    <span className="text-[10px] text-white/30 group-hover:text-white/60 transition-colors leading-tight">
                      {action.desc}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ── İçerik Bölümleri ── */}
          <div className="pb-16 space-y-5">

            {/* Makro Rüzgar Skoru */}
            {macroScore && (
              <div className="animate-fade-in-up stagger-8">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                    Makro Rüzgar
                  </h2>
                  <Link
                    href="/makro"
                    className="text-xs text-primary/70 hover:text-primary transition-colors"
                  >
                    Detay →
                  </Link>
                </div>
                <MacroWindGauge result={macroScore} compact />
              </div>
            )}

            {/* Sinyal Dağılımı */}
            {savedSignals.length > 0 && (
              <div className="rounded-2xl border border-white/8 bg-black/35 backdrop-blur-md p-5 animate-fade-in-up stagger-8">
                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
                  Sinyal Dağılımı
                </h2>
                <SignalDistribution signals={savedSignals} />
              </div>
            )}

            {/* İzleme Listesi */}
            <div className="rounded-2xl border border-white/8 bg-black/35 backdrop-blur-md overflow-hidden animate-fade-in-up" style={{ animationDelay: '340ms' }}>
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/6">
                <Star className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-white">İzleme Listesi</h2>
                <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/40">
                  {watchlist.length} hisse
                </span>
              </div>

              {watchlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/4 mb-4">
                    <Star className="h-7 w-7 text-white/15" />
                  </div>
                  <p className="text-sm font-medium text-white/40 mb-1">İzleme listeniz boş</p>
                  <p className="text-xs text-white/25 max-w-xs">
                    Tarama veya hisse sayfalarından hisse ekleyebilirsiniz.
                  </p>
                  <Link
                    href="/tarama"
                    className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Taramaya Git
                  </Link>
                </div>
              ) : (
                <div className="p-6">
                  <DashboardWatchlist watchlist={watchlist} />
                </div>
              )}
            </div>

            {/* Kayıtlı Sinyaller */}
            <div
              id="sinyaller"
              className="rounded-2xl border border-white/8 bg-black/35 backdrop-blur-md overflow-hidden animate-fade-in-up"
              style={{ animationDelay: '380ms' }}
            >
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/6">
                <BookMarked className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-white">Kayıtlı Sinyaller</h2>
                <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/40">
                  {savedSignalsCount} sinyal
                </span>
              </div>

              {savedSignals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/4 mb-4">
                    <BookMarked className="h-7 w-7 text-white/15" />
                  </div>
                  <p className="text-sm font-medium text-white/40 mb-1">Henüz kayıtlı sinyal yok</p>
                  <p className="text-xs text-white/25 max-w-xs">
                    Tarama sonuçlarından beğendiğiniz sinyalleri kaydedebilirsiniz.
                  </p>
                  <Link
                    href="/tarama"
                    className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Sinyal Ara
                  </Link>
                </div>
              ) : (
                <div className="p-6">
                  <DashboardSignals signals={savedSignals} totalCount={savedSignalsCount} />
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
