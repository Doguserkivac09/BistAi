'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Star, BookMarked, Clock, Search, BarChart2, TrendingUp, Users } from 'lucide-react';
import { BeamsBackground } from '@/components/ui/beams-background';
import { DashboardWatchlist } from '@/components/DashboardWatchlist';
import { DashboardSignals } from '@/components/DashboardSignals';
import type { WatchlistItem, SavedSignal } from '@/types';

// Sabit meteor verileri (hydration hatası önlemek için Math.random yok)
const METEORS: { top: string; left: string; delay: number; duration: number; width: number }[] = [
  { top: '8%',  left: '5%',  delay: 0,   duration: 2.2, width: 70  },
  { top: '18%', left: '20%', delay: 1.1, duration: 1.9, width: 50  },
  { top: '35%', left: '3%',  delay: 2.4, duration: 2.6, width: 90  },
  { top: '50%', left: '15%', delay: 0.6, duration: 2.0, width: 60  },
  { top: '65%', left: '8%',  delay: 1.8, duration: 2.3, width: 80  },
  { top: '12%', left: '40%', delay: 3.0, duration: 1.7, width: 55  },
  { top: '28%', left: '55%', delay: 0.3, duration: 2.8, width: 65  },
  { top: '45%', left: '35%', delay: 2.0, duration: 2.1, width: 45  },
  { top: '75%', left: '25%', delay: 1.4, duration: 2.4, width: 75  },
  { top: '20%', left: '70%', delay: 3.5, duration: 1.8, width: 50  },
  { top: '55%', left: '60%', delay: 0.9, duration: 2.5, width: 85  },
  { top: '80%', left: '50%', delay: 2.7, duration: 2.0, width: 60  },
];

function Meteors() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {METEORS.map((m, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            top: m.top,
            left: m.left,
            width: `${m.width}px`,
            height: '1.5px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
            rotate: '30deg',
            transformOrigin: 'left center',
          }}
          animate={{
            x: [0, 380],
            y: [0, 220],
            opacity: [0, 0.9, 0.9, 0],
          }}
          transition={{
            duration: m.duration,
            delay: m.delay,
            repeat: Infinity,
            repeatDelay: 4,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  );
}

interface Props {
  email: string;
  watchlist: WatchlistItem[];
  savedSignals: SavedSignal[];
  savedSignalsCount: number;
  lastSignalAt: string;
}

const QUICK_ACTIONS = [
  { href: '/tarama', icon: Search,    label: 'Tarama Yap',     color: 'from-indigo-500/20 to-violet-500/20 border-indigo-500/30 hover:border-indigo-400/60' },
  { href: '/makro',  icon: BarChart2, label: 'Makro Radar',    color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30 hover:border-blue-400/60'         },
  { href: '/backtest', icon: TrendingUp, label: 'Backtest',    color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 hover:border-emerald-400/60' },
  { href: '/topluluk', icon: Users,   label: 'Topluluk',       color: 'from-pink-500/20 to-rose-500/20 border-pink-500/30 hover:border-pink-400/60'          },
];

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.3 + i * 0.1, duration: 0.5 } }),
};

export function DashboardClient({ email, watchlist, savedSignals, savedSignalsCount, lastSignalAt }: Props) {
  const displayName = email.split('@')[0];

  return (
    <div className="min-h-screen bg-[#050510]">
      {/* Hero Section — BeamsBackground */}
      <BeamsBackground className="min-h-[60vh]" intensity="medium">
        <Meteors />

        <div className="container mx-auto max-w-5xl px-4 pt-16 pb-20">
          {/* Greeting */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-center mb-14"
          >
            <p className="text-sm font-mono text-white/40 tracking-widest uppercase mb-3">
              Hoş geldin
            </p>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-2">
              {displayName}
            </h1>
            <p className="text-white/40 text-base">{email}</p>
          </motion.div>

          {/* Stat Cards */}
          <div className="grid grid-cols-3 gap-4 mb-12">
            {[
              { icon: Star,       label: 'İzleme Listesi',  value: watchlist.length,     suffix: 'hisse'   },
              { icon: BookMarked, label: 'Kayıtlı Sinyal',  value: savedSignalsCount,    suffix: 'sinyal'  },
              { icon: Clock,      label: 'Son Sinyal',      value: lastSignalAt,          suffix: ''        },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 text-center"
                >
                  <div className="flex justify-center mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 border border-primary/20">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-white mb-0.5">{stat.value}</p>
                  <p className="text-xs text-white/40">{stat.label}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`group flex flex-col items-center gap-2.5 rounded-xl border bg-gradient-to-br p-4 transition-all duration-200 ${action.color}`}
                >
                  <Icon className="h-5 w-5 text-white/60 group-hover:text-white transition-colors" />
                  <span className="text-xs font-medium text-white/60 group-hover:text-white transition-colors">
                    {action.label}
                  </span>
                </Link>
              );
            })}
          </motion.div>
        </div>
      </BeamsBackground>

      {/* Content Section */}
      <div className="container mx-auto max-w-5xl px-4 py-10 space-y-6">
        {/* Watchlist */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden"
        >
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/6">
            <Star className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-white">İzleme Listesi</h2>
            <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/40">
              {watchlist.length} hisse
            </span>
          </div>
          <div className="p-6">
            <DashboardWatchlist watchlist={watchlist} />
          </div>
        </motion.div>

        {/* Saved Signals */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.5 }}
          className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden"
        >
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/6">
            <BookMarked className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-white">Kayıtlı Sinyaller</h2>
            <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/40">
              {savedSignalsCount} sinyal
            </span>
          </div>
          <div className="p-6">
            <DashboardSignals signals={savedSignals} totalCount={savedSignalsCount} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
