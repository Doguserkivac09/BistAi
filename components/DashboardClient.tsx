'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Star, BookMarked, Search, BarChart2, TrendingUp, Users,
  Briefcase, Newspaper, PieChart, MessageSquare, Zap,
  TrendingDown, Minus, Sparkles, Bot, ChevronRight, Target, Shield,
  Bookmark, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BeamsBackground } from '@/components/ui/beams-background';
import { DashboardWatchlist } from '@/components/DashboardWatchlist';
import { DashboardSignals } from '@/components/DashboardSignals';
import { MacroWindGauge } from '@/components/MacroWindGauge';
import type { WatchlistItem, SavedSignal } from '@/types';
import type { MacroScoreResult } from '@/lib/macro-score';
import type { GununSecimiData } from '@/app/api/gunun-secimi/route';

// ── Arka plan efekti ─────────────────────────────────────────────────────────

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
            top: m.top, left: m.left,
            width: `${m.width}px`, height: '1.5px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)',
            animationDuration: `${m.duration + 4}s`,
            animationDelay: `${m.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6)  return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

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

// ── Bölüm başlığı — tüm widget'larda ortak ──────────────────────────────────

function WidgetHeader({
  icon: Icon,
  title,
  badge,
  href,
  linkLabel,
}: {
  icon: React.ElementType;
  title: string;
  badge?: string | number;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/6">
      <Icon className="h-4 w-4 text-white/45 shrink-0" />
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {badge !== undefined && (
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/40">
          {badge}
        </span>
      )}
      {href && linkLabel && (
        <Link
          href={href}
          className="ml-auto text-xs text-primary/70 hover:text-primary transition-colors"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

// Widget kutusu — tüm bölümlerde ortak kap
function Widget({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-white/8 bg-black/35 backdrop-blur-md overflow-hidden', className)}>
      {children}
    </div>
  );
}

// ── Sabitler ─────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  free:    { label: 'Ücretsiz', color: 'text-white/40',   border: 'border-white/15 bg-white/5'       },
  pro:     { label: 'Pro',      color: 'text-blue-400',   border: 'border-blue-500/30 bg-blue-500/10' },
  premium: { label: 'Premium',  color: 'text-yellow-400', border: 'border-yellow-500/30 bg-yellow-500/10' },
};

const DAILY_LIMITS: Record<string, number> = { free: 7, pro: 20, premium: 50 };

const QUICK_LINKS = [
  { href: '/firsatlar',   icon: Zap,        label: 'Fırsatlar',  color: 'from-indigo-500/15 to-violet-500/15 border-indigo-500/25 hover:border-indigo-400/40' },
  { href: '/makro',       icon: BarChart2,   label: 'Makro',      color: 'from-blue-500/15 to-cyan-500/15 border-blue-500/25 hover:border-blue-400/40' },
  { href: '/backtesting', icon: TrendingUp,  label: 'Backtest',   color: 'from-emerald-500/15 to-teal-500/15 border-emerald-500/25 hover:border-emerald-400/40' },
  { href: '/sohbet',      icon: MessageSquare, label: 'AI Sohbet', color: 'from-violet-500/15 to-purple-500/15 border-violet-500/25 hover:border-violet-400/40' },
  { href: '/topluluk',    icon: Users,       label: 'Topluluk',   color: 'from-pink-500/15 to-rose-500/15 border-pink-500/25 hover:border-pink-400/40' },
  { href: '/haberler',    icon: Newspaper,   label: 'Gündem',     color: 'from-amber-500/15 to-orange-500/15 border-amber-500/25 hover:border-amber-400/40' },
  { href: '/sektorler',   icon: PieChart,    label: 'Sektörler',  color: 'from-teal-500/15 to-cyan-500/15 border-teal-500/25 hover:border-teal-400/40' },
];

// ── Tipler ───────────────────────────────────────────────────────────────────

interface MiniFireat {
  sembol:         string;
  sinyaller:      string[];
  direction:      'yukari' | 'asagi' | 'notr';
  confluenceScore: number;
  entryPrice:     number;
  sektorAdi:      string;
}

interface TrackedSignal {
  id:            string;
  sembol:        string;
  signal_type:   string;
  direction:     string | null;
  tracked_at:    string;
  entry_price:   number;
  current_price: number;
  return_pct:    number;
}

interface Props {
  email:             string;
  displayName:       string;
  avatarUrl:         string | null;
  tier:              string;
  dailyAiCount:      number;
  watchlist:         WatchlistItem[];
  savedSignals:      SavedSignal[];
  savedSignalsCount: number;
  lastSignalAt:      string;
  portfolyoCount:    number;
  macroScore:        MacroScoreResult | null;
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────

export function DashboardClient({
  email,
  displayName,
  avatarUrl: initialAvatarUrl,
  tier,
  dailyAiCount,
  watchlist,
  savedSignals,
  savedSignalsCount,
  portfolyoCount,
  macroScore,
}: Props) {
  const [avatarUrl,       setAvatarUrl]       = useState(initialAvatarUrl);
  const [firsatlar,       setFirsatlar]       = useState<MiniFireat[]>([]);
  const [firsatlarLoading, setFirsatlarLoading] = useState(true);
  const [gununSecimi,     setGununSecimi]     = useState<GununSecimiData | null>(null);
  const [trackedSignals,  setTrackedSignals]  = useState<TrackedSignal[]>([]);

  // Avatar değişikliğini dinle (profil sayfasından)
  useEffect(() => {
    function onAvatarChange(e: Event) {
      setAvatarUrl((e as CustomEvent<string>).detail);
    }
    window.addEventListener('avatar-changed', onAvatarChange);
    return () => window.removeEventListener('avatar-changed', onAvatarChange);
  }, []);

  // Fırsatlar
  useEffect(() => {
    fetch('/api/firsatlar?minScore=45')
      .then(r => r.json())
      .then(d => setFirsatlar((d.firsatlar ?? []).slice(0, 4)))
      .catch(() => {})
      .finally(() => setFirsatlarLoading(false));
  }, []);

  // Günün Seçimi
  useEffect(() => {
    fetch('/api/gunun-secimi')
      .then(r => r.json())
      .then(d => setGununSecimi(d.data ?? null))
      .catch(() => {});
  }, []);

  // Sinyal takibi
  useEffect(() => {
    fetch('/api/signal-tracker')
      .then(r => r.json())
      .then(d => setTrackedSignals((d.items ?? []).slice(0, 5)))
      .catch(() => {});
  }, []);

  const limit    = DAILY_LIMITS[tier] ?? 7;
  const aiPct    = Math.min(100, Math.round((dailyAiCount / limit) * 100));
  const tierConf = TIER_CONFIG[tier] ?? TIER_CONFIG.free!;

  return (
    <div className="relative isolate min-h-screen bg-[#050510]">
      <BeamsBackground fixed intensity="medium" />
      <Meteors />

      <div className="relative z-10">
        <div className="container mx-auto max-w-5xl px-4 pt-10 pb-20">

          {/* ════════════════════════════════════════════════════════════
              1. HERO — Avatar + isim + tier
          ════════════════════════════════════════════════════════════ */}
          <div className="mb-8 text-center animate-fade-in-up">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="mx-auto mb-4 h-20 w-20 rounded-full object-cover shadow-lg ring-4 ring-white/10"
              />
            ) : (
              <div className={cn(
                'mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-black text-white shadow-lg ring-4 ring-white/10',
                avatarGradient(displayName)
              )}>
                {displayName[0]?.toUpperCase() ?? 'U'}
              </div>
            )}

            <p className="text-[10px] font-mono text-white/30 tracking-widest uppercase mb-1">
              {getGreeting()}
            </p>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2">
              {displayName}
            </h1>
            <div className="flex items-center justify-center gap-2">
              <p className="text-white/30 text-sm">{email}</p>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tierConf.color} ${tierConf.border}`}>
                {tierConf.label}
              </span>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
              2. STAT BAR — 4 özet kart
          ════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
            {[
              { icon: Star,      label: 'Watchlist',  value: watchlist.length,    href: '/watchlist'           },
              { icon: Bookmark,  label: 'Sinyallerim', value: savedSignalsCount,  href: '#sinyaller'           },
              { icon: Briefcase, label: 'Portföy',    value: portfolyoCount,       href: '/portfolyo'           },
              { icon: Activity,  label: 'Takip',      value: trackedSignals.length, href: '/sinyal-takip'       },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.label}
                  href={s.href}
                  className="block rounded-2xl border border-white/8 bg-white/4 backdrop-blur-md p-4 text-center hover:border-primary/25 hover:bg-white/6 transition-colors"
                >
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary/12 border border-primary/20">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="text-lg font-bold text-white leading-none tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-white/35 mt-1">{s.label}</p>
                </Link>
              );
            })}
          </div>

          {/* ════════════════════════════════════════════════════════════
              3. ZONE A — GÜNÜN SEÇİMİ (en önemli)
          ════════════════════════════════════════════════════════════ */}
          {gununSecimi && (() => {
            const upside = gununSecimi.targetPrice && gununSecimi.entryPrice
              ? ((gununSecimi.targetPrice - gununSecimi.entryPrice) / gununSecimi.entryPrice * 100)
              : null;
            const scoreColor =
              gununSecimi.adjustedScore >= 75 ? 'text-emerald-400' :
              gununSecimi.adjustedScore >= 60 ? 'text-sky-400' : 'text-amber-400';
            return (
              <div className="mb-8 animate-fade-in-up rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 via-black/40 to-black/40 backdrop-blur-md p-5" style={{ animationDelay: '120ms' }}>
                {/* Başlık şeridi */}
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Günün Seçimi</span>
                  <span className="ml-auto text-[11px] text-white/35">{gununSecimi.sektorAdi}</span>
                </div>

                {/* Sembol + skor */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-2xl font-black text-white tracking-tight">{gununSecimi.sembol}</span>
                      <span className="rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold text-emerald-400">AL</span>
                      {gununSecimi.sinyaller[0] && (
                        <span className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[10px] text-white/50">
                          {gununSecimi.sinyaller[0]}
                        </span>
                      )}
                    </div>
                    {gununSecimi.gerekce && (
                      <p className="text-[13px] text-white/50 leading-relaxed line-clamp-2">
                        {gununSecimi.gerekce}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-3xl font-black tabular-nums leading-none ${scoreColor}`}>
                      {gununSecimi.adjustedScore}
                    </div>
                    <div className="text-[10px] text-white/30 mt-0.5">/ 100</div>
                  </div>
                </div>

                {/* Metrikler + link */}
                <div className="flex items-center gap-4 flex-wrap border-t border-white/6 pt-3">
                  {gununSecimi.targetPrice && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <Target className="h-3 w-3" />
                      {gununSecimi.targetPrice.toFixed(2)}₺
                      {upside !== null && <span className="text-emerald-400/55">(+{upside.toFixed(1)}%)</span>}
                    </span>
                  )}
                  {gununSecimi.stopLoss && (
                    <span className="flex items-center gap-1 text-[11px] text-red-400/80">
                      <Shield className="h-3 w-3" />
                      {gununSecimi.stopLoss.toFixed(2)}₺
                    </span>
                  )}
                  {gununSecimi.riskRewardRatio && (
                    <span className="text-[11px] text-white/30 tabular-nums">
                      R/R {gununSecimi.riskRewardRatio.toFixed(1)}:1
                    </span>
                  )}
                  <Link
                    href={`/hisse/${gununSecimi.sembol}`}
                    className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-primary hover:text-primary/70 transition-colors"
                  >
                    Tam Analiz <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })()}

          {/* ════════════════════════════════════════════════════════════
              4. ZONE B — BAĞLAM: Portföy + Makro (2-sütun)
          ════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 animate-fade-in-up items-start" style={{ animationDelay: '160ms' }}>

            {/* Portföy Özeti */}
            {portfolyoCount === 0 ? (
              <Widget>
                <WidgetHeader icon={Briefcase} title="Portföyüm" />
                <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                  <Briefcase className="h-8 w-8 text-white/10 mb-2" />
                  <p className="text-sm text-white/35 mb-1">Henüz portföy yok</p>
                  <p className="text-xs text-white/20 mb-4 max-w-xs">
                    Alış fiyatı ve miktar girerek kar/zarar takibi yapın
                  </p>
                  <Link
                    href="/portfolyo"
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary hover:bg-primary/20 transition-colors"
                  >
                    + Portföy Oluştur
                  </Link>
                </div>
              </Widget>
            ) : (
              <Widget>
                <WidgetHeader icon={Briefcase} title="Portföyüm" href="/portfolyo" linkLabel="Detay" />
                <Link
                  href="/portfolyo"
                  className="flex items-center gap-3 px-5 py-4 hover:bg-white/4 transition-colors group"
                >
                  <div className="flex-1">
                    <p className="text-xl font-bold text-white tabular-nums">{portfolyoCount}</p>
                    <p className="text-xs text-white/35 mt-0.5">aktif pozisyon</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/30">P&L için</p>
                    <p className="text-xs text-primary/70">portföy sayfası →</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/20 shrink-0" />
                </Link>
              </Widget>
            )}

            {/* Makro Rüzgar */}
            {macroScore ? (
              <Widget>
                <WidgetHeader icon={BarChart2} title="Makro Rüzgar" href="/makro" linkLabel="Detay" />
                <div className="p-4">
                  <MacroWindGauge result={macroScore} compact />
                </div>
              </Widget>
            ) : (
              <Widget>
                <WidgetHeader icon={BarChart2} title="Makro Rüzgar" href="/makro" linkLabel="Detay" />
                <div className="flex items-center justify-center py-8 text-white/20 text-sm">
                  Veri yükleniyor...
                </div>
              </Widget>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════════
              5. ZONE C — KEŞİF: Bugünün Fırsatları
          ════════════════════════════════════════════════════════════ */}
          <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <Widget>
              <WidgetHeader icon={Zap} title="Bugünün Fırsatları" href="/firsatlar" linkLabel="Tümünü Gör" />
              {firsatlarLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                </div>
              ) : firsatlar.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                  <Zap className="h-7 w-7 text-white/10 mb-2" />
                  <p className="text-sm text-white/35">Bugün için henüz fırsat yok</p>
                  <p className="text-xs text-white/20 mt-1">Cron her iş günü sabah çalışır</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {firsatlar.map((f) => {
                    const isUp   = f.direction === 'yukari';
                    const isDown = f.direction === 'asagi';
                    const sc     = f.confluenceScore;
                    const scColor =
                      sc >= 70 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                      sc >= 55 ? 'text-sky-400 border-sky-500/30 bg-sky-500/10' :
                                  'text-white/40 border-white/10 bg-white/5';
                    return (
                      <Link
                        key={f.sembol}
                        href={`/hisse/${f.sembol}`}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/4 transition-colors group"
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                          isUp   ? 'border-emerald-500/30 bg-emerald-500/10' :
                          isDown ? 'border-red-500/30 bg-red-500/10' :
                                   'border-white/10 bg-white/5'
                        }`}>
                          {isUp   ? <TrendingUp   className="h-4 w-4 text-emerald-400" /> :
                           isDown ? <TrendingDown className="h-4 w-4 text-red-400" /> :
                                    <Minus        className="h-4 w-4 text-white/30" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                              {f.sembol}
                            </span>
                            <span className="text-[11px] text-white/30 truncate">{f.sektorAdi}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {f.sinyaller.slice(0, 2).map(s => (
                              <span key={s} className="rounded-full border border-white/8 bg-white/4 px-1.5 py-0.5 text-[10px] text-white/40">
                                {s}
                              </span>
                            ))}
                            {f.sinyaller.length > 2 && (
                              <span className="text-[10px] text-white/20">+{f.sinyaller.length - 2}</span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-white tabular-nums">
                            {f.entryPrice > 0 ? `₺${f.entryPrice.toFixed(2)}` : '—'}
                          </p>
                          <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${scColor}`}>
                            {sc}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                  <div className="px-5 py-2.5">
                    <Link href="/firsatlar" className="text-xs text-primary/60 hover:text-primary transition-colors">
                      Tüm fırsatları gör →
                    </Link>
                  </div>
                </div>
              )}
            </Widget>
          </div>

          {/* ════════════════════════════════════════════════════════════
              6. ZONE D — KİŞİSEL: Sinyal Takip + İzleme Listesi (2-sütun)
          ════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 animate-fade-in-up items-start" style={{ animationDelay: '240ms' }}>

            {/* Aktif Sinyal Takibi */}
            <Widget>
              <WidgetHeader
                icon={Bookmark}
                title="Sinyal Takibim"
                badge={trackedSignals.length || undefined}
                href="/sinyal-takip"
                linkLabel="Tümü"
              />
              {trackedSignals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                  <Bookmark className="h-7 w-7 text-white/10 mb-2" />
                  <p className="text-sm text-white/35 mb-1">Takip edilen sinyal yok</p>
                  <p className="text-xs text-white/20 mb-3 max-w-xs">
                    Fırsatlar'dan hisse kartındaki 🔖 ikonuna tıklayarak takibe alın
                  </p>
                  <Link
                    href="/firsatlar"
                    className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs text-primary hover:bg-primary/15 transition-colors"
                  >
                    Fırsatlara Git →
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {trackedSignals.map((sig) => {
                    const isPos    = sig.return_pct >= 0;
                    const retColor = isPos ? 'text-emerald-400' : 'text-red-400';
                    return (
                      <Link
                        key={sig.id}
                        href={`/hisse/${sig.sembol}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-white/4 transition-colors group"
                      >
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                          sig.direction === 'yukari'
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-red-500/30 bg-red-500/10'
                        }`}>
                          {sig.direction === 'yukari'
                            ? <TrendingUp   className="h-3.5 w-3.5 text-emerald-400" />
                            : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                            {sig.sembol}
                          </span>
                          <div className="text-[10px] text-white/25 mt-0.5 truncate">{sig.signal_type}</div>
                        </div>
                        <div className={`shrink-0 text-sm font-bold tabular-nums ${retColor}`}>
                          {isPos ? '+' : ''}{sig.return_pct.toFixed(1)}%
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Widget>

            {/* İzleme Listesi */}
            <Widget>
              <WidgetHeader
                icon={Star}
                title="İzleme Listesi"
                badge={watchlist.length || undefined}
                href="/watchlist"
                linkLabel="Tümü"
              />
              {watchlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                  <Star className="h-7 w-7 text-white/10 mb-2" />
                  <p className="text-sm text-white/35 mb-1">İzleme listeniz boş</p>
                  <p className="text-xs text-white/20 mb-3 max-w-xs">
                    Hisse kartlarındaki ⭐ ikonuyla takibe ekleyin
                  </p>
                  <Link
                    href="/firsatlar"
                    className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs text-primary hover:bg-primary/15 transition-colors"
                  >
                    Hisse Bul →
                  </Link>
                </div>
              ) : (
                <div className="p-4 max-h-72 overflow-y-auto">
                  <DashboardWatchlist watchlist={watchlist} />
                </div>
              )}
            </Widget>
          </div>

          {/* ════════════════════════════════════════════════════════════
              7. ZONE E — TARİHÇE: Kayıtlı Sinyaller
          ════════════════════════════════════════════════════════════ */}
          <div id="sinyaller" className="mb-8 animate-fade-in-up" style={{ animationDelay: '280ms' }}>
            <Widget>
              <WidgetHeader
                icon={BookMarked}
                title="Kayıtlı Sinyaller"
                badge={savedSignalsCount || undefined}
                href="/tarama"
                linkLabel="Sinyal Ara"
              />
              {savedSignalsCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                  <BookMarked className="h-7 w-7 text-white/10 mb-2" />
                  <p className="text-sm text-white/35 mb-1">Henüz kayıtlı sinyal yok</p>
                  <p className="text-xs text-white/20 max-w-xs">
                    Tarama sonuçlarından beğendiğiniz sinyalleri kaydedin
                  </p>
                </div>
              ) : (
                <div className="p-5">
                  <DashboardSignals signals={savedSignals} totalCount={savedSignalsCount} />
                  {savedSignals.length > 0 && (() => {
                    const counts = savedSignals.reduce<Record<string, number>>((acc, s) => {
                      acc[s.signal_type] = (acc[s.signal_type] ?? 0) + 1;
                      return acc;
                    }, {});
                    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
                    const total  = savedSignals.length;
                    return (
                      <div className="mt-5 pt-4 border-t border-white/6">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-3">
                          Sinyal Dağılımı
                        </p>
                        <div className="space-y-2">
                          {sorted.map(([type, count]) => {
                            const pct = Math.round((count / total) * 100);
                            return (
                              <div key={type}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[11px] text-white/45">{type}</span>
                                  <span className="text-[11px] font-semibold text-white/60 tabular-nums">
                                    {count} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-1 rounded-full bg-white/6 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary/50"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </Widget>
          </div>

          {/* ════════════════════════════════════════════════════════════
              8. ZONE F — ARAÇLAR: AI Asistan + Hızlı Erişim (alt, utility)
          ════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: '320ms' }}>

            {/* AI Asistan Kısayolu */}
            <Link
              href="/sohbet"
              className="block rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/6 via-black/30 to-black/30 backdrop-blur-md p-5 hover:border-violet-500/35 hover:from-violet-500/10 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/12">
                  <Bot className="h-4 w-4 text-violet-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">AI Asistanıma Sor</div>
                  <div className="text-[11px] text-white/30 mt-0.5">
                    "Bugün ne almalıyım?" · "Portföyüm nasıl?"
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-violet-400/40 ml-auto shrink-0" />
              </div>
              <div className="rounded-lg border border-violet-500/12 bg-white/3 px-3 py-2 mb-2">
                <span className="text-xs text-white/20 italic">Sorunuzu yazın...</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/20 tabular-nums">
                  {dailyAiCount}/{limit} mesaj kullanıldı
                </span>
                <div className="h-1 w-20 rounded-full bg-white/6 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${aiPct >= 90 ? 'bg-red-500' : aiPct >= 70 ? 'bg-yellow-500' : 'bg-primary/60'}`}
                    style={{ width: `${aiPct}%` }}
                  />
                </div>
              </div>
              {aiPct >= 80 && tier === 'free' && (
                <p className="mt-2 text-[10px] text-amber-400/60 text-center">
                  Limite yaklaştınız — Premium'a geçin
                </p>
              )}
            </Link>

            {/* Hızlı Erişim */}
            <Widget>
              <WidgetHeader icon={Search} title="Hızlı Erişim" />
              <div className="grid grid-cols-3 gap-1.5 p-3">
                {QUICK_LINKS.map((l) => {
                  const Icon = l.icon;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`group flex flex-col items-center gap-1 rounded-xl border bg-gradient-to-br p-2.5 text-center transition-all ${l.color}`}
                    >
                      <Icon className="h-4 w-4 text-white/45 group-hover:text-white transition-colors" />
                      <span className="text-[10px] font-semibold text-white/50 group-hover:text-white transition-colors leading-tight">
                        {l.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Widget>

          </div>

        </div>
      </div>
    </div>
  );
}
