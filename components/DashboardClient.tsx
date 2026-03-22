'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Star, BookMarked, Clock, Search, BarChart2, TrendingUp, Users,
  Briefcase, Newspaper, PieChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BeamsBackground } from '@/components/ui/beams-background';
import { DashboardWatchlist } from '@/components/DashboardWatchlist';
import { DashboardSignals } from '@/components/DashboardSignals';
import type { WatchlistItem, SavedSignal } from '@/types';

// Sabit meteor verileri — Math.random() yok (hydration güvenli)
const METEORS = [
  { top: '8%',  left: '5%',  delay: 0,   duration: 2.2, width: 70 },
  { top: '18%', left: '20%', delay: 1.1, duration: 1.9, width: 50 },
  { top: '35%', left: '3%',  delay: 2.4, duration: 2.6, width: 90 },
  { top: '50%', left: '15%', delay: 0.6, duration: 2.0, width: 60 },
  { top: '65%', left: '8%',  delay: 1.8, duration: 2.3, width: 80 },
  { top: '12%', left: '40%', delay: 3.0, duration: 1.7, width: 55 },
  { top: '28%', left: '55%', delay: 0.3, duration: 2.8, width: 65 },
  { top: '45%', left: '35%', delay: 2.0, duration: 2.1, width: 45 },
  { top: '75%', left: '25%', delay: 1.4, duration: 2.4, width: 75 },
  { top: '20%', left: '70%', delay: 3.5, duration: 1.8, width: 50 },
  { top: '55%', left: '60%', delay: 0.9, duration: 2.5, width: 85 },
  { top: '82%', left: '50%', delay: 2.7, duration: 2.0, width: 60 },
];

function Meteors() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[1]">
      {METEORS.map((m, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            top: m.top,
            left: m.left,
            width: `${m.width}px`,
            height: '1.5px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)',
            rotate: '30deg',
            transformOrigin: 'left center',
          }}
          animate={{ x: [0, 380], y: [0, 220], opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, repeatDelay: 4, ease: 'easeIn' }}
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
    href: '/topluluk',
    icon: Users,
    label: 'Topluluk',
    desc: 'Analist görüşleri',
    color: 'from-pink-500/20 to-rose-500/20 border-pink-500/30 hover:border-pink-400/50 hover:from-pink-500/30 hover:to-rose-500/30',
  },
  {
    href: '/haberler',
    icon: Newspaper,
    label: 'Haberler',
    desc: 'Son gelişmeler',
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
              <motion.div
                className="h-full rounded-full bg-primary/60"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  email: string;
  watchlist: WatchlistItem[];
  savedSignals: SavedSignal[];
  savedSignalsCount: number;
  lastSignalAt: string;
  portfolyoCount: number;
}

export function DashboardClient({
  email,
  watchlist,
  savedSignals,
  savedSignalsCount,
  lastSignalAt,
  portfolyoCount,
}: Props) {
  const displayName = email.split('@')[0] ?? 'U';

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
    <div className="min-h-screen bg-[#050510]">
      <BeamsBackground fixed intensity="medium" />
      <Meteors />

      <div className="relative z-10 min-h-screen">
        <div className="container mx-auto max-w-5xl px-4">

          {/* ── Hero ── */}
          <div className="pt-10 pb-10 text-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              {/* Avatar */}
              <div
                className={cn(
                  'mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-black text-white shadow-lg ring-4 ring-white/10',
                  avatarGradient(displayName)
                )}
              >
                {displayName[0]?.toUpperCase() ?? 'U'}
              </div>

              <p className="text-xs font-mono text-white/35 tracking-widest uppercase mb-2">
                {getGreeting()}
              </p>
              <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-2">
                {displayName}
              </h1>
              <p className="text-white/35 text-sm">{email}</p>
            </motion.div>

            {/* Stat Kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10 mb-8">
              {STAT_CARDS.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.08, duration: 0.5 }}
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
                  </motion.div>
                );
              })}
            </div>

            {/* Hızlı Eylemler */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="grid grid-cols-3 sm:grid-cols-6 gap-3"
            >
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
            </motion.div>
          </div>

          {/* ── İçerik Bölümleri ── */}
          <div className="pb-16 space-y-5">

            {/* Sinyal Dağılımı */}
            {savedSignals.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="rounded-2xl border border-white/8 bg-black/35 backdrop-blur-md p-5"
              >
                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
                  Sinyal Dağılımı
                </h2>
                <SignalDistribution signals={savedSignals} />
              </motion.div>
            )}

            {/* İzleme Listesi */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.5 }}
              className="rounded-2xl border border-white/8 bg-black/35 backdrop-blur-md overflow-hidden"
            >
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
            </motion.div>

            {/* Kayıtlı Sinyaller */}
            <motion.div
              id="sinyaller"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.95, duration: 0.5 }}
              className="rounded-2xl border border-white/8 bg-black/35 backdrop-blur-md overflow-hidden"
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
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
}
