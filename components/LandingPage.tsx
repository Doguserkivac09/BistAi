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
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Ticker data ───────────────────────────────────────────────────

const TICKER_ITEMS = [
  { s: 'THYAO', p: '342.50', c: '+2.4%', up: true },
  { s: 'AKBNK', p: '58.30', c: '+1.1%', up: true },
  { s: 'SISE', p: '89.70', c: '-0.8%', up: false },
  { s: 'EREGL', p: '124.20', c: '+3.2%', up: true },
  { s: 'KCHOL', p: '198.40', c: '-1.4%', up: false },
  { s: 'BIMAS', p: '456.00', c: '+0.6%', up: true },
  { s: 'ARCLK', p: '237.80', c: '-2.1%', up: false },
  { s: 'TUPRS', p: '512.50', c: '+4.1%', up: true },
  { s: 'GARAN', p: '72.40', c: '+1.8%', up: true },
  { s: 'TOASO', p: '310.90', c: '-0.5%', up: false },
];

// ── Mock signals ──────────────────────────────────────────────────

const MOCK_SIGNALS = [
  { sembol: 'THYAO', type: 'RSI Uyumsuzluk', dir: 'AL', severity: 'Güçlü', color: 'text-bullish border-bullish/30 bg-bullish/5' },
  { sembol: 'EREGL', type: 'Hacim Anomalisi', dir: 'AL', severity: 'Orta', color: 'text-bullish border-bullish/30 bg-bullish/5' },
  { sembol: 'KCHOL', type: 'Trend Başlangıcı', dir: 'SAT', severity: 'Zayıf', color: 'text-bearish border-bearish/30 bg-bearish/5' },
];

// ── Stats ─────────────────────────────────────────────────────────

const STATS = [
  { value: '400+', label: 'BIST Hissesi', suffix: '' },
  { value: '4', label: 'Sinyal Tipi', suffix: '' },
  { value: '3', label: 'Makro Katman', suffix: '' },
  { value: '7/24', label: 'Canlı Analiz', suffix: '' },
];

// ── Features ──────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Sinyal Tarama',
    desc: 'RSI uyumsuzluğu, hacim anomalisi, trend başlangıcı ve kırılım — tüm BIST hisselerinde tek seferde.',
    gradient: 'from-indigo-500/20 to-violet-500/10',
    glow: 'rgba(99,102,241,0.15)',
  },
  {
    icon: Brain,
    title: 'AI Açıklamalar',
    desc: 'Her sinyal için Claude AI ile üretilen, jargon-free Türkçe analiz. Ne olduğunu değil, ne anlama geldiğini öğren.',
    gradient: 'from-violet-500/20 to-fuchsia-500/10',
    glow: 'rgba(168,85,247,0.15)',
  },
  {
    icon: TrendingUp,
    title: 'Makro Radar',
    desc: 'VIX, DXY, USD/TRY, TCMB faizi — tüm makro rüzgarları tek panelde. BIST\'in nabzını hisset.',
    gradient: 'from-cyan-500/20 to-blue-500/10',
    glow: 'rgba(6,182,212,0.15)',
  },
  {
    icon: Shield,
    title: 'Risk Skoru',
    desc: 'Kompozit risk motoru sektörü, makroyu ve teknik sinyali birleştirir. AL / TUT / SAT kararı + güven yüzdesi.',
    gradient: 'from-emerald-500/20 to-teal-500/10',
    glow: 'rgba(16,185,129,0.15)',
  },
  {
    icon: Zap,
    title: 'Backtesting',
    desc: 'Geçmiş sinyal performanslarını gör. Hangi sinyal tipi hangi koşulda daha başarılı?',
    gradient: 'from-orange-500/20 to-amber-500/10',
    glow: 'rgba(249,115,22,0.15)',
  },
  {
    icon: Sparkles,
    title: 'Topluluk',
    desc: 'Analistler ve yatırımcılarla fikir paylaş. AI Analist her paylaşımı yorumlar.',
    gradient: 'from-pink-500/20 to-rose-500/10',
    glow: 'rgba(236,72,153,0.15)',
  },
];

// ── Section wrapper (depth scroll effect) ─────────────────────────

function DepthSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: '-15% 0px -15% 0px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.94, y: 60 }}
      animate={isInView ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.94, y: 60 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Word-by-word text animation ────────────────────────────────────

function AnimatedTitle({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(' ');
  const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
  };
  const word: Variants = {
    hidden: { opacity: 0, y: 30, filter: 'blur(8px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <motion.h1
      variants={container}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {words.map((w, i) => (
        <motion.span key={i} variants={word} className="inline-block mr-[0.3em]">
          {w}
        </motion.span>
      ))}
    </motion.h1>
  );
}

// ── Stat counter ──────────────────────────────────────────────────

function StatCard({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="text-center"
    >
      <div className="stat-number text-4xl font-bold gradient-text-animated md:text-5xl">
        {value}
      </div>
      <div className="mt-1 text-sm text-text-secondary">{label}</div>
    </motion.div>
  );
}

// ── Floating signal card ───────────────────────────────────────────

function FloatingSignalCard({
  signal, delay, x, rotate,
}: {
  signal: typeof MOCK_SIGNALS[0];
  delay: number;
  x: number;
  rotate: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, x }}
      animate={{ opacity: 1, y: 0, x }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute rounded-xl border p-3 backdrop-blur-sm ${signal.color}`}
      style={{ rotate, minWidth: 160 }}
      whileHover={{ scale: 1.04, rotate: 0 }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold">{signal.sembol}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${signal.dir === 'AL' ? 'bg-bullish/20 text-bullish' : 'bg-bearish/20 text-bearish'}`}>
          {signal.dir}
        </span>
      </div>
      <div className="mt-1 text-[11px] opacity-70">{signal.type}</div>
      <div className="mt-0.5 text-[10px] opacity-50">{signal.severity} sinyal</div>
    </motion.div>
  );
}

// ── Side labels ───────────────────────────────────────────────────

function SideLabels({ left, right }: { left: string; right: string }) {
  return (
    <>
      <motion.div
        key={left}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="side-label fixed left-4 top-1/2 -translate-y-1/2 hidden text-text-secondary xl:block"
      >
        {left}
      </motion.div>
      <motion.div
        key={right}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="side-label fixed right-4 top-1/2 -translate-y-1/2 hidden text-text-secondary xl:block"
        style={{ writingMode: 'vertical-lr', transform: 'translateY(-50%) rotate(180deg)' }}
      >
        {right}
      </motion.div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });

  // Hero zoom out + fade as you scroll away
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  return (
    <div className="relative overflow-x-hidden">
      <SideLabels left="BistAI // 2026" right="BIST // AI SIGNALS" />

      {/* ── Ticker ────────────────────────────────────────────── */}
      <div className="relative z-10 overflow-hidden border-b border-border/50 bg-surface/60 py-2 backdrop-blur-sm">
        <div className="ticker-track flex items-center gap-8">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <span className="font-semibold text-text-primary">{item.s}</span>
              <span className="text-text-secondary">{item.p}</span>
              <span className={item.up ? 'text-bullish' : 'text-bearish'}>
                {item.up ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
                {item.c}
              </span>
              <span className="text-border">|</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── SECTION 1: Hero ───────────────────────────────────── */}
      <section
        ref={heroRef}
        className="dot-grid relative flex min-h-screen items-center justify-center overflow-hidden"
      >
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-1 absolute left-[10%] top-[15%] h-[500px] w-[500px] rounded-full bg-indigo-600/10 blur-[120px]" />
          <div className="orb-2 absolute right-[5%] top-[40%] h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-[100px]" />
          <div className="orb-3 absolute bottom-[10%] left-[30%] h-[300px] w-[300px] rounded-full bg-cyan-600/8 blur-[80px]" />
        </div>

        {/* Scan line */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
          <div className="scan-line" />
        </div>

        {/* Hero content (zooms + fades out on scroll) */}
        <motion.div
          style={{ scale: heroScale, opacity: heroOpacity, y: heroY }}
          className="relative z-10 mx-auto max-w-5xl px-4 text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            BIST için Yapay Zeka Destekli Sinyal Analizi
          </motion.div>

          {/* Main title */}
          <AnimatedTitle
            text="BIST Hisselerinde AI Destekli Sinyal Analizi"
            className="text-4xl font-bold leading-tight tracking-tight text-text-primary md:text-6xl lg:text-7xl"
          />

          {/* Gradient accent */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="mx-auto mt-2 h-1 w-48 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500"
          />

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.0 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary md:text-xl"
          >
            Teknik sinyal × Makro rüzgar × Sektör uyumu →{' '}
            <span className="gradient-text font-semibold">AL / TUT / SAT</span> kararı.
            Her sinyal için sade Türkçe AI açıklaması.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.2 }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button size="lg" className="glow-btn relative px-8 py-6 text-base font-semibold" asChild>
              <Link href="/kayit">
                Ücretsiz Başla
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="border-border/60 px-8 py-6 text-base hover:border-primary/40 hover:bg-primary/5" asChild>
              <Link href="/giris">Giriş Yap</Link>
            </Button>
          </motion.div>

          {/* Floating signal cards */}
          <div className="relative mt-20 hidden h-40 md:block">
            {MOCK_SIGNALS.map((sig, i) => (
              <FloatingSignalCard
                key={i}
                signal={sig}
                delay={1.4 + i * 0.15}
                x={i === 0 ? -260 : i === 1 ? 0 : 260}
                rotate={i === 0 ? -3 : i === 1 ? 0 : 3}
              />
            ))}
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex flex-col items-center gap-1 text-text-secondary"
          >
            <span className="text-[10px] uppercase tracking-widest opacity-50">Keşfet</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── SECTION 2: Stats — "İçine giriyoruz" ─────────────── */}
      <section className="relative border-y border-border/40 bg-surface/30 py-16 backdrop-blur-sm">
        <DepthSection>
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {STATS.map((s, i) => (
                <StatCard key={i} value={s.value} label={s.label} />
              ))}
            </div>
          </div>
        </DepthSection>
      </section>

      {/* ── SECTION 3: Features ───────────────────────────────── */}
      <section className="dot-grid relative py-28">
        {/* Section orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-2 absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[100px]" />
          <div className="orb-3 absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-indigo-600/8 blur-[80px]" />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <DepthSection className="text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary opacity-70">
              Özellikler
            </span>
            <h2 className="mt-3 text-3xl font-bold text-text-primary md:text-4xl">
              Profesyonel araçlar,{' '}
              <span className="gradient-text">herkes için</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary">
              Kurumsal yatırımcıların kullandığı analiz katmanları, bireysel yatırımcılar için sade arayüzde.
            </p>
          </DepthSection>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FeatureCard key={i} feature={f} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: How it works ───────────────────────────── */}
      <section className="relative overflow-hidden py-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-1 absolute left-1/4 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/6 blur-[120px]" />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <DepthSection className="text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary opacity-70">
              Nasıl Çalışır
            </span>
            <h2 className="mt-3 text-3xl font-bold text-text-primary md:text-4xl">
              3 katman,{' '}
              <span className="gradient-text">1 karar</span>
            </h2>
          </DepthSection>

          <div className="relative mt-16 flex flex-col items-center gap-8 md:flex-row md:items-stretch md:justify-center">
            {[
              { n: '01', label: 'Makro Analiz', desc: 'VIX, DXY, USD/TRY ve TCMB faiz kararları gerçek zamanlı izlenir. Piyasa rüzgarı hesaplanır.', icon: TrendingUp, color: 'text-cyan-400' },
              { n: '02', label: 'Teknik Sinyal', desc: 'RSI uyumsuzluğu, hacim anomalisi, EMA kesiştirmesi ve S/R kırılımları tespit edilir.', icon: BarChart3, color: 'text-indigo-400' },
              { n: '03', label: 'AI Kararı', desc: 'Tüm katmanlar kompozit bir skora dönüşür. Claude AI sade Türkçe açıklama üretir.', icon: Sparkles, color: 'text-violet-400' },
            ].map((step, i) => (
              <HowItWorksCard key={i} step={step} index={i} isLast={i === 2} />
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: CTA ────────────────────────────────────── */}
      <section className="relative py-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-1 absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[140px]" />
        </div>

        <DepthSection>
          <div className="mx-auto max-w-2xl px-4 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="rounded-2xl border border-primary/20 bg-surface/60 p-12 backdrop-blur-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-3xl font-bold text-text-primary md:text-4xl">
                  Hemen başla,{' '}
                  <span className="gradient-text-animated">ücretsiz</span>
                </h2>
                <p className="mx-auto mt-4 max-w-md text-text-secondary">
                  Kredi kartı gerekmez. 5 dakikada hesap oluştur, sinyalleri taramaya başla.
                </p>
                <Button
                  size="lg"
                  className="glow-btn mt-8 px-10 py-6 text-base font-semibold"
                  asChild
                >
                  <Link href="/kayit">
                    Ücretsiz Hesap Oluştur
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="mt-4 text-xs text-text-secondary opacity-60">
                  Free plan · Kredi kartı yok · İstediğin zaman iptal
                </p>
              </div>
            </motion.div>
          </div>
        </DepthSection>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 text-xs text-text-secondary sm:flex-row">
          <span className="gradient-text font-bold text-sm">BistAI</span>
          <span className="opacity-50">© 2026 BistAI. Tüm haklar saklıdır.</span>
          <span className="opacity-50">Yatırım tavsiyesi değildir.</span>
        </div>
      </footer>
    </div>
  );
}

// ── Feature Card ──────────────────────────────────────────────────

function FeatureCard({ feature, index }: { feature: typeof FEATURES[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-10% 0px' });
  const Icon = feature.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
      className={`card-glow group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${feature.gradient} p-6 backdrop-blur-sm`}
      style={{ boxShadow: `0 0 0 0 ${feature.glow}` }}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-surface/80 transition-transform duration-300 group-hover:scale-110">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-text-primary">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{feature.desc}</p>
    </motion.div>
  );
}

// ── How it works card ─────────────────────────────────────────────

function HowItWorksCard({
  step, index, isLast,
}: {
  step: { n: string; label: string; desc: string; icon: React.ElementType; color: string };
  index: number;
  isLast: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const Icon = step.icon;

  return (
    <div className="flex items-center gap-4 md:flex-col md:gap-0">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.6, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex-1 rounded-2xl border border-border bg-surface/60 p-6 text-center backdrop-blur-sm md:max-w-xs"
      >
        <div className="mb-3 text-xs font-bold tracking-widest opacity-30">{step.n}</div>
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface/80 border border-border/60 ${step.color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="mt-4 font-semibold text-text-primary">{step.label}</h3>
        <p className="mt-2 text-sm text-text-secondary">{step.desc}</p>
      </motion.div>

      {!isLast && (
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={isInView ? { scaleX: 1, opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: index * 0.15 + 0.3 }}
          className="hidden h-px w-12 origin-left bg-gradient-to-r from-border to-primary/40 md:block"
        />
      )}
    </div>
  );
}
