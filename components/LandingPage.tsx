'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import {
  AnimatePresence,
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

const TICKER_ITEMS_STATIC = [
  { s: 'THYAO', p: '—', c: '—', up: true },
  { s: 'AKBNK', p: '—', c: '—', up: true },
  { s: 'SISE',  p: '—', c: '—', up: true },
  { s: 'EREGL', p: '—', c: '—', up: true },
  { s: 'KCHOL', p: '—', c: '—', up: false },
  { s: 'BIMAS', p: '—', c: '—', up: true },
  { s: 'ARCLK', p: '—', c: '—', up: false },
  { s: 'TUPRS', p: '—', c: '—', up: true },
  { s: 'GARAN', p: '—', c: '—', up: true },
  { s: 'TOASO', p: '—', c: '—', up: false },
  { s: 'PGSUS', p: '—', c: '—', up: true },
  { s: 'VESTL', p: '—', c: '—', up: false },
  { s: 'HEKTS', p: '—', c: '—', up: true },
  { s: 'EKGYO', p: '—', c: '—', up: false },
];

// ── Mock live signals ─────────────────────────────────────────────

const MOCK_SIGNALS = [
  { sembol: 'THYAO', type: 'RSI Uyumsuzluğu',  dir: 'AL',  sev: 'Güçlü', macro: '+42', confidence: 78, sector: 'Havacılık', weeklyAligned: true  },
  { sembol: 'EREGL', type: 'MACD Kesişimi',     dir: 'AL',  sev: 'Güçlü', macro: '+38', confidence: 74, sector: 'Metal',     weeklyAligned: true  },
  { sembol: 'PGSUS', type: 'Trend Başlangıcı',  dir: 'AL',  sev: 'Orta',  macro: '+31', confidence: 71, sector: 'Havacılık', weeklyAligned: null  },
  { sembol: 'ASELS', type: 'Altın Çapraz',       dir: 'AL',  sev: 'Güçlü', macro: '+55', confidence: 82, sector: 'Savunma',  weeklyAligned: true  },
  { sembol: 'KCHOL', type: 'S/R Kırılımı',      dir: 'SAT', sev: 'Zayıf', macro: '+18', confidence: 49, sector: 'Holding',  weeklyAligned: false },
  { sembol: 'ARCLK', type: 'RSI Seviyesi',       dir: 'SAT', sev: 'Orta',  macro: '+12', confidence: 58, sector: 'Teknoloji',weeklyAligned: false },
];

// ── Stats ─────────────────────────────────────────────────────────

const STATS = [
  { value: '160+', label: 'BIST Hissesi'         },
  { value: '10',   label: 'Farklı Sinyal Tipi'   },
  { value: '5 dakika', label: 'Güncelleme Sıklığı'   },
  { value: '7/24', label: 'Canlı Analiz'          },
];

// ── Features ──────────────────────────────────────────────────────

const FEATURES = [
  { icon: BarChart3,  title: 'Sinyal Tarama',       desc: '10 farklı teknik sinyal — RSI uyumsuzluğu, MACD kesişimi, Altın Çapraz, hacim anomalisi — 160+ BIST hissesinde tek taramada.',  gradient: 'from-indigo-500/20 to-violet-500/5'  },
  { icon: Brain,      title: 'AI Açıklamalar',      desc: 'Her sinyal için Claude AI ile üretilen sade Türkçe analiz. Ne olduğunu değil, ne anlama geldiğini öğren.',                       gradient: 'from-violet-500/20 to-fuchsia-500/5' },
  { icon: TrendingUp, title: 'Sektör & Makro Radar',desc: 'Sektör momentum skoru + VIX, DXY, USD/TRY, TCMB faizi — tüm bağlam tek panelde. Sinyalin sektör trendi ile uyumlu mu?',         gradient: 'from-cyan-500/20 to-blue-500/5'      },
  { icon: Shield,     title: 'Çok Katmanlı Skor',   desc: 'Confluence skoru, haftalık trend uyumu, win-rate geçmişi — her sinyal için 4+ kalite göstergesi. Güçlü sinyalleri ilk bul.',     gradient: 'from-emerald-500/20 to-teal-500/5'  },
  { icon: Zap,        title: 'Backtesting',          desc: 'Geçmiş sinyal performanslarını gör. Hangi sinyal tipi hangi piyasa koşulunda daha başarılı oldu?',                               gradient: 'from-orange-500/20 to-amber-500/5'  },
  { icon: Sparkles,   title: 'AI Topluluk Botu',    desc: 'Analistlerle fikir paylaş. AI Analist her paylaşımı otomatik yorumlar, bağlam ve teknik değerlendirme sunar.',                  gradient: 'from-pink-500/20 to-rose-500/5'     },
];

// ── Animated Globe — borsa şehirleri + yay bağlantıları ──────────

const G_CX = 210, G_CY = 210, G_R = 190;
// Ortografik projeksiyon merkezi: İstanbul koordinatları → BIST tam göbekte
const VIEW_LAT = 41 * Math.PI / 180;
const VIEW_LON = 29 * Math.PI / 180;

function project(lat: number, lon: number) {
  const φ = lat * Math.PI / 180;
  const λ = lon * Math.PI / 180;
  const Δλ = λ - VIEW_LON;
  const depth =
    Math.sin(VIEW_LAT) * Math.sin(φ) +
    Math.cos(VIEW_LAT) * Math.cos(φ) * Math.cos(Δλ);
  return {
    x: G_CX + G_R * Math.cos(φ) * Math.sin(Δλ),
    y: G_CY - G_R * (Math.cos(VIEW_LAT) * Math.sin(φ) - Math.sin(VIEW_LAT) * Math.cos(φ) * Math.cos(Δλ)),
    depth,
  };
}

// Kuadratik bezier eğrisi üzerinde n+1 nokta örnekle (animasyon keyframe'leri için)
function arcKeyframes(x1: number, y1: number, x2: number, y2: number, n = 18) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  // Kontrol noktasını küre merkezine %35 çek → iç bükey yay
  const cpx = mx - (mx - G_CX) * 0.35;
  const cpy = my - (my - G_CY) * 0.35;
  const kfx: number[] = [], kfy: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t;
    kfx.push(mt * mt * x1 + 2 * mt * t * cpx + t * t * x2);
    kfy.push(mt * mt * y1 + 2 * mt * t * cpy + t * t * y2);
  }
  // Baş ve son noktada opacity = 0, ortada 0.9 (fade in/out)
  return { kfx, kfy, kfo: [0, ...Array(n - 1).fill(0.9), 0] as number[] };
}

// Dünya borsaları (lat/lon gerçek koordinatlar)
const EXCH_RAW = [
  { id: 'BIST',  lat:  41.0,  lon:  28.9, main: true  }, // İstanbul
  { id: 'NYSE',  lat:  40.7,  lon: -74.0, main: false }, // New York
  { id: 'LSE',   lat:  51.5,  lon:  -0.1, main: false }, // Londra
  { id: 'MOEX',  lat:  55.75, lon:  37.6, main: false }, // Moskova
  { id: 'BSE',   lat:  19.1,  lon:  72.8, main: false }, // Mumbai
  { id: 'DFM',   lat:  25.2,  lon:  55.3, main: false }, // Dubai
  { id: 'JSE',   lat: -26.2,  lon:  28.0, main: false }, // Johannesburg
  { id: 'HKEX',  lat:  22.3,  lon: 114.2, main: false }, // Hong Kong
] as const;

const EXCH = EXCH_RAW.map(e => ({ ...e, ...project(e.lat, e.lon) }));
const BIST_PT = EXCH.find(e => e.id === 'BIST')!;

// ── AnimatedGlobe ─────────────────────────────────────────────────

function AnimatedGlobe() {
  // SSR hydration mismatch önlemek için client-only render
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [coreHovered, setCoreHovered] = useState(false);

  const latOffsets = [-152, -114, -76, -38, 0, 38, 76, 114, 152];
  const longAngles  = [0, 30, 60, 90, 120, 150];

  // Hover: 8 yönlü patlama parçacıkları
  const BURST = Array.from({ length: 8 }, (_, i) => {
    const rad = i * 45 * Math.PI / 180;
    return { tx: G_CX + Math.cos(rad) * 88, ty: G_CY + Math.sin(rad) * 88 };
  });

  const visibleOthers = EXCH.filter(e => !e.main && e.depth > 0.05);

  // Mount olmadan placeholder döndür (SSR'da boş alan)
  if (!mounted) {
    return <div className="relative flex h-[420px] w-[420px] items-center justify-center" />;
  }

  return (
    <div className="relative flex h-[420px] w-[420px] items-center justify-center">
      {/* Glow */}
      <div className="absolute inset-[40px] rounded-full bg-indigo-600/15 blur-[70px]" />
      <div className="absolute inset-[80px] rounded-full bg-violet-600/10 blur-[50px]" />

      <svg viewBox="0 0 420 420" className="relative h-full w-full" overflow="visible">
        <defs>
          <clipPath id="gc">
            <circle cx={G_CX} cy={G_CY} r={G_R} />
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
        <circle cx={G_CX} cy={G_CY} r={G_R} fill="url(#gb)" />
        <circle cx={G_CX} cy={G_CY} r={G_R} fill="url(#gs)" />

        {/* Grid lines */}
        <g clipPath="url(#gc)" fill="none">
          {latOffsets.map((dy, i) => {
            const rx = Math.sqrt(Math.max(0, G_R * G_R - dy * dy));
            return (
              <ellipse key={i} cx={G_CX} cy={G_CY + dy} rx={rx} ry={rx * 0.28}
                stroke="rgba(99,102,241,0.14)" strokeWidth="0.6" />
            );
          })}
          {longAngles.map((angle, i) => (
            <motion.ellipse key={i}
              cx={G_CX} cy={G_CY} rx={48} ry={G_R}
              stroke="rgba(99,102,241,0.14)" strokeWidth="0.6"
              animate={{ rotate: [angle, angle + 360] }}
              transition={{ duration: 18 + i * 3, repeat: Infinity, ease: 'linear' }}
              style={{ originX: `${G_CX}px`, originY: `${G_CY}px` }}
            />
          ))}
          <ellipse cx={G_CX} cy={G_CY} rx={G_R} ry={G_R * 0.28}
            stroke="rgba(99,102,241,0.30)" strokeWidth="1" />
        </g>

        {/* Outer rings */}
        <circle cx={G_CX} cy={G_CY} r={G_R}      stroke="rgba(99,102,241,0.35)" strokeWidth="1"  fill="none" />
        <circle cx={G_CX} cy={G_CY} r={G_R + 6}  stroke="rgba(99,102,241,0.12)" strokeWidth="4"  fill="none" />
        <circle cx={G_CX} cy={G_CY} r={G_R + 18} stroke="rgba(99,102,241,0.06)" strokeWidth="8"  fill="none" />

        {/* ── Arc connections: BIST → diğer borsalar ── */}
        <g clipPath="url(#gc)" fill="none">
          {visibleOthers.map((ex, i) => {
            const mx = (BIST_PT.x + ex.x) / 2, my = (BIST_PT.y + ex.y) / 2;
            const cpx = mx - (mx - G_CX) * 0.35;
            const cpy = my - (my - G_CY) * 0.35;
            return (
              <path key={ex.id}
                d={`M ${BIST_PT.x.toFixed(1)} ${BIST_PT.y.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${ex.x.toFixed(1)} ${ex.y.toFixed(1)}`}
                stroke={i % 2 === 0 ? 'rgba(99,102,241,0.28)' : 'rgba(139,92,246,0.22)'}
                strokeWidth="0.9" strokeDasharray="5 4"
              />
            );
          })}
        </g>

        {/* ── Hover: arc parlaması ── */}
        <AnimatePresence>
          {coreHovered && (
            <motion.g key="conn-glow"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }} clipPath="url(#gc)" fill="none"
            >
              {visibleOthers.map((ex) => {
                const mx = (BIST_PT.x + ex.x) / 2, my = (BIST_PT.y + ex.y) / 2;
                const cpx = mx - (mx - G_CX) * 0.35;
                const cpy = my - (my - G_CY) * 0.35;
                return (
                  <path key={ex.id}
                    d={`M ${BIST_PT.x.toFixed(1)} ${BIST_PT.y.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${ex.x.toFixed(1)} ${ex.y.toFixed(1)}`}
                    stroke="rgba(196,181,253,0.65)" strokeWidth="1.5"
                  />
                );
              })}
            </motion.g>
          )}
        </AnimatePresence>

        {/* ── Veri akışı: BIST'ten diğer borsalara akan noktalar ── */}
        {visibleOthers.map((ex, i) => {
          const { kfx, kfy, kfo } = arcKeyframes(BIST_PT.x, BIST_PT.y, ex.x, ex.y);
          return (
            <motion.circle key={ex.id + '_dot'} r={2.2}
              cx={BIST_PT.x} cy={BIST_PT.y}
              fill={i % 2 === 0 ? 'rgba(167,139,250,0.95)' : 'rgba(99,102,241,0.85)'}
              animate={{ cx: kfx, cy: kfy, opacity: kfo }}
              transition={{ duration: 2.8 + i * 0.45, repeat: Infinity, ease: 'linear', delay: i * 0.6 }}
            />
          );
        })}

        {/* ── Borsa şehir marker'ları + etiketler ── */}
        {EXCH.filter(e => e.depth > 0.05).map((ex, i) => {
          const lRight = ex.x > G_CX;
          const lBelow = ex.y > G_CY;
          return (
            <g key={ex.id}>
              {ex.main ? (
                <>
                  {/* BIST: büyük nabız atan marker */}
                  <motion.circle cx={ex.x} cy={ex.y} r={10}
                    fill="rgba(99,102,241,0.15)"
                    animate={{ r: [8, 20, 8], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <circle cx={ex.x} cy={ex.y} r={5.5} fill="rgba(139,92,246,0.9)" />
                  <circle cx={ex.x} cy={ex.y} r={2.5} fill="rgba(225,215,255,0.98)" />
                  <text x={ex.x + 11} y={ex.y - 9}
                    fontSize="12" fontFamily="monospace" fontWeight="bold"
                    fill="rgba(196,181,253,1)" textAnchor="start"
                  >BIST ★</text>
                </>
              ) : (
                <>
                  {/* Diğer borsalar: küçük marker */}
                  <motion.circle cx={ex.x} cy={ex.y} r={5}
                    fill="rgba(99,102,241,0.1)"
                    animate={{ r: [4, 9, 4], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 2.5 + i * 0.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.22 }}
                  />
                  <circle cx={ex.x} cy={ex.y} r={3} fill="rgba(99,102,241,0.8)" />
                  <circle cx={ex.x} cy={ex.y} r={1.3} fill="rgba(196,181,253,0.95)" />
                  <text
                    x={ex.x + (lRight ? 7 : -7)}
                    y={ex.y + (lBelow ? 13 : -5)}
                    fontSize="9.5" fontFamily="monospace"
                    fill="rgba(148,163,184,0.9)"
                    textAnchor={lRight ? 'start' : 'end'}
                  >{ex.id}</text>
                </>
              )}
            </g>
          );
        })}

        {/* ── Pulsing core ── */}
        <motion.circle cx={G_CX} cy={G_CY} fill="rgba(99,102,241,0.06)"
          animate={coreHovered
            ? { r: 52, opacity: 0.18 }
            : { r: [26, 42, 26], opacity: [0.08, 0, 0.08] }}
          transition={coreHovered
            ? { duration: 0.35, ease: 'easeOut' }
            : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.circle cx={G_CX} cy={G_CY} fill="rgba(99,102,241,0.15)"
          animate={coreHovered
            ? { r: 24, opacity: 0.3 }
            : { r: [14, 22, 14], opacity: [0.2, 0.04, 0.2] }}
          transition={coreHovered
            ? { duration: 0.25, ease: 'easeOut' }
            : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} />

        {/* ── Hover: sonar scan halkaları ── */}
        <AnimatePresence>
          {coreHovered && [0, 1, 2].map(i => (
            <motion.circle key={`scan${i}`} cx={G_CX} cy={G_CY}
              fill="none"
              stroke={i === 0 ? 'rgba(196,181,253,0.75)' : i === 1 ? 'rgba(139,92,246,0.5)' : 'rgba(99,102,241,0.35)'}
              strokeWidth={1.8 - i * 0.3}
              initial={{ r: 10, opacity: 0.9 }}
              animate={{ r: 70 + i * 22, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.0, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.15, delay: i * 0.32 }}
            />
          ))}
        </AnimatePresence>

        {/* ── Hover: 8 yönlü patlama ── */}
        <AnimatePresence>
          {coreHovered && BURST.map((b, i) => (
            <motion.circle key={`bp${i}`} r={2.5} fill="rgba(196,181,253,0.95)"
              initial={{ cx: G_CX, cy: G_CY, opacity: 1, scale: 1 }}
              animate={{ cx: b.tx, cy: b.ty, opacity: 0, scale: 0.2 }}
              exit={{}}
              transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.028 }}
            />
          ))}
        </AnimatePresence>

        {/* İç çekirdek */}
        <motion.circle cx={G_CX} cy={G_CY} fill="rgba(167,139,250,0.65)"
          animate={coreHovered
            ? { r: 13, opacity: 1 }
            : { r: [6, 9.5, 6], opacity: [0.65, 1, 0.65] }}
          transition={coreHovered
            ? { duration: 0.2, ease: 'easeOut' }
            : { duration: 2.0, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.circle cx={G_CX} cy={G_CY}
          fill="rgba(225,215,255,0.98)"
          animate={coreHovered ? { r: 6 } : { r: 3.5 }}
          transition={{ duration: 0.2 }} />

        {/* Orbit ring */}
        <motion.circle cx={G_CX} cy={G_CY} r={G_R + 30}
          fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth="1" strokeDasharray="8 6"
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          style={{ originX: `${G_CX}px`, originY: `${G_CY}px` }}
        />
        {/* Orbit dot */}
        <motion.circle r={4} fill="rgba(167,139,250,0.9)"
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          style={{ originX: `${G_CX}px`, originY: `${G_CY}px` }}
          cx={G_CX} cy={G_CY - G_R - 30}
        />

        {/* Hover hedef alanı (şeffaf, en üstte) */}
        <circle cx={G_CX} cy={G_CY} r={50}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onMouseEnter={() => setCoreHovered(true)}
          onMouseLeave={() => setCoreHovered(false)}
        />
      </svg>
    </div>
  );
}

// ── Piyasa Özeti ──────────────────────────────────────────────────

const MARKET_ITEMS_STATIC = [
  { label: 'Altın (oz)', symbol: 'GC=F',     price: '3 284',  change: '+0.8%',  up: true  },
  { label: 'USD/TRY',   symbol: 'USDTRY=X', price: '38.42',  change: '+0.3%',  up: true  },
  { label: 'BIST 100',  symbol: 'XU100.IS',  price: '9 812',  change: '+1.2%',  up: true  },
  { label: 'Ham Petrol', symbol: 'CL=F',     price: '71.40',  change: '-0.5%',  up: false },
];

function MarketStrip() {
  const [items, setItems] = useState(MARKET_ITEMS_STATIC);

  useEffect(() => {
    fetch('/api/commodity')
      .then((r) => r.json())
      .then((data: Array<{ symbol: string; lastPrice: number; change1d: number }>) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setItems(prev => prev.map(item => {
          const match = data.find(d => d.symbol === item.symbol);
          if (!match || !match.lastPrice) return item;
          const up = match.change1d >= 0;
          const price = match.lastPrice >= 1000
            ? match.lastPrice.toLocaleString('tr-TR', { maximumFractionDigits: 0 })
            : match.lastPrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
          const change = `${up ? '+' : ''}${match.change1d.toFixed(1)}%`;
          return { ...item, price, change, up };
        }));
      })
      .catch(() => {/* static fallback */});
  }, []);

  return (
    <div className="mt-10 flex flex-wrap justify-center gap-3">
      {items.map((item) => (
        <div
          key={item.symbol}
          className="flex items-center gap-2 rounded-xl border border-border/50 bg-surface/50 px-4 py-2.5 backdrop-blur-sm"
        >
          <span className="text-[10px] font-medium text-text-secondary">{item.label}</span>
          <span className="text-sm font-bold text-text-primary">{item.price}</span>
          <span className={`text-[10px] font-semibold ${item.up ? 'text-bullish' : 'text-bearish'}`}>
            {item.change}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Depth section ─────────────────────────────────────────────────

function DepthSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-8% 0px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.97, y: 32 }}
      animate={isInView ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.97, y: 32 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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

function SignalRow({ sig, index, isLoggedIn }: { sig: typeof MOCK_SIGNALS[0]; index: number; isLoggedIn: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const isAl = sig.dir === 'AL';
  // locked: giriş yapılmamış VE son 3 sinyal — sadece CSS değişir, component unmount olmaz
  const locked = !isLoggedIn && index >= 3;

  return (
    <Link
      href={locked ? '/giris' : isLoggedIn ? `/hisse/${sig.sembol}` : '/giris'}
      className={locked ? 'pointer-events-none' : ''}
    >
      <motion.div
        ref={ref}
        initial={{ opacity: 0, x: -20 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.45, delay: index * 0.06 }}
        className={[
          'flex items-center gap-3 rounded-xl border border-border/60 bg-surface/40 px-4 py-3 backdrop-blur-sm transition-all',
          locked ? 'blur-[2px] brightness-50 select-none' : 'hover:border-primary/30 hover:bg-surface/60 cursor-pointer',
        ].join(' ')}
      >
        {/* Sembol + sektör */}
        <div className="flex w-[4.5rem] shrink-0 flex-col gap-0.5">
          <span className="text-xs font-bold text-text-primary">{sig.sembol}</span>
          <span className="text-[9px] text-text-secondary opacity-60">{sig.sector}</span>
        </div>
        {/* Sinyal tipi */}
        <span className="flex-1 text-xs text-text-secondary">{sig.type}</span>
        {/* Haftalık uyum badge */}
        {sig.weeklyAligned != null && (
          <span
            title={sig.weeklyAligned ? 'Haftalık trend ile uyumlu' : 'Haftalık trend ile uyumsuz'}
            className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold sm:block ${
              sig.weeklyAligned
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-red-500/40 bg-red-500/15 text-red-300'
            }`}
          >
            {sig.weeklyAligned ? 'W✓' : 'W✗'}
          </span>
        )}
        {/* Makro */}
        <span className="hidden items-center gap-1 text-[10px] text-bullish sm:flex">
          <Activity className="h-2.5 w-2.5" />
          {sig.macro}
        </span>
        {/* Confidence bar */}
        <div className="hidden w-14 shrink-0 sm:block">
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
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${isAl ? 'bg-bullish/15 text-bullish' : 'bg-bearish/15 text-bearish'}`}>
          {sig.dir}
        </span>
      </motion.div>
    </Link>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -60]);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tickerItems, setTickerItems] = useState(TICKER_ITEMS_STATIC);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });
  }, []);

  useEffect(() => {
    fetch('/api/ticker')
      .then(r => r.json())
      .then((data: Array<{ sembol: string; price: number | null; change: number | null }>) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setTickerItems(prev => prev.map(item => {
          const match = data.find(d => d.sembol === item.s);
          if (!match || match.price == null) return item;
          const up = (match.change ?? 0) >= 0;
          const p = match.price >= 100
            ? match.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
            : match.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const c = match.change != null
            ? `${up ? '+' : ''}${match.change.toFixed(2)}%`
            : '—';
          return { ...item, p, c, up };
        }));
      })
      .catch(() => {/* static fallback */});
  }, []);

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
        {/* Gecikme notu — sol kenarda sabit, kaydırmaz */}
        <span className="absolute left-0 top-0 z-10 flex h-full items-center border-r border-border/40 bg-surface/90 px-2.5 text-[10px] text-text-secondary backdrop-blur-sm">
          ~15dk gecikme
        </span>
        <div className="ticker-track flex items-center gap-8 pl-28">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <Link
              key={i}
              href={`/hisse/${item.s}`}
              className="flex items-center gap-2 whitespace-nowrap text-xs transition-opacity hover:opacity-80"
            >
              <span className="font-semibold text-text-primary">{item.s}</span>
              <span className="font-medium text-text-primary">{item.p}</span>
              {item.c !== '—' && (
                <span className={`flex items-center gap-0.5 font-semibold ${item.up ? 'text-bullish' : 'text-bearish'}`}>
                  {item.up
                    ? <TrendingUp className="h-3 w-3" />
                    : <TrendingDown className="h-3 w-3" />}
                  {item.c}
                </span>
              )}
              <span className="text-border/60">|</span>
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
                {isLoggedIn ? (
                  <>
                    <Button size="lg" className="glow-btn px-7 py-6 text-sm font-semibold" asChild>
                      <Link href="/tarama">
                        Hisseleri Tara
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="border-border/60 px-7 py-6 text-sm hover:border-primary/40 hover:bg-primary/5" asChild>
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="lg" className="glow-btn px-7 py-6 text-sm font-semibold" asChild>
                      <Link href="/kayit">
                        Ücretsiz Başla
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="border-border/60 px-7 py-6 text-sm hover:border-primary/40 hover:bg-primary/5" asChild>
                      <Link href="/giris">Giriş Yap</Link>
                    </Button>
                  </>
                )}
              </motion.div>

              {/* Mini stats */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
                className="mt-10 flex flex-wrap items-center justify-center gap-6 lg:justify-start"
              >
                {[
                  { icon: Globe2,   text: '160+ hisse tarama' },
                  { icon: Activity, text: '10 sinyal tipi' },
                  { icon: Users,    text: 'Haftalık trend uyumu' },
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
            <MarketStrip />
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
              {isLoggedIn
                ? 'Şu an aktif olan sinyaller. Detay için tıkla.'
                : 'Şu an aktif olan sinyallerin bir önizlemesi. Tam analiz için hesap oluştur.'}
            </p>
          </DepthSection>

          <div className="mx-auto max-w-2xl space-y-2">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-secondary opacity-60">
              <span className="w-[4.5rem] shrink-0">Hisse</span>
              <span className="flex-1">Sinyal</span>
              <span className="hidden sm:block">Haftalık</span>
              <span className="hidden sm:block w-20">Makro</span>
              <span className="hidden w-14 sm:block">Güven</span>
              <span>Karar</span>
            </div>

            {/* Tüm sinyaller her zaman aynı component türüyle render edilir */}
            {MOCK_SIGNALS.map((sig, i) => (
              <SignalRow key={i} sig={sig} index={i} isLoggedIn={isLoggedIn} />
            ))}

            {/* Login olmayanlar için overlay */}
            {!isLoggedIn && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-primary/25 bg-surface/70 px-6 py-5 text-center backdrop-blur-sm"
              >
                <p className="text-xs font-semibold text-text-primary">+{MOCK_SIGNALS.length - 3} sinyal ve çok daha fazlası</p>
                <p className="text-[11px] text-text-secondary">160+ hissedeki tüm sinyalleri görmek için ücretsiz hesap oluştur.</p>
                <Button size="sm" className="mt-1 text-xs" asChild>
                  <Link href="/kayit">Ücretsiz Başla <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
              </motion.div>
            )}

            {isLoggedIn && (
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="pt-4 text-center"
              >
                <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10" asChild>
                  <Link href="/tarama">
                    Tüm Hisseleri Tara
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </motion.div>
            )}
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
              {isLoggedIn ? (
                <Button size="lg" className="glow-btn mt-7 px-9 py-6 text-sm font-semibold" asChild>
                  <Link href="/tarama">
                    Hisseleri Tara
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" className="glow-btn mt-7 px-9 py-6 text-sm font-semibold" asChild>
                    <Link href="/kayit">
                      Ücretsiz Hesap Oluştur
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <p className="mt-3 text-xs text-text-secondary opacity-50">
                    Free plan · Kredi kartı yok · İstediğin zaman iptal
                  </p>
                </>
              )}
            </motion.div>
          </div>
        </DepthSection>
      </section>

    </div>
  );
}
