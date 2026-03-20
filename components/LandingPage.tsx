'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  type Variants,
} from 'framer-motion';
import {
  BarChart3, Sparkles, TrendingUp, TrendingDown,
  Shield, Zap, Brain, ArrowRight, ChevronDown,
  Activity, Globe2, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Ticker data ───────────────────────────────────────────────────

const TICKER_ITEMS = [
  { s: 'THYAO', p: '342.50', c: '+2.4%', up: true },
  { s: 'AKBNK', p: '58.30', c: '+1.1%', up: true },
  { s: 'SISE',  p: '89.70',  c: '-0.8%', up: false },
  { s: 'EREGL', p: '124.20', c: '+3.2%', up: true },
  { s: 'KCHOL', p: '198.40', c: '-1.4%', up: false },
  { s: 'BIMAS', p: '456.00', c: '+0.6%', up: true },
  { s: 'ARCLK', p: '237.80', c: '-2.1%', up: false },
  { s: 'TUPRS', p: '512.50', c: '+4.1%', up: true },
  { s: 'GARAN', p: '72.40',  c: '+1.8%', up: true },
  { s: 'TOASO', p: '310.90', c: '-0.5%', up: false },
  { s: 'PGSUS', p: '850.20', c: '+5.3%', up: true },
  { s: 'VESTL', p: '47.60',  c: '-1.2%', up: false },
  { s: 'HEKTS', p: '38.90',  c: '+0.9%', up: true },
  { s: 'EKGYO', p: '25.40',  c: '-0.3%', up: false },
];

// ── Mock live signals ─────────────────────────────────────────────

const MOCK_SIGNALS = [
  { sembol: 'THYAO', type: 'RSI Uyumsuzluk',   dir: 'AL',  sev: 'Güçlü', macro: '+42', confidence: 78 },
  { sembol: 'EREGL', type: 'Hacim Anomalisi',  dir: 'AL',  sev: 'Orta',  macro: '+42', confidence: 64 },
  { sembol: 'PGSUS', type: 'Trend Başlangıcı', dir: 'AL',  sev: 'Güçlü', macro: '+42', confidence: 71 },
  { sembol: 'KCHOL', type: 'S/R Kırılımı',     dir: 'SAT', sev: 'Zayıf', macro: '+18', confidence: 49 },
  { sembol: 'ARCLK', type: 'RSI Uyumsuzluk',   dir: 'SAT', sev: 'Orta',  macro: '+18', confidence: 58 },
  { sembol: 'BIMAS', type: 'Hacim Anomalisi',   dir: 'AL',  sev: 'Orta',  macro: '+42', confidence: 62 },
];

// ── Stats ─────────────────────────────────────────────────────────

const STATS = [
  { value: '400+', label: 'BIST Hissesi' },
  { value: '4',    label: 'Sinyal Tipi'  },
  { value: '3',    label: 'Makro Katman' },
  { value: '7/24', label: 'Canlı Analiz' },
];

// ── Features ──────────────────────────────────────────────────────

const FEATURES = [
  { icon: BarChart3,  title: 'Sinyal Tarama',    desc: 'RSI uyumsuzluğu, hacim anomalisi, trend başlangıcı ve kırılım — tüm BIST hisselerinde tek seferde.',        gradient: 'from-indigo-500/20 to-violet-500/5'  },
  { icon: Brain,      title: 'AI Açıklamalar',   desc: 'Her sinyal için Claude AI ile üretilen sade Türkçe analiz. Ne olduğunu değil, ne anlama geldiğini öğren.', gradient: 'from-violet-500/20 to-fuchsia-500/5' },
  { icon: TrendingUp, title: 'Makro Radar',      desc: 'VIX, DXY, USD/TRY, TCMB faizi — tüm makro rüzgarları tek panelde. BIST\'in nabzını hisset.',              gradient: 'from-cyan-500/20 to-blue-500/5'      },
  { icon: Shield,     title: 'Risk Skoru',       desc: 'Kompozit motor sektörü, makroyu ve teknik sinyali birleştirir. AL / TUT / SAT kararı + güven yüzdesi.',    gradient: 'from-emerald-500/20 to-teal-500/5'  },
  { icon: Zap,        title: 'Backtesting',      desc: 'Geçmiş sinyal performanslarını gör. Hangi sinyal tipi hangi koşulda daha başarılı oldu?',                  gradient: 'from-orange-500/20 to-amber-500/5'  },
  { icon: Sparkles,   title: 'AI Topluluk Botu', desc: 'Analistlerle fikir paylaş. AI Analist her paylaşımı otomatik yorumlar ve bağlam sunar.',                  gradient: 'from-pink-500/20 to-rose-500/5'     },
];

// ── Animated Globe ────────────────────────────────────────────────

const GLOBE_MARKERS = [
  { x: 285, y: 155 }, { x: 148, y: 235 }, { x: 318, y: 295 },
  { x: 175, y: 148 }, { x: 252, y: 315 }, { x: 330, y: 200 }, { x: 130, y: 290 },
];

function AnimatedGlobe() {
  const R = 190;
  const CX = 210, CY = 210;
  const latOffsets = [-152, -114, -76, -38, 0, 38, 76, 114, 152];
  const longAngles = [0, 30, 60, 90, 120, 150];

  return (
    <div className="relative flex h-[420px] w-[420px] items-center justify-center">
      {/* Glow */}
      <div className="absolute inset-[40px] rounded-full bg-indigo-600/15 blur-[70px]" />
      <div className="absolute inset-[80px] rounded-full bg-violet-600/10 blur-[50px]" />

      <svg viewBox="0 0 420 420" className="relative h-full w-full" overflow="visible">
        <defs>
          <clipPath id="gc">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
          <radialGradient id="gb" cx="38%" cy="32%" r="70%">
            <stop offset="0%"   stopColor="#1e1b4b" stopOpacity="0.8" />
            <stop offset="60%"  stopColor="#0f0f1a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0a0a0f" stopOpacity="1"   />
          </radialGradient>
          <radialGradient id="gs" cx="35%" cy="30%" r="50%">
            <stop offset="0%"   stopColor="rgba(99,102,241,0.12)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Globe base */}
        <circle cx={CX} cy={CY} r={R} fill="url(#gb)" />
        <circle cx={CX} cy={CY} r={R} fill="url(#gs)" />

        {/* Grid lines */}
        <g clipPath="url(#gc)" fill="none">
          {/* Latitude */}
          {latOffsets.map((dy, i) => {
            const rx = Math.sqrt(Math.max(0, R * R - dy * dy));
            return <ellipse key={i} cx={CX} cy={CY + dy} rx={rx} ry={rx * 0.28} stroke="rgba(99,102,241,0.18)" strokeWidth="0.7" />;
          })}
          {/* Longitude — animasyonlu */}
          {longAngles.map((angle, i) => (
            <motion.ellipse
              key={i}
              cx={CX} cy={CY} rx={48} ry={R}
              stroke="rgba(99,102,241,0.18)" strokeWidth="0.7"
              animate={{ rotate: [angle, angle + 360] }}
              transition={{ duration: 18 + i * 3, repeat: Infinity, ease: 'linear' }}
              style={{ originX: `${CX}px`, originY: `${CY}px` }}
            />
          ))}
          {/* Equator highlight */}
          <ellipse cx={CX} cy={CY} rx={R} ry={R * 0.28} stroke="rgba(99,102,241,0.35)" strokeWidth="1" />
        </g>

        {/* Outer rings */}
        <circle cx={CX} cy={CY} r={R}     stroke="rgba(99,102,241,0.35)" strokeWidth="1"   fill="none" />
        <circle cx={CX} cy={CY} r={R + 6} stroke="rgba(99,102,241,0.12)" strokeWidth="4"   fill="none" />
        <circle cx={CX} cy={CY} r={R + 18} stroke="rgba(99,102,241,0.06)" strokeWidth="8"  fill="none" />

        {/* Markers */}
        {GLOBE_MARKERS.map((m, i) => (
          <g key={i}>
            <motion.circle
              cx={m.x} cy={m.y} r={2.5}
              fill="rgba(99,102,241,0.9)"
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 2 + i * 0.35, repeat: Infinity, ease: 'easeInOut' }}
              style={{ originX: `${m.x}px`, originY: `${m.y}px` }}
            />
            <motion.circle
              cx={m.x} cy={m.y} r={7}
              fill="none" stroke="rgba(99,102,241,0.4)"
              animate={{ r: [6, 14], opacity: [0.5, 0] }}
              transition={{ duration: 2 + i * 0.35, repeat: Infinity, ease: 'easeOut', delay: i * 0.2 }}
            />
          </g>
        ))}

        {/* ── Floating Astronaut ── */}
        <motion.g
          animate={{ y: [0, -13, 2, -13, 0], rotate: [-5, 5, -2, 5, -5] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ originX: `${CX}px`, originY: `${CY - 10}px` }}
        >
          {/* Soft glow */}
          <circle cx={CX} cy={CY - 10} r={26} fill="rgba(99,102,241,0.09)" />

          {/* Left leg */}
          <rect x={CX - 11} y={CY + 14} width={9} height={12} rx={3}
            fill="rgba(215,215,238,0.93)" stroke="rgba(150,150,200,0.3)" strokeWidth="0.5" />
          {/* Right leg */}
          <rect x={CX + 2} y={CY + 14} width={9} height={12} rx={3}
            fill="rgba(215,215,238,0.93)" stroke="rgba(150,150,200,0.3)" strokeWidth="0.5" />

          {/* Body */}
          <rect x={CX - 14} y={CY - 5} width={28} height={21} rx={6}
            fill="rgba(225,225,245,0.95)" stroke="rgba(150,150,200,0.35)" strokeWidth="0.6" />
          {/* Chest panel */}
          <rect x={CX - 7} y={CY} width={14} height={9} rx={2}
            fill="rgba(80,80,160,0.65)" />
          {/* Panel lights */}
          <motion.circle cx={CX - 3} cy={CY + 4} r={1.8} fill="#4ade80"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.8, repeat: Infinity }} />
          <motion.circle cx={CX + 1} cy={CY + 4} r={1.8} fill="#f87171"
            animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.2, repeat: Infinity }} />
          <motion.circle cx={CX + 5} cy={CY + 4} r={1.8} fill="#fbbf24"
            animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />

          {/* Left arm */}
          <rect x={CX - 23} y={CY - 4} width={10} height={7} rx={3}
            fill="rgba(215,215,238,0.93)" stroke="rgba(150,150,200,0.3)" strokeWidth="0.5" />
          {/* Right arm */}
          <rect x={CX + 13} y={CY - 4} width={10} height={7} rx={3}
            fill="rgba(215,215,238,0.93)" stroke="rgba(150,150,200,0.3)" strokeWidth="0.5" />
          {/* Gloves */}
          <circle cx={CX - 18} cy={CY + 1} r={3.5} fill="rgba(180,180,215,0.9)" />
          <circle cx={CX + 18} cy={CY + 1} r={3.5} fill="rgba(180,180,215,0.9)" />

          {/* Backpack */}
          <rect x={CX + 12} y={CY - 9} width={6} height={14} rx={2}
            fill="rgba(140,140,190,0.85)" />

          {/* Helmet */}
          <circle cx={CX} cy={CY - 21} r={16}
            fill="rgba(225,225,245,0.95)" stroke="rgba(150,150,200,0.35)" strokeWidth="0.8" />
          {/* Visor */}
          <ellipse cx={CX} cy={CY - 21} rx={11} ry={10}
            fill="rgba(50,55,180,0.82)" />
          {/* Visor shine */}
          <ellipse cx={CX - 3.5} cy={CY - 25} rx={4} ry={2.5}
            fill="rgba(255,255,255,0.22)" />
          <ellipse cx={CX + 3} cy={CY - 17} rx={2} ry={1.2}
            fill="rgba(255,255,255,0.1)" />

          {/* Tether */}
          <path
            d={`M ${CX + 12} ${CY - 6} Q ${CX + 38} ${CY - 28} ${CX + 55} ${CY - 50}`}
            stroke="rgba(160,160,220,0.35)" strokeWidth="1.2" fill="none"
            strokeDasharray="4 3"
          />
        </motion.g>

        {/* Orbit ring */}
        <motion.circle
          cx={CX} cy={CY} r={R + 30}
          fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth="1" strokeDasharray="8 6"
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          style={{ originX: `${CX}px`, originY: `${CY}px` }}
        />
        {/* Orbit dot */}
        <motion.circle
          r={4} fill="rgba(167,139,250,0.9)"
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          style={{ originX: `${CX}px`, originY: `${CY}px` }}
          cx={CX} cy={CY - R - 30}
        />
      </svg>
    </div>
  );
}

// ── Depth section ─────────────────────────────────────────────────

function DepthSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: '-12% 0px -12% 0px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95, y: 50 }}
      animate={isInView ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.95, y: 50 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Word-by-word title ────────────────────────────────────────────

function AnimatedTitle({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(' ');
  const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
  };
  const word: Variants = {
    hidden: { opacity: 0, y: 28, filter: 'blur(6px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  };
  return (
    <motion.h1 variants={container} initial="hidden" animate="visible" className={className}>
      {words.map((w, i) => (
        <motion.span key={i} variants={word} className="inline-block mr-[0.28em]">
          {w}
        </motion.span>
      ))}
    </motion.h1>
  );
}

// ── Stat card ─────────────────────────────────────────────────────

function StatCard({ value, label, delay }: { value: string; label: string; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: 'easeOut' }}
      className="text-center"
    >
      <div className="stat-number text-4xl font-bold gradient-text-animated md:text-5xl">{value}</div>
      <div className="mt-1 text-sm text-text-secondary">{label}</div>
    </motion.div>
  );
}

// ── Feature card ──────────────────────────────────────────────────

function FeatureCard({ f, index }: { f: typeof FEATURES[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-8% 0px' });
  const Icon = f.icon;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 44, scale: 0.96 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className={`card-glow group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${f.gradient} p-6`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-surface/80 transition-transform duration-300 group-hover:scale-110">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-text-primary">{f.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{f.desc}</p>
    </motion.div>
  );
}

// ── Signal row ────────────────────────────────────────────────────

function SignalRow({ sig, index }: { sig: typeof MOCK_SIGNALS[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const isAl = sig.dir === 'AL';
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/40 px-4 py-3 backdrop-blur-sm transition-colors hover:border-primary/30 hover:bg-surface/60"
    >
      {/* Sembol */}
      <span className="w-14 text-xs font-bold text-text-primary">{sig.sembol}</span>
      {/* Sinyal tipi */}
      <span className="flex-1 text-xs text-text-secondary">{sig.type}</span>
      {/* Severity */}
      <span className="hidden text-[10px] text-text-secondary sm:block">{sig.sev}</span>
      {/* Makro */}
      <span className="hidden items-center gap-1 text-[10px] text-bullish sm:flex">
        <Activity className="h-2.5 w-2.5" />
        {sig.macro}
      </span>
      {/* Confidence bar */}
      <div className="hidden w-16 sm:block">
        <div className="h-1 rounded-full bg-border">
          <motion.div
            initial={{ width: 0 }}
            animate={isInView ? { width: `${sig.confidence}%` } : {}}
            transition={{ duration: 0.8, delay: index * 0.06 + 0.3 }}
            className={`h-1 rounded-full ${isAl ? 'bg-bullish' : 'bg-bearish'}`}
          />
        </div>
        <span className="mt-0.5 text-[9px] text-text-secondary">{sig.confidence}%</span>
      </div>
      {/* Dir badge */}
      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${isAl ? 'bg-bullish/15 text-bullish' : 'bg-bearish/15 text-bearish'}`}>
        {sig.dir}
      </span>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    // overflow-x: clip — scroll'u kilitlemez, sadece yatay taşmayı keser
    <div style={{ overflowX: 'clip' }}>

      {/* ── Side labels ──────────────────────────────────────────── */}
      <div className="side-label pointer-events-none fixed left-4 top-1/2 -translate-y-1/2 hidden text-text-secondary xl:block">
        BistAI // 2026
      </div>
      <div
        className="side-label pointer-events-none fixed right-4 top-1/2 -translate-y-1/2 hidden text-text-secondary xl:block"
        style={{ writingMode: 'vertical-lr', transform: 'translateY(-50%) rotate(180deg)' }}
      >
        BIST // AI SIGNALS
      </div>

      {/* ── Ticker ───────────────────────────────────────────────── */}
      <div className="relative z-10 overflow-hidden border-b border-border/50 bg-surface/60 py-2 backdrop-blur-sm">
        <div className="ticker-track flex items-center gap-8">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <Link
              key={i}
              href={`/hisse/${item.s}`}
              className="flex items-center gap-1.5 whitespace-nowrap text-xs transition-opacity hover:opacity-80"
            >
              <span className="font-semibold text-text-primary">{item.s}</span>
              <span className="text-text-secondary">{item.p}</span>
              <span className={item.up ? 'text-bullish' : 'text-bearish'}>
                {item.up
                  ? <TrendingUp className="inline h-3 w-3" />
                  : <TrendingDown className="inline h-3 w-3" />}
                {' '}{item.c}
              </span>
              <span className="text-border/60 mx-1">|</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── SECTION 1: Hero ──────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="dot-grid relative flex min-h-screen items-center"
      >
        {/* Orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-1 absolute left-[5%]  top-[10%] h-[500px] w-[500px] rounded-full bg-indigo-600/8  blur-[120px]" />
          <div className="orb-2 absolute right-[5%] top-[30%] h-[400px] w-[400px] rounded-full bg-violet-600/8  blur-[100px]" />
          <div className="orb-3 absolute bottom-[5%] left-[35%] h-[300px] w-[300px] rounded-full bg-cyan-600/6 blur-[80px]"  />
        </div>
        {/* Scan line */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
          <div className="scan-line" />
        </div>

        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="container relative z-10 mx-auto px-4 py-20"
        >
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">

            {/* Left — text */}
            <div className="flex-1 text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                BIST için Yapay Zeka Destekli Sinyal Analizi
              </motion.div>

              <AnimatedTitle
                text="BIST Hisselerinde AI Destekli Sinyal Analizi"
                className="text-4xl font-bold leading-tight tracking-tight text-text-primary md:text-5xl xl:text-6xl"
              />

              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.7, delay: 0.85 }}
                className="mt-3 h-1 w-40 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 lg:mx-0 mx-auto"
              />

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 1.0 }}
                className="mt-5 max-w-lg text-base text-text-secondary md:text-lg lg:mx-0 mx-auto"
              >
                Teknik sinyal × Makro rüzgar × Sektör uyumu →{' '}
                <span className="gradient-text font-semibold">AL / TUT / SAT</span> kararı.
                Her sinyal için sade Türkçe AI açıklaması.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 1.15 }}
                className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
              >
                <Button size="lg" className="glow-btn px-7 py-6 text-sm font-semibold" asChild>
                  <Link href="/kayit">
                    Ücretsiz Başla
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="border-border/60 px-7 py-6 text-sm hover:border-primary/40 hover:bg-primary/5" asChild>
                  <Link href="/giris">Giriş Yap</Link>
                </Button>
              </motion.div>

              {/* Mini stats */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
                className="mt-10 flex flex-wrap items-center justify-center gap-6 lg:justify-start"
              >
                {[
                  { icon: Globe2,   text: '400+ hisse' },
                  { icon: Activity, text: '4 sinyal tipi' },
                  { icon: Users,    text: 'Topluluk' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <item.icon className="h-3.5 w-3.5 text-primary opacity-60" />
                    {item.text}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right — Globe */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.0, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="hidden flex-shrink-0 lg:block"
            >
              <AnimatedGlobe />
            </motion.div>
          </div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="flex flex-col items-center gap-1 text-text-secondary"
          >
            <span className="text-[10px] uppercase tracking-widest opacity-40">Keşfet</span>
            <ChevronDown className="h-4 w-4 opacity-40" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── SECTION 2: Stats bar ──────────────────────────────────── */}
      <section className="relative border-y border-border/40 bg-surface/30 py-14 backdrop-blur-sm">
        <DepthSection>
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {STATS.map((s, i) => <StatCard key={i} value={s.value} label={s.label} delay={i * 0.1} />)}
            </div>
          </div>
        </DepthSection>
      </section>

      {/* ── SECTION 3: Live signals preview ──────────────────────── */}
      <section className="relative py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-2 absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-indigo-600/6 blur-[100px]" />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <DepthSection className="mb-12 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary opacity-70">Canlı Önizleme</span>
            <h2 className="mt-3 text-3xl font-bold text-text-primary md:text-4xl">
              Anlık sinyaller,{' '}
              <span className="gradient-text">gerçek zamanlı</span>
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-text-secondary">
              Şu an aktif olan sinyallerin bir önizlemesi. Tam analiz için hesap oluştur.
            </p>
          </DepthSection>

          <div className="mx-auto max-w-2xl space-y-2">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-secondary opacity-60">
              <span className="w-14">Hisse</span>
              <span className="flex-1">Sinyal</span>
              <span className="hidden sm:block">Şiddet</span>
              <span className="hidden sm:block w-20">Makro</span>
              <span className="hidden w-20 sm:block">Güven</span>
              <span>Karar</span>
            </div>

            {MOCK_SIGNALS.map((sig, i) => <SignalRow key={i} sig={sig} index={i} />)}

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="pt-4 text-center"
            >
              <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10" asChild>
                <Link href="/kayit">
                  Tüm Sinyalleri Gör
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: Features ───────────────────────────────────── */}
      <section className="dot-grid relative py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-3 absolute bottom-0 left-0 h-[350px] w-[350px] rounded-full bg-violet-600/6 blur-[90px]" />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <DepthSection className="mb-14 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary opacity-70">Özellikler</span>
            <h2 className="mt-3 text-3xl font-bold text-text-primary md:text-4xl">
              Profesyonel araçlar,{' '}
              <span className="gradient-text">herkes için</span>
            </h2>
          </DepthSection>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => <FeatureCard key={i} f={f} index={i} />)}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: How it works ───────────────────────────────── */}
      <section className="relative py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-1 absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/6 blur-[120px]" />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <DepthSection className="mb-14 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary opacity-70">Nasıl Çalışır</span>
            <h2 className="mt-3 text-3xl font-bold text-text-primary md:text-4xl">
              3 katman,{' '}
              <span className="gradient-text">1 karar</span>
            </h2>
          </DepthSection>

          <div className="relative mx-auto flex max-w-4xl flex-col items-stretch gap-4 md:flex-row">
            {[
              { n: '01', label: 'Makro Analiz',   desc: 'VIX, DXY, USD/TRY ve TCMB faiz kararları izlenir. Global piyasa rüzgarı hesaplanır.',             icon: Globe2,    color: 'text-cyan-400',    border: 'border-cyan-500/20'    },
              { n: '02', label: 'Teknik Sinyal',  desc: 'RSI uyumsuzluğu, hacim anomalisi, EMA kesiştirmesi ve S/R kırılımları tespit edilir.',            icon: BarChart3, color: 'text-indigo-400',  border: 'border-indigo-500/20'  },
              { n: '03', label: 'AI Kararı',      desc: 'Katmanlar birleşir, kompozit skor üretilir. Claude AI sade Türkçe açıklama yazar.',               icon: Sparkles,  color: 'text-violet-400',  border: 'border-violet-500/20'  },
            ].map((step, i) => {
              const Icon = step.icon;
              const ref = useRef<HTMLDivElement>(null);
              const isInView = useInView(ref, { once: true });
              return (
                <div key={i} className="flex flex-1 items-center gap-3 md:flex-col md:gap-0">
                  <motion.div
                    ref={ref}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.55, delay: i * 0.15 }}
                    className={`flex-1 rounded-2xl border ${step.border} bg-surface/60 p-6 text-center backdrop-blur-sm`}
                  >
                    <div className="mb-1 text-xs font-bold tracking-widest opacity-25">{step.n}</div>
                    <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-surface/80 ${step.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-semibold text-text-primary">{step.label}</h3>
                    <p className="mt-2 text-sm text-text-secondary">{step.desc}</p>
                  </motion.div>
                  {i < 2 && (
                    <motion.div
                      initial={{ scaleX: 0, opacity: 0 }}
                      whileInView={{ scaleX: 1, opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: i * 0.15 + 0.3 }}
                      className="hidden h-px w-8 origin-left bg-gradient-to-r from-border to-primary/30 md:block flex-shrink-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 6: CTA ───────────────────────────────────────── */}
      <section className="relative py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-1 absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/8 blur-[130px]" />
        </div>

        <DepthSection>
          <div className="mx-auto max-w-xl px-4 text-center">
            <motion.div
              whileInView={{ scale: [0.92, 1] }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-primary/20 bg-surface/60 p-10 backdrop-blur-sm"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl font-bold text-text-primary md:text-4xl">
                Hemen başla,{' '}
                <span className="gradient-text-animated">ücretsiz</span>
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-text-secondary">
                Kredi kartı gerekmez. 5 dakikada hesap oluştur, sinyalleri taramaya başla.
              </p>
              <Button size="lg" className="glow-btn mt-7 px-9 py-6 text-sm font-semibold" asChild>
                <Link href="/kayit">
                  Ücretsiz Hesap Oluştur
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <p className="mt-3 text-xs text-text-secondary opacity-50">
                Free plan · Kredi kartı yok · İstediğin zaman iptal
              </p>
            </motion.div>
          </div>
        </DepthSection>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 text-xs text-text-secondary sm:flex-row">
          <span className="gradient-text text-sm font-bold">BistAI</span>
          <span className="opacity-40">© 2026 BistAI. Tüm haklar saklıdır.</span>
          <span className="opacity-40">Yatırım tavsiyesi değildir.</span>
        </div>
      </footer>
    </div>
  );
}
