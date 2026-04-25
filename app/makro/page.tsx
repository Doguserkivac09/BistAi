'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  AlertTriangle, BarChart3, Globe, Building2,
  Zap, Activity, X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// ── Türler ──────────────────────────────────────────────────────────

interface MacroComponent {
  name: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  signal: 'positive' | 'neutral' | 'negative';
  detail: string;
}

interface MacroResponse {
  score: {
    score: number;
    wind: string;
    color: string;
    label: string;
    components: MacroComponent[];
    calculatedAt: string;
  };
  indicators: {
    vix:    { price: number; change: number; changePercent: number } | null;
    dxy:    { price: number; change: number; changePercent: number } | null;
    us10y:  { price: number; change: number; changePercent: number } | null;
    usdtry: { price: number; change: number; changePercent: number } | null;
    eem:    { price: number; change: number; changePercent: number } | null;
    brent:  { price: number; change: number; changePercent: number } | null;
    gold:   { price: number; change: number; changePercent: number } | null;
    silver: { price: number; change: number; changePercent: number } | null;
    copper: { price: number; change: number; changePercent: number } | null;
    bist100:{ price: number; change: number; changePercent: number } | null;
  };
  turkey: {
    policyRate: { value: number; [key: string]: unknown } | number | null;
    cds5y:      { value: number; [key: string]: unknown } | number | null;
    inflation:  { value: number; [key: string]: unknown } | number | null;
  };
  fred: {
    fedFundsRate: { value: number; date: string; change: number } | null;
    gdpGrowth:    { value: number; date: string } | null;
    unemployment: { value: number; date: string } | null;
  };
  usEconomy: { score: number; label: string; color: string } | null;
  fetchedAt: string;
}

interface RiskComponent {
  name: string;
  weight: number;
  score: number;
  weightedScore: number;
  detail: string;
}

interface RiskResponse {
  score: number;
  level: string;
  color: string;
  label: string;
  emoji: string;
  components: RiskComponent[];
  recommendation: string;
  calculatedAt: string;
}

interface SectorItem {
  sectorId: string;
  sectorName: string;
  shortName: string;
  compositeScore: number;
  priceMomentum: number;
  perf20d: number;
  signal: string;
  color: string;
  reasoning: string;
  symbolCount: number;
}

interface SectorsResponse {
  sectors: SectorItem[];
  bestSector: SectorItem | null;
  worstSector: SectorItem | null;
}

interface AlertItem {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  emoji: string;
}

interface AlertsResponse {
  alerts: AlertItem[];
  count: number;
}

interface OHLCVRow { close: number; volume?: number }

// ── Yardımcılar ─────────────────────────────────────────────────────

function macroScoreColor(score: number): string {
  if (score >= 30)  return '#22c55e';
  if (score >= 0)   return '#84cc16';
  if (score >= -30) return '#eab308';
  return '#ef4444';
}

function riskColor(score: number): string {
  if (score <= 25) return '#22c55e';
  if (score <= 50) return '#eab308';
  if (score <= 75) return '#f97316';
  return '#ef4444';
}

function riskTextClass(score: number): string {
  if (score <= 25) return 'text-green-400';
  if (score <= 50) return 'text-yellow-400';
  if (score <= 75) return 'text-orange-400';
  return 'text-red-400';
}

function translateWind(wind: string): string {
  const map: Record<string, string> = {
    'neutral':        'NÖTR',
    'nötr':           'NÖTR',
    'bullish':        'YÜKSELİŞ',
    'yükseliş':       'YÜKSELİŞ',
    'bearish':        'DÜŞÜŞ',
    'düşüş':          'DÜŞÜŞ',
    'strong bullish': 'GÜÇLÜ YÜKSELİŞ',
    'güçlü yükseliş': 'GÜÇLÜ YÜKSELİŞ',
    'strong bearish': 'GÜÇLÜ DÜŞÜŞ',
    'güçlü düşüş':    'GÜÇLÜ DÜŞÜŞ',
  };
  return map[wind.toLowerCase()] ?? wind.toUpperCase();
}

function heroGradient(score: number): string {
  if (score >= 30)  return 'radial-gradient(ellipse at top left, rgba(34,197,94,0.12) 0%, transparent 60%)';
  if (score >= -10) return 'radial-gradient(ellipse at top left, rgba(234,179,8,0.10) 0%, transparent 60%)';
  return 'radial-gradient(ellipse at top left, rgba(239,68,68,0.12) 0%, transparent 60%)';
}

function numVal(v: { value: number; [k: string]: unknown } | number | null): number | null {
  if (v == null) return null;
  return typeof v === 'object' ? v.value : v;
}

// ── Veri kaynağı tazeliği (health badge) ─────────────────────────────
//
// Her gösterge `source` alanıyla geliyor. String'i normalize edip
// 3 kategoriye ayırıyoruz:
//   • live     → 🟢 canlı API (TCMB EVDS, FRED, Yahoo)
//   • proxy    → 🟡 türetilmiş (USD/TRY volatilitesinden CDS proxy)
//   • fallback → 🔴 hardcoded sabit (API key/erişim yok)
type Freshness = { status: 'live' | 'proxy' | 'fallback'; label: string; cls: string };

function srcOf(v: unknown): string | null {
  if (v && typeof v === 'object' && 'source' in v) {
    const s = (v as { source?: unknown }).source;
    return typeof s === 'string' ? s : null;
  }
  return null;
}

function freshnessFromSource(source: string | null | undefined): Freshness | null {
  if (!source) return null;
  const s = source.toLowerCase();
  if (s.includes('fallback') || s.includes('hardcoded')) {
    return { status: 'fallback', label: 'Hardcoded sabit (API erişimi yok)',         cls: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]' };
  }
  if (s.includes('proxy')) {
    return { status: 'proxy',    label: 'Türetilmiş (proxy hesaplama)',              cls: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]' };
  }
  return   { status: 'live',     label: `Canlı kaynak: ${source}`,                   cls: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' };
}

function FreshnessDot({ source }: { source: string | null | undefined }) {
  const f = freshnessFromSource(source);
  if (!f) return null;
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full align-middle ml-1 ${f.cls}`}
      title={f.label}
      aria-label={f.label}
    />
  );
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `%${v.toFixed(1)}`;
}

function severityStyle(s: 'info' | 'warning' | 'critical'): string {
  switch (s) {
    case 'critical': return 'border-red-500/40 bg-red-500/10';
    case 'warning':  return 'border-orange-500/40 bg-orange-500/10';
    default:         return 'border-blue-500/40 bg-blue-500/10';
  }
}

function indicatorSignal(label: string, data: { price: number; changePercent: number } | null): { text: string; cls: string } {
  if (!data) return { text: '—', cls: 'text-white/30' };
  const p = data.price;
  switch (label) {
    case 'VIX':
      if (p > 35) return { text: 'PANIK',       cls: 'text-red-400' };
      if (p > 25) return { text: 'Yüksek Vol.', cls: 'text-orange-400' };
      if (p > 15) return { text: 'Normal',       cls: 'text-yellow-400' };
      return           { text: 'Sakin',          cls: 'text-green-400' };
    case 'DXY':
      if (p > 106) return { text: 'Aşırı Güçlü', cls: 'text-red-400' };
      if (p > 102) return { text: 'Güçlü Dolar',  cls: 'text-orange-400' };
      if (p > 97)  return { text: 'Nötr',          cls: 'text-yellow-400' };
      return            { text: 'Zayıf Dolar',    cls: 'text-green-400' };
    case 'US 10Y':
      if (p > 5)   return { text: 'Kriz Seviye',  cls: 'text-red-400' };
      if (p > 4.3) return { text: 'Yüksek Faiz',  cls: 'text-orange-400' };
      if (p > 3.5) return { text: 'Yükseltilmiş', cls: 'text-yellow-400' };
      return            { text: 'Normal',          cls: 'text-green-400' };
    case 'Brent':
      if (p > 95) return { text: 'Çok Pahalı', cls: 'text-red-400' };
      if (p > 80) return { text: 'Pahalı',     cls: 'text-orange-400' };
      if (p > 65) return { text: 'Normal',     cls: 'text-yellow-400' };
      return           { text: 'Ucuz',         cls: 'text-green-400' };
    case 'Altın':
      if (p > 3500) return { text: 'Rekor Yüksek', cls: 'text-red-400' };
      if (p > 2800) return { text: 'Güçlü',        cls: 'text-orange-400' };
      if (p > 2000) return { text: 'Normal',        cls: 'text-yellow-400' };
      return             { text: 'Düşük',           cls: 'text-green-400' };
    case 'Gümüş':
      if (p > 40)  return { text: 'Çok Güçlü',  cls: 'text-orange-400' };
      if (p > 28)  return { text: 'Güçlü',       cls: 'text-yellow-400' };
      if (p > 20)  return { text: 'Normal',       cls: 'text-white/50' };
      return            { text: 'Zayıf',          cls: 'text-green-400' };
    case 'Bakır': {
      // Bakır = ekonomik aktivite barometresi; yüksekse büyüme beklentisi pozitif
      if (p > 5)   return { text: 'Güçlü Büyüme', cls: 'text-green-400' };
      if (p > 4)   return { text: 'Normal',        cls: 'text-yellow-400' };
      if (p > 3)   return { text: 'Yavaşlama',     cls: 'text-orange-400' };
      return            { text: 'Resesyon Riski',  cls: 'text-red-400' };
    }
    case 'BIST100': {
      const c = data.changePercent;
      if (c > 2)    return { text: 'Güçlü Artış', cls: 'text-green-400' };
      if (c > 0.5)  return { text: 'Artış',       cls: 'text-green-400' };
      if (c > -0.5) return { text: 'Yatay',       cls: 'text-yellow-400' };
      if (c > -2)   return { text: 'Düşüş',       cls: 'text-red-400' };
      return             { text: 'Sert Düşüş',    cls: 'text-red-400' };
    }
    default: {
      const c = data.changePercent;
      if (c > 1.5)  return { text: 'Hızlı Artış',  cls: 'text-red-400' };
      if (c > 0.3)  return { text: 'Artış',         cls: 'text-orange-400' };
      if (c > -0.3) return { text: 'Değişmez',      cls: 'text-yellow-400' };
      if (c > -1.5) return { text: 'Düşüş',         cls: 'text-green-400' };
      return             { text: 'Hızlı Düşüş',     cls: 'text-green-400' };
    }
  }
}

// ── Mini Sparkline ───────────────────────────────────────────────────

function MiniSparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 48, H = 18;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const col = up ? '#22c55e' : '#ef4444';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-12 h-4.5" style={{ height: 18 }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Ticker Bar ──────────────────────────────────────────────────────

function TickerBar({ indicators }: { indicators: MacroResponse['indicators'] }) {
  const items = [
    { label: 'VIX',     data: indicators.vix,    suffix: '' },
    { label: 'DXY',     data: indicators.dxy,    suffix: '' },
    { label: 'US 10Y',  data: indicators.us10y,  suffix: '%' },
    { label: 'USD/TRY', data: indicators.usdtry, suffix: '' },
    { label: 'EEM',     data: indicators.eem,    suffix: '' },
    { label: 'Brent',   data: indicators.brent,  suffix: '$' },
    { label: 'Altın',   data: indicators.gold,   suffix: '$' },
    { label: 'Gümüş',   data: indicators.silver, suffix: '$' },
    { label: 'Bakır',   data: indicators.copper, suffix: '$' },
    { label: 'BIST100', data: indicators.bist100,suffix: '' },
  ];
  const all = [...items, ...items, ...items];

  return (
    <>
      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .ticker-track { animation: tickerScroll 28s linear infinite; }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="overflow-hidden border-b border-white/5 bg-[#06060f]/80 py-2.5">
        <div className="ticker-track inline-flex whitespace-nowrap">
          {all.map((item, i) => {
            const up = (item.data?.changePercent ?? 0) > 0;
            const dn = (item.data?.changePercent ?? 0) < 0;
            return (
              <span key={i} className="inline-flex items-center gap-2 px-5 text-sm font-mono">
                <span className="text-white/35 tracking-widest uppercase text-xs">{item.label}</span>
                <span className="text-white font-semibold">
                  {item.data ? item.data.price.toFixed(2) + item.suffix : '—'}
                </span>
                {item.data && (
                  <span className={up ? 'text-green-400' : dn ? 'text-red-400' : 'text-white/30'}>
                    {up ? '▲' : dn ? '▼' : '—'}{Math.abs(item.data.changePercent).toFixed(2)}%
                  </span>
                )}
                <span className="text-white/10 pl-3">┊</span>
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Makro Gauge ──────────────────────────────────────────────────────

function MacroGauge({ score }: { score: number }) {
  const r = 88, cx = 120, cy = 108;
  const angle   = ((score + 100) / 200) * 180;
  const arcLen  = Math.PI * r;
  const filled  = (angle / 180) * arcLen;
  const rad     = (angle * Math.PI) / 180;
  const nx      = cx + r * 0.74 * Math.cos(Math.PI - rad);
  const ny      = cy - r * 0.74 * Math.sin(Math.PI - rad);
  const col     = macroScoreColor(score);

  return (
    <svg viewBox="0 0 240 128" className="w-52">
      <defs>
        <linearGradient id="mgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ef4444" />
          <stop offset="42%"  stopColor="#eab308" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
        <filter id="mgGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="needleGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#1a1a2e" strokeWidth="13" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="url(#mgGrad)" strokeWidth="13" strokeOpacity="0.2" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="url(#mgGrad)" strokeWidth="13"
        strokeDasharray={`${filled} ${arcLen + 20}`}
        strokeLinecap="round" filter="url(#mgGlow)" />
      {[-100, -50, 0, 50, 100].map((v) => {
        const a = ((v + 100) / 200) * 180;
        const ra = (a * Math.PI) / 180;
        const x1 = cx + (r - 6)  * Math.cos(Math.PI - ra);
        const y1 = cy - (r - 6)  * Math.sin(Math.PI - ra);
        const x2 = cx + (r + 4)  * Math.cos(Math.PI - ra);
        const y2 = cy - (r + 4)  * Math.sin(Math.PI - ra);
        return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />;
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="white" strokeWidth="2" strokeLinecap="round" filter="url(#needleGlow)" />
      <circle cx={cx} cy={cy} r="5.5" fill={col} filter="url(#needleGlow)" />
      <circle cx={cx} cy={cy} r="2.5" fill="white" />
      <text x={cx} y={cy - 20} textAnchor="middle"
        fill={col} fontSize="32" fontWeight="800" fontFamily="monospace" filter="url(#mgGlow)">
        {score > 0 ? '+' : ''}{score}
      </text>
    </svg>
  );
}

// ── Risk Halkası ─────────────────────────────────────────────────────

function RiskCircle({ score, label, emoji }: { score: number; label: string; emoji: string }) {
  const r = 50, cx = 62, cy = 62;
  const circ   = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const col    = riskColor(score);

  return (
    <div className="relative w-32 h-32">
      <svg viewBox="0 0 124 124" className="w-full h-full -rotate-90">
        <defs>
          <filter id="rGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a2e" strokeWidth="10" />
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={col} strokeWidth="3" strokeOpacity="0.2"
          strokeDasharray={`${circ} ${circ}`} />
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={col} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round" filter="url(#rGlow)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-white leading-none">{score}</span>
        <span className="text-lg leading-none mt-1">{emoji}</span>
        <span className={`text-xs font-semibold mt-1 uppercase tracking-widest ${riskTextClass(score)}`}>{label}</span>
      </div>
    </div>
  );
}

// ── Hero Command Center ─────────────────────────────────────────────

function HeroSection({ macro, risk }: { macro: MacroResponse; risk: RiskResponse | null }) {
  const score = macro.score.score;
  const col   = macroScoreColor(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative rounded-2xl border border-white/8 overflow-hidden mb-6"
      style={{ background: '#0a0a18' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: heroGradient(score) }} />
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/5">
        {/* Sol — Makro Gauge */}
        <div className="flex flex-col items-center justify-center py-8 px-6 gap-4">
          <p className="text-sm text-white/40 uppercase tracking-[0.18em] font-mono">Makro Rüzgar Skoru</p>
          <MacroGauge score={score} />
          <div className="w-full space-y-1.5 mt-1">
            {macro.score.components.map((c) => {
              const barPct = Math.min(Math.abs(c.rawScore), 100);
              const barCol = c.rawScore >= 0 ? '#22c55e' : '#ef4444';
              return (
                <div key={c.name} className="flex items-center gap-2">
                  <span className={`text-sm w-3 ${c.signal === 'positive' ? 'text-green-400' : c.signal === 'negative' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {c.signal === 'positive' ? '↑' : c.signal === 'negative' ? '↓' : '→'}
                  </span>
                  <span className="text-sm text-white/45 w-24 truncate">{c.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <motion.div className="h-full rounded-full" style={{ backgroundColor: barCol }}
                      initial={{ width: 0 }} animate={{ width: `${barPct}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }} />
                  </div>
                  <span className={`text-sm font-mono w-8 text-right ${c.rawScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {c.rawScore > 0 ? '+' : ''}{c.rawScore.toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Orta — Durum */}
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <div className="flex items-center gap-2 text-sm text-white/35 uppercase tracking-[0.2em] font-mono">
            <Activity className="h-3.5 w-3.5" /> Piyasa Durumu
          </div>
          <motion.div className="text-6xl font-black tracking-tight leading-none" style={{ color: col }}
            initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.15 }}>
            {translateWind(macro.score.wind)}
          </motion.div>
          <div className="text-base text-white/50 font-medium">{macro.score.label}</div>
          <div className="mt-2 px-4 py-2.5 rounded-lg bg-white/4 border border-white/6 text-sm text-white/55 max-w-[240px]">
            {score >= 30
              ? 'Makro koşullar güçlü. Yükseliş için zemin uygun.'
              : score >= 0
              ? 'Makro koşullar nötr. Seçici pozisyon önerilir.'
              : score >= -30
              ? 'Makro baskı var. Savunmacı duruş mantıklı.'
              : 'Yüksek risk ortamı. Pozisyon küçültme önerilir.'}
          </div>
          <div className="text-sm text-white/25 font-mono mt-1">
            {new Date(macro.score.calculatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Sağ — Risk + Faktör Özeti */}
        <div className="flex flex-col py-8 px-6 gap-5">
          {risk && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-white/40 uppercase tracking-[0.18em] font-mono">Piyasa Risk Skoru</p>
              <RiskCircle score={risk.score} label={risk.label} emoji={risk.emoji} />
              <p className="text-xs text-white/40 text-center leading-relaxed max-w-[200px]">
                {risk.recommendation}
              </p>
            </div>
          )}

          {/* Faktör Ağırlıkları — genişletilmiş */}
          <div className="flex-1 border-t border-white/5 pt-4">
            <p className="text-xs text-white/35 uppercase tracking-[0.18em] font-mono mb-3">Faktör Katkıları</p>
            <div className="space-y-2.5">
              {macro.score.components.map((c) => {
                const barPct = Math.min(Math.abs(c.rawScore), 100);
                const isPos  = c.signal === 'positive';
                const isNeg  = c.signal === 'negative';
                const barCol = isPos ? '#22c55e' : isNeg ? '#ef4444' : '#eab308';
                const textCl = isPos ? 'text-green-400' : isNeg ? 'text-red-400' : 'text-yellow-400';
                return (
                  <div key={c.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${textCl}`}>
                          {isPos ? '↑' : isNeg ? '↓' : '→'}
                        </span>
                        <span className="text-xs text-white/60 font-medium">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/30 font-mono">%{Math.round(c.weight * 100)}</span>
                        <span className={`text-xs font-bold font-mono w-8 text-right ${textCl}`}>
                          {c.rawScore > 0 ? '+' : ''}{c.rawScore.toFixed(0)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-white/6 overflow-hidden">
                      <motion.div className="h-full rounded-full"
                        style={{ backgroundColor: barCol }}
                        initial={{ width: 0 }}
                        animate={{ width: `${barPct}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }} />
                    </div>
                    <p className="text-xs text-white/35 mt-0.5 leading-snug">{c.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Gösterge Kartı ──────────────────────────────────────────────────

function IndicatorCard({
  label, data, suffix, delay, sparkline,
}: {
  label: string;
  data: { price: number; change: number; changePercent: number } | null;
  suffix: string;
  delay: number;
  sparkline?: number[];
}) {
  const sig = indicatorSignal(label, data);
  const up  = (data?.changePercent ?? 0) > 0;
  const dn  = (data?.changePercent ?? 0) < 0;
  const borderColor = up ? 'rgba(34,197,94,0.25)' : dn ? 'rgba(239,68,68,0.20)' : 'rgba(255,255,255,0.06)';
  const bgGlow      = up ? 'rgba(34,197,94,0.04)'  : dn ? 'rgba(239,68,68,0.04)'  : 'transparent';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="rounded-xl p-4 cursor-default"
      style={{ background: `linear-gradient(135deg, ${bgGlow}, #0a0a18)`, border: `1px solid ${borderColor}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/35 font-mono uppercase tracking-widest">{label}</span>
        <span className={`text-sm font-semibold ${sig.cls}`}>{sig.text}</span>
      </div>
      <p className="text-3xl font-bold text-white font-mono leading-none">
        {data ? `${data.price.toFixed(2)}${suffix}` : '—'}
      </p>
      <div className="flex items-center justify-between gap-1 mt-2.5">
        <div className="flex items-center gap-1">
          {data ? (
            up ? <TrendingUp className="h-3.5 w-3.5 text-green-400" /> :
            dn ? <TrendingDown className="h-3.5 w-3.5 text-red-400" /> :
            <Minus className="h-3.5 w-3.5 text-white/30" />
          ) : null}
          <span className={`text-sm font-mono ${up ? 'text-green-400' : dn ? 'text-red-400' : 'text-white/30'}`}>
            {data ? `${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%` : '—'}
          </span>
        </div>
        {sparkline && sparkline.length >= 2 && (
          <MiniSparkline values={sparkline} up={up} />
        )}
      </div>
    </motion.div>
  );
}

// ── Ülke Metrik Paneli ───────────────────────────────────────────────

function MetricRow({
  label, value, context, contextCls,
}: {
  label: string; value: string; context?: string; contextCls?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-base text-white/55">{label}</span>
      <div className="flex items-center gap-2">
        {context && (
          <span className={`text-sm font-semibold px-2 py-0.5 rounded-md bg-white/5 ${contextCls ?? 'text-white/40'}`}>
            {context}
          </span>
        )}
        <span className="text-base font-semibold text-white font-mono">{value}</span>
      </div>
    </div>
  );
}

// ── Sektör Isı Haritası ──────────────────────────────────────────────

function SectorHeatmap({
  sectors,
  onSectorClick,
}: {
  sectors: SectorItem[];
  onSectorClick: (sectorId: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const sorted = [...sectors].sort((a, b) => b.compositeScore - a.compositeScore);

  function cellStyle(score: number): React.CSSProperties {
    let bg: string, border: string;
    if (score >= 40)       { bg = 'rgba(34,197,94,0.22)';  border = 'rgba(34,197,94,0.45)';  }
    else if (score >= 20)  { bg = 'rgba(34,197,94,0.13)';  border = 'rgba(34,197,94,0.30)';  }
    else if (score >= 5)   { bg = 'rgba(132,204,22,0.10)'; border = 'rgba(132,204,22,0.25)'; }
    else if (score >= -5)  { bg = 'rgba(234,179,8,0.10)';  border = 'rgba(234,179,8,0.25)';  }
    else if (score >= -20) { bg = 'rgba(249,115,22,0.13)'; border = 'rgba(249,115,22,0.30)'; }
    else if (score >= -40) { bg = 'rgba(239,68,68,0.15)';  border = 'rgba(239,68,68,0.35)';  }
    else                   { bg = 'rgba(239,68,68,0.22)';  border = 'rgba(239,68,68,0.45)';  }
    return { background: bg, border: `1px solid ${border}` };
  }

  function scoreCol(score: number): string {
    if (score >= 20)  return '#22c55e';
    if (score >= 0)   return '#84cc16';
    if (score >= -20) return '#eab308';
    return '#ef4444';
  }

  function signalLabel(signal: string): string {
    switch (signal) {
      case 'strong_buy':  return 'Güçlü AL';
      case 'buy':         return 'AL';
      case 'neutral':     return 'Nötr';
      case 'sell':        return 'SAT';
      default:            return 'Güçlü SAT';
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {sorted.map((s, i) => {
        const isHov = hovered === s.sectorId;
        return (
          <motion.div
            key={s.sectorId}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
            whileHover={{ scale: 1.03, transition: { duration: 0.12 } }}
            onMouseEnter={() => setHovered(s.sectorId)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSectorClick(s.sectorId)}
            className="rounded-xl p-4 cursor-pointer relative overflow-hidden"
            style={cellStyle(s.compositeScore)}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-base font-semibold text-white leading-tight">{s.shortName}</span>
              <span className="text-base font-black font-mono leading-none" style={{ color: scoreCol(s.compositeScore) }}>
                {s.compositeScore > 0 ? '+' : ''}{s.compositeScore.toFixed(0)}
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/8 overflow-hidden mb-2.5">
              <motion.div className="h-full rounded-full" style={{ backgroundColor: scoreCol(s.compositeScore) }}
                initial={{ width: 0 }} animate={{ width: `${Math.min(Math.abs(s.compositeScore), 100)}%` }}
                transition={{ duration: 0.7, delay: i * 0.04 + 0.2 }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {s.perf20d > 0 ? <TrendingUp className="h-3 w-3 text-green-400" /> :
                 s.perf20d < 0 ? <TrendingDown className="h-3 w-3 text-red-400" /> :
                 <Minus className="h-3 w-3 text-white/30" />}
                <span className={`text-sm font-mono ${s.perf20d > 0 ? 'text-green-400' : s.perf20d < 0 ? 'text-red-400' : 'text-white/30'}`}>
                  {s.perf20d > 0 ? '+' : ''}{s.perf20d.toFixed(1)}%
                </span>
              </div>
              <span className={`text-sm font-semibold ${
                s.signal.includes('buy') ? 'text-green-400' :
                s.signal.includes('sell') ? 'text-red-400' : 'text-yellow-400'
              }`}>
                {signalLabel(s.signal)}
              </span>
            </div>

            {/* Hover — Taramaya Git ipucu */}
            <AnimatePresence>
              {isHov && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 rounded-xl p-4 flex flex-col justify-between"
                  style={{ background: 'rgba(10,10,24,0.92)', backdropFilter: 'blur(8px)' }}
                >
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">{s.sectorName}</p>
                    <p className="text-sm text-white/55 leading-relaxed line-clamp-3">{s.reasoning}</p>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-white/35">{s.symbolCount} hisse</span>
                    <span className="text-primary text-xs font-semibold">Sinyalleri gör →</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Tarihsel Makro Skor Grafiği ─────────────────────────────────────

interface HistoryRow {
  snapshot_date: string;
  macro_score: number;
  wind: string;
}

function MacroHistoryChart({ rows }: { rows: HistoryRow[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  if (rows.length < 3) {
    return (
      <div className="flex items-center justify-center h-28 text-white/30 text-sm font-mono">
        Veri birikmekte... ({rows.length} gün)
      </div>
    );
  }

  const W = 600, H = 130, PAD = { t: 12, b: 28, l: 44, r: 16 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const scores = rows.map(r => r.macro_score);
  const minS = Math.min(-100, ...scores);
  const maxS = Math.max(100, ...scores);
  const range = maxS - minS || 1;

  const toX = (i: number) => PAD.l + (i / (rows.length - 1)) * chartW;
  const toY = (s: number) => PAD.t + ((maxS - s) / range) * chartH;
  const zeroY = toY(0);

  const points  = rows.map((r, i) => `${toX(i).toFixed(1)},${toY(r.macro_score).toFixed(1)}`).join(' ');
  const fillPts = `${toX(0)},${zeroY} ` + points + ` ${toX(rows.length - 1)},${zeroY}`;

  const lastScore = scores[scores.length - 1] ?? 0;
  const scoreCol = (s: number) => s >= 30 ? '#22c55e' : s >= 0 ? '#84cc16' : s >= -30 ? '#eab308' : '#ef4444';
  const lineCol = scoreCol(lastScore);
  const fillCol = lastScore >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';

  const labelIdxs = [0, Math.floor(rows.length / 3), Math.floor(rows.length * 2 / 3), rows.length - 1];

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const relX = svgX - PAD.l;
    const frac = Math.max(0, Math.min(1, relX / chartW));
    const i = Math.round(frac * (rows.length - 1));
    setHover({ i, x: toX(i), y: toY(rows[i]!.macro_score) });
  }

  const hRow = hover !== null ? rows[hover.i] : null;
  const hScore = hRow?.macro_score ?? 0;
  const hCol = scoreCol(hScore);

  // "Şu an" label — son nokta
  const nowX = toX(rows.length - 1);
  const nowY = toY(lastScore);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-crosshair"
      preserveAspectRatio="none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* Arka plan bölgeler */}
      <rect x={PAD.l} y={PAD.t} width={chartW} height={Math.max(0, toY(30) - PAD.t)} fill="rgba(34,197,94,0.04)" />
      <rect x={PAD.l} y={toY(-30)} width={chartW} height={Math.max(0, chartH - (toY(-30) - PAD.t))} fill="rgba(239,68,68,0.04)" />
      {/* Sıfır çizgisi */}
      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />
      {/* Alan dolgusu */}
      <polygon points={fillPts} fill={fillCol} />
      {/* Ana çizgi */}
      <polyline points={points} fill="none" stroke={lineCol} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Y ekseni etiketleri */}
      {[100, 50, 0, -50, -100].map(v => (
        <text key={v} x={PAD.l - 5} y={toY(v) + 4}
          textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.25)" fontFamily="monospace">
          {v > 0 ? `+${v}` : v}
        </text>
      ))}
      {/* X ekseni etiketleri */}
      {labelIdxs.map(i => (
        <text key={i} x={toX(i)} y={H - 4}
          textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.25)" fontFamily="monospace">
          {rows[i]?.snapshot_date?.slice(5) ?? ''}
        </text>
      ))}
      {/* "Şu an" işaretçisi */}
      {/* Son nokta — mevcut konum */}
      <line x1={nowX} y1={PAD.t} x2={nowX} y2={H - PAD.b} stroke={lineCol} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.4" />
      <circle cx={nowX} cy={nowY} r="4.5" fill={lineCol} />
      <circle cx={nowX} cy={nowY} r="2" fill="white" />

      {/* Hover çizgisi + tooltip */}
      {hover && hRow && (
        <>
          <line x1={hover.x} y1={PAD.t} x2={hover.x} y2={H - PAD.b}
            stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={hover.x} cy={hover.y} r="4" fill={hCol} />
          {/* Tooltip kutusu */}
          {(() => {
            const tipW = 90, tipH = 36;
            const tipX = Math.min(W - PAD.r - tipW - 4, Math.max(PAD.l + 4, hover.x - tipW / 2));
            const tipY = hover.y < PAD.t + tipH + 8 ? hover.y + 8 : hover.y - tipH - 8;
            return (
              <g>
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="4"
                  fill="#0a0a18" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <text x={tipX + tipW / 2} y={tipY + 13} textAnchor="middle"
                  fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="monospace">
                  {hRow.snapshot_date?.slice(5)}
                </text>
                <text x={tipX + tipW / 2} y={tipY + 27} textAnchor="middle"
                  fontSize="12" fill={hCol} fontFamily="monospace" fontWeight="bold">
                  {hScore > 0 ? '+' : ''}{hScore}
                </text>
              </g>
            );
          })()}
        </>
      )}
    </svg>
  );
}

// ── Canlı Zaman Gösterimi ────────────────────────────────────────────

function LiveTime({ isoStr }: { isoStr: string }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    function update() {
      const dk = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
      if (dk < 1)    setLabel('Az önce');
      else if (dk < 60) setLabel(`${dk} dakika önce`);
      else           setLabel(`${Math.floor(dk / 60)} saat önce`);
    }
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [isoStr]);

  return <span>{label}</span>;
}

// ── Ana Sayfa ────────────────────────────────────────────────────────

type HistoryPeriod = 7 | 30 | 90;

export default function MakroPage() {
  const router = useRouter();

  const [macro,   setMacro]   = useState<MacroResponse | null>(null);
  const [risk,    setRisk]    = useState<RiskResponse | null>(null);
  const [sectors, setSectors] = useState<SectorsResponse | null>(null);
  const [alerts,  setAlerts]  = useState<AlertsResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Kapatılan alert ID'leri
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Tarih periyodu
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>(30);

  // Gösterge sparkline'ları
  const [indicatorSparklines, setIndicatorSparklines] = useState<Record<string, number[]>>({});

  const fetchAll = useCallback(async (period: HistoryPeriod = 30) => {
    setLoading(true);
    setError(null);
    try {
      const [macroRes, riskRes, sectorsRes, alertsRes, histRes] = await Promise.all([
        fetch('/api/macro').then(r => r.json()),
        fetch('/api/risk').then(r => r.json()),
        fetch('/api/sectors').then(r => r.json()),
        fetch('/api/alerts').then(r => r.json()),
        fetch(`/api/macro?history=true&days=${period}`).then(r => r.json()),
      ]);
      if (macroRes.error) throw new Error(macroRes.error);
      setMacro(macroRes);
      setRisk(riskRes.error     ? null : riskRes);
      setSectors(sectorsRes.error ? null : sectorsRes);
      setAlerts(alertsRes.error   ? null : alertsRes);
      setHistory(histRes.history ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(historyPeriod); }, [fetchAll, historyPeriod]);

  // Gösterge sparkline'larını çek
  useEffect(() => {
    const symbolMap: Record<string, string> = {
      VIX:    '^VIX',
      DXY:    'DX-Y.NYB',
      US10Y:  '^TNX',
      Altın:  'GC=F',
      Gümüş:  'SI=F',
      Bakır:  'HG=F',
      Brent:  'BZ=F',
    };
    Object.entries(symbolMap).forEach(async ([label, sym]) => {
      try {
        const res = await fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&days=30`);
        const { candles = [] } = await res.json() as { candles: OHLCVRow[] };
        const prices = (candles as OHLCVRow[])
          .filter(c => (c.volume ?? 1) > 0)
          .slice(-20)
          .map(c => c.close)
          .filter(v => v > 0);
        if (prices.length >= 2) {
          setIndicatorSparklines(prev => ({ ...prev, [label]: prices }));
        }
      } catch {
        // ignore
      }
    });
  }, []);

  // Tarih periyodu değişince history'yi yeniden çek
  const handleHistoryPeriodChange = useCallback(async (p: HistoryPeriod) => {
    setHistoryPeriod(p);
    try {
      const res = await fetch(`/api/macro?history=true&days=${p}`);
      const data = await res.json();
      setHistory(data.history ?? []);
    } catch {
      // ignore
    }
  }, []);

  // Sector heatmap tıklamasında taramaya git
  function handleSectorClick(sectorId: string) {
    router.push(`/tarama?sektor=${sectorId}`);
  }

  // Görünür uyarılar
  const visibleAlerts = useMemo(
    () => alerts?.alerts.filter(a => !dismissedIds.includes(a.id)) ?? [],
    [alerts, dismissedIds],
  );

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-10 bg-[#06060f]/80 border-b border-white/5 animate-pulse" />
        <main className="container mx-auto px-4 py-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-20" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        </main>
      </div>
    );
  }

  // ── Error ──
  if (error || !macro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-8 max-w-md text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 font-medium">{error ?? 'Veri yüklenemedi'}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void fetchAll(historyPeriod)}>Tekrar Dene</Button>
        </div>
      </div>
    );
  }

  const ind = macro.indicators;

  const INDICATOR_CARDS = [
    { label: 'VIX',     data: ind.vix,     suffix: '' },
    { label: 'DXY',     data: ind.dxy,     suffix: '' },
    { label: 'US 10Y',  data: ind.us10y,   suffix: '%' },
    { label: 'USD/TRY', data: ind.usdtry,  suffix: '' },
    { label: 'BIST100', data: ind.bist100, suffix: '' },
    { label: 'Brent',   data: ind.brent,   suffix: '$' },
    { label: 'Altın',   data: ind.gold,    suffix: '$' },
    { label: 'Gümüş',   data: ind.silver,  suffix: '$' },
    { label: 'Bakır',   data: ind.copper,  suffix: '$' },
    { label: 'EEM',     data: ind.eem,     suffix: '' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Ticker */}
      <TickerBar indicators={ind} />

      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              Makro Radar
            </h1>
            <p className="text-white/40 text-sm mt-1 font-mono">
              Global piyasa koşulları · Risk analizi · Sektör momentum
              <span className="ml-2 text-white/20">
                · Son güncelleme: <LiveTime isoStr={macro.fetchedAt} />
              </span>
            </p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => void fetchAll(historyPeriod)}
            disabled={loading}
            className="border-white/10 text-white/60 hover:text-white hover:border-white/25"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        {/* Dismissible Alerts */}
        <AnimatePresence>
          {visibleAlerts.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 space-y-2"
            >
              {visibleAlerts.slice(0, 3).map((a) => (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${severityStyle(a.severity)}`}
                >
                  <span className="text-base mt-0.5">{a.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-white">{a.title}</p>
                    <p className="text-sm text-white/55 mt-0.5">{a.message}</p>
                  </div>
                  <button
                    onClick={() => setDismissedIds(prev => [...prev, a.id])}
                    className="shrink-0 mt-0.5 text-white/30 hover:text-white/70 transition-colors"
                    title="Kapat"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Hero Command Center */}
        <HeroSection macro={macro} risk={risk} />

        {/* Piyasa Göstergeleri */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-white/75 uppercase tracking-widest">Piyasa Göstergeleri</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {INDICATOR_CARDS.map(({ label, data, suffix }, i) => (
              <IndicatorCard
                key={label}
                label={label}
                data={data}
                suffix={suffix}
                delay={i * 0.05}
                sparkline={indicatorSparklines[label]}
              />
            ))}
          </div>
        </section>

        {/* Değerli Metaller & Emtia Analizi */}
        <section className="mb-6 rounded-xl border border-white/8 bg-[#0a0a18] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">🥇</span>
            <h3 className="text-base font-semibold text-white">Değerli Metaller & Emtia</h3>
            <span className="ml-auto text-xs text-white/25 font-mono">BIST & global risk iştahı için bağlam</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Altın */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50 font-semibold uppercase tracking-wide">Altın (XAU)</span>
                <span className={`text-xs font-bold font-mono ${(ind.gold?.changePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {ind.gold ? `${ind.gold.changePercent >= 0 ? '+' : ''}${ind.gold.changePercent.toFixed(2)}%` : '—'}
                </span>
              </div>
              <p className="text-2xl font-black text-white font-mono">
                {ind.gold ? `$${ind.gold.price.toFixed(0)}` : '—'}
              </p>
              <p className="text-xs text-white/45 leading-relaxed">
                Risk-off varlığı. Yükselmesi küresel belirsizliğe işaret eder. TL hedge'i olarak BIST yatırımcıları için kritik.
              </p>
              {indicatorSparklines['Altın'] && <MiniSparkline values={indicatorSparklines['Altın']} up={(ind.gold?.changePercent ?? 0) >= 0} />}
            </div>
            {/* Gümüş */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50 font-semibold uppercase tracking-wide">Gümüş (XAG)</span>
                <span className={`text-xs font-bold font-mono ${(ind.silver?.changePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {ind.silver ? `${ind.silver.changePercent >= 0 ? '+' : ''}${ind.silver.changePercent.toFixed(2)}%` : '—'}
                </span>
              </div>
              <p className="text-2xl font-black text-white font-mono">
                {ind.silver ? `$${ind.silver.price.toFixed(2)}` : '—'}
              </p>
              <p className="text-xs text-white/45 leading-relaxed">
                Hem güvenli liman hem sanayi metali. Altın/Gümüş oranı yüksekse gümüş geri kalmış demektir.
              </p>
              {indicatorSparklines['Gümüş'] && <MiniSparkline values={indicatorSparklines['Gümüş']} up={(ind.silver?.changePercent ?? 0) >= 0} />}
            </div>
            {/* Bakır */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50 font-semibold uppercase tracking-wide">Bakır (Dr. Copper)</span>
                <span className={`text-xs font-bold font-mono ${(ind.copper?.changePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {ind.copper ? `${ind.copper.changePercent >= 0 ? '+' : ''}${ind.copper.changePercent.toFixed(2)}%` : '—'}
                </span>
              </div>
              <p className="text-2xl font-black text-white font-mono">
                {ind.copper ? `$${ind.copper.price.toFixed(3)}/lb` : '—'}
              </p>
              <p className="text-xs text-white/45 leading-relaxed">
                "Dr. Copper" — ekonomik aktivitenin en iyi barometresi. Yükselişi global büyüme beklentisini gösterir.
              </p>
              {indicatorSparklines['Bakır'] && <MiniSparkline values={indicatorSparklines['Bakır']} up={(ind.copper?.changePercent ?? 0) >= 0} />}
            </div>
          </div>
          {/* Altın/Gümüş Oranı + Dinamik Yorum */}
          <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
            {ind.gold && ind.silver && ind.silver.price > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-white/35">Altın/Gümüş Oranı:</span>
                <span className="text-sm font-bold font-mono text-white">
                  {(ind.gold.price / ind.silver.price).toFixed(1)}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  (ind.gold.price / ind.silver.price) > 80
                    ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                    : (ind.gold.price / ind.silver.price) < 50
                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                    : 'border-white/10 bg-white/5 text-white/40'
                }`}>
                  {(ind.gold.price / ind.silver.price) > 80
                    ? 'Gümüş görece ucuz'
                    : (ind.gold.price / ind.silver.price) < 50
                    ? 'Gümüş görece pahalı'
                    : 'Normal aralık'}
                </span>
                <span className="text-xs text-white/20">tarihsel ort. ~65</span>
              </div>
            )}
            {/* Dinamik piyasa yorumu */}
            {(() => {
              const msgs: { text: string; color: string }[] = [];
              const goldChg   = ind.gold?.changePercent ?? 0;
              const copperChg = ind.copper?.changePercent ?? 0;
              const silverChg = ind.silver?.changePercent ?? 0;
              const goldPrice = ind.gold?.price ?? 0;
              const copperPrice = ind.copper?.price ?? 0;

              if (goldPrice > 3000)
                msgs.push({ text: '🔴 Altın rekor bölgede — küresel risk iştahı zayıf, güvenli liman talebi yüksek.', color: 'text-orange-400' });
              else if (goldChg > 1.5)
                msgs.push({ text: '🟡 Altın güçlü yükselişte — belirsizlik arttı ya da dolar zayıfladı.', color: 'text-yellow-400' });
              else if (goldChg < -1.5)
                msgs.push({ text: '🟢 Altın düşüşte — risk iştahı artıyor, dolar güçleniyor olabilir.', color: 'text-green-400' });

              if (copperChg > 1.5)
                msgs.push({ text: '🟢 Bakır yükselişte — global büyüme beklentisi güçleniyor, endüstriyel talep artıyor.', color: 'text-green-400' });
              else if (copperChg < -1.5)
                msgs.push({ text: '🔴 Bakır düşüşte — ekonomik yavaşlama sinyali, risk-off eğilimi.', color: 'text-red-400' });
              else if (copperPrice > 0 && copperPrice < 3.5)
                msgs.push({ text: '🟡 Bakır 3.50$/lb altında — resesyon riski arttı.', color: 'text-orange-400' });

              if (ind.gold && ind.silver && ind.silver.price > 0) {
                const ratio = ind.gold.price / ind.silver.price;
                if (ratio > 90)
                  msgs.push({ text: `🟡 Altın/Gümüş oranı ${ratio.toFixed(0)} ile tarihin en yükseklerinde — gümüş aşırı satılmış olabilir.`, color: 'text-yellow-400' });
              }

              if (silverChg > 2 && goldChg < silverChg - 1)
                msgs.push({ text: '🟢 Gümüş altından daha hızlı yükseliyor — sanayi metali talebi öne çıkıyor.', color: 'text-green-400' });

              if (msgs.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  {msgs.map((m, i) => (
                    <p key={i} className={`text-xs leading-relaxed ${m.color}`}>{m.text}</p>
                  ))}
                </div>
              );
            })()}
          </div>
        </section>

        {/* Türkiye Makro */}
        <section className="mb-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-xl border border-white/8 bg-[#0a0a18] p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">🇹🇷</span>
              <h3 className="text-base font-semibold text-white">Türkiye Makro</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
              {/* TCMB */}
              <div className="pb-3 sm:pb-0 sm:pr-5">
                <p className="text-xs text-white/35 uppercase tracking-wide mb-1">
                  TCMB Politika Faizi
                  <FreshnessDot source={srcOf(macro.turkey.policyRate)} />
                </p>
                <p className="text-3xl font-black text-white font-mono">
                  {numVal(macro.turkey.policyRate) != null ? `%${numVal(macro.turkey.policyRate)}` : '—'}
                </p>
                <span className={`text-xs font-semibold mt-1 inline-block ${numVal(macro.turkey.policyRate) != null && numVal(macro.turkey.policyRate)! > 35 ? 'text-orange-400' : 'text-yellow-400'}`}>
                  {numVal(macro.turkey.policyRate) != null && numVal(macro.turkey.policyRate)! > 35 ? 'Kısıtlayıcı' : 'Nötr'}
                </span>
              </div>
              {/* CDS */}
              <div className="py-3 sm:py-0 sm:px-5">
                <p className="text-xs text-white/35 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <span>CDS 5Y</span>
                  <span
                    className="normal-case text-amber-300/70 cursor-help border-b border-dotted border-amber-300/40"
                    title="Bu değer gerçek CDS spread'i değildir. TCMB EVDS Türkiye CDS'sini doğrudan yayınlamadığı için USD/TRY 30 günlük volatilitesinden tahmini olarak (proxy) hesaplanmıştır. Gerçek CDS verisi için worldgovernmentbonds.com veya benzeri kaynaklara bakılmalıdır."
                    aria-label="CDS proxy değeri açıklaması"
                  >
                    (proxy ⓘ)
                  </span>
                  <FreshnessDot source={srcOf(macro.turkey.cds5y)} />
                </p>
                <p className="text-3xl font-black text-white font-mono">
                  {numVal(macro.turkey.cds5y) != null ? `${numVal(macro.turkey.cds5y)!.toFixed(0)}` : '—'}
                  <span className="text-base font-normal text-white/40 ml-1">bps</span>
                </p>
                {numVal(macro.turkey.cds5y) != null && (() => {
                  const v = numVal(macro.turkey.cds5y)!;
                  const label = v < 200 ? 'Düşük Risk' : v < 300 ? 'Normal' : v < 450 ? 'Yüksek Risk' : 'Kritik';
                  const cls   = v < 200 ? 'text-green-400' : v < 300 ? 'text-yellow-400' : v < 450 ? 'text-orange-400' : 'text-red-400';
                  return <span className={`text-xs font-semibold mt-1 inline-block ${cls}`}>{label}</span>;
                })()}
              </div>
              {/* TÜFE */}
              <div className="pt-3 sm:pt-0 sm:pl-5">
                <p className="text-xs text-white/35 uppercase tracking-wide mb-1">
                  TÜFE (Enflasyon)
                  <FreshnessDot source={srcOf(macro.turkey.inflation)} />
                </p>
                <p className="text-3xl font-black text-white font-mono">
                  {numVal(macro.turkey.inflation) != null ? fmtPct(numVal(macro.turkey.inflation)) : '—'}
                </p>
                {numVal(macro.turkey.inflation) != null && (() => {
                  const v = numVal(macro.turkey.inflation)!;
                  const label = v > 30 ? 'Yüksek' : v > 10 ? 'Orta' : 'Düşük';
                  const cls   = v > 30 ? 'text-red-400' : v > 10 ? 'text-orange-400' : 'text-green-400';
                  return <span className={`text-xs font-semibold mt-1 inline-block ${cls}`}>{label}</span>;
                })()}
              </div>
            </div>

            {/* Türkiye Dinamik Yorum */}
            {(() => {
              const rate   = numVal(macro.turkey.policyRate);
              const cds    = numVal(macro.turkey.cds5y);
              const infl   = numVal(macro.turkey.inflation);
              const usdtry = ind.usdtry?.changePercent ?? 0;

              const msgs: { text: string; positive: boolean }[] = [];

              // Faiz
              if (rate != null) {
                if (rate >= 40)
                  msgs.push({ text: `TCMB faizi %${rate} ile kısıtlayıcı bölgede — TCMB dezenflasyon sürecini önceliyor.`, positive: false });
                else if (rate >= 25)
                  msgs.push({ text: `TCMB faizi %${rate} — sıkı para politikası devam ediyor.`, positive: false });
                else
                  msgs.push({ text: `TCMB faizi %${rate} — faiz indirimi dönemine girilmiş.`, positive: true });
              }

              // CDS trend
              if (cds != null) {
                if (cds < 250)
                  msgs.push({ text: `CDS ${cds} bps ile tarihsel düşük seviyelerde — uluslararası yatırımcı güveni güçlü.`, positive: true });
                else if (cds < 400)
                  msgs.push({ text: `CDS ${cds} bps — risk algısı normal aralıkta.`, positive: true });
                else
                  msgs.push({ text: `CDS ${cds} bps ile yüksek seyrediyor — ülke risk algısı yüksek.`, positive: false });
              }

              // Enflasyon
              if (infl != null) {
                if (infl > 50)
                  msgs.push({ text: `TÜFE %${infl.toFixed(1)} — çift haneli enflasyon alım gücünü baskılamaya devam ediyor.`, positive: false });
                else if (infl > 20)
                  msgs.push({ text: `TÜFE %${infl.toFixed(1)} — enflasyon hâlâ yüksek fakat düşüş trendinde olabilir.`, positive: false });
                else
                  msgs.push({ text: `TÜFE %${infl.toFixed(1)} — enflasyon kontrol altına alınmış.`, positive: true });
              }

              // USD/TRY hareketi
              if (usdtry > 0.5)
                msgs.push({ text: `TL değer kaybediyor (+${usdtry.toFixed(2)}%) — ihracatçılar avantajlı, ithalatçılar olumsuz etkilenir.`, positive: false });
              else if (usdtry < -0.5)
                msgs.push({ text: `TL güçleniyor (${usdtry.toFixed(2)}%) — dövizde istikrar sinyali.`, positive: true });

              if (msgs.length === 0) return null;
              return (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-1.5">
                  {msgs.map((m, i) => (
                    <p key={i} className={`text-xs leading-relaxed ${m.positive ? 'text-emerald-400/80' : 'text-orange-400/80'}`}>
                      {m.positive ? '✓' : '→'} {m.text}
                    </p>
                  ))}
                </div>
              );
            })()}
          </motion.div>
        </section>

        {/* ABD Makro (FRED) */}
        <section className="mb-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="rounded-xl border border-white/8 bg-[#0a0a18] p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">🇺🇸</span>
              <h3 className="text-base font-semibold text-white">ABD Makro</h3>
              {macro.usEconomy && (
                <span
                  className={`ml-auto text-xs font-semibold rounded-full px-2 py-0.5 border ${
                    macro.usEconomy.color === 'green'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : macro.usEconomy.color === 'yellow'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                  title="Fed funds, CPI, GDP, işsizlik göstergelerinden 0-100 skor"
                >
                  Ekonomi: {macro.usEconomy.label} ({macro.usEconomy.score})
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
              {/* Fed Funds Rate */}
              <div className="pb-3 sm:pb-0 sm:pr-5">
                <p className="text-xs text-white/35 uppercase tracking-wide mb-1">
                  Fed Funds Faizi
                  <FreshnessDot source={macro.fred.fedFundsRate ? 'FRED API' : 'fallback-no-fred-key'} />
                </p>
                <p className="text-3xl font-black text-white font-mono">
                  {macro.fred.fedFundsRate?.value != null ? `%${macro.fred.fedFundsRate.value.toFixed(2)}` : '—'}
                </p>
                {macro.fred.fedFundsRate?.value != null && (() => {
                  const v = macro.fred.fedFundsRate.value;
                  const ch = macro.fred.fedFundsRate.change;
                  const label = v >= 5 ? 'Sıkı' : v >= 3 ? 'Nötr' : 'Gevşek';
                  const cls   = v >= 5 ? 'text-orange-400' : v >= 3 ? 'text-yellow-400' : 'text-green-400';
                  return (
                    <span className={`text-xs font-semibold mt-1 inline-block ${cls}`}>
                      {label}
                      {ch != null && Math.abs(ch) >= 0.01 && (
                        <span className="text-white/40 font-normal ml-1">
                          ({ch > 0 ? '+' : ''}{ch.toFixed(2)})
                        </span>
                      )}
                    </span>
                  );
                })()}
              </div>
              {/* GDP Growth */}
              <div className="py-3 sm:py-0 sm:px-5">
                <p className="text-xs text-white/35 uppercase tracking-wide mb-1">
                  GSYH Büyüme (Q/Q)
                  <FreshnessDot source={macro.fred.gdpGrowth ? 'FRED API' : 'fallback-no-fred-key'} />
                </p>
                <p className="text-3xl font-black text-white font-mono">
                  {macro.fred.gdpGrowth?.value != null ? `%${macro.fred.gdpGrowth.value.toFixed(1)}` : '—'}
                </p>
                {macro.fred.gdpGrowth?.value != null && (() => {
                  const v = macro.fred.gdpGrowth.value;
                  const label = v >= 2.5 ? 'Güçlü' : v >= 1 ? 'Ilımlı' : v >= 0 ? 'Zayıf' : 'Daralma';
                  const cls   = v >= 2.5 ? 'text-green-400' : v >= 1 ? 'text-yellow-400' : v >= 0 ? 'text-orange-400' : 'text-red-400';
                  return <span className={`text-xs font-semibold mt-1 inline-block ${cls}`}>{label}</span>;
                })()}
              </div>
              {/* Unemployment */}
              <div className="pt-3 sm:pt-0 sm:pl-5">
                <p className="text-xs text-white/35 uppercase tracking-wide mb-1">
                  İşsizlik
                  <FreshnessDot source={macro.fred.unemployment ? 'FRED API' : 'fallback-no-fred-key'} />
                </p>
                <p className="text-3xl font-black text-white font-mono">
                  {macro.fred.unemployment?.value != null ? `%${macro.fred.unemployment.value.toFixed(1)}` : '—'}
                </p>
                {macro.fred.unemployment?.value != null && (() => {
                  const v = macro.fred.unemployment.value;
                  const label = v <= 4 ? 'Tam istihdam' : v <= 5 ? 'Sağlıklı' : v <= 6 ? 'Yumuşama' : 'Resesyon riski';
                  const cls   = v <= 4 ? 'text-green-400' : v <= 5 ? 'text-yellow-400' : v <= 6 ? 'text-orange-400' : 'text-red-400';
                  return <span className={`text-xs font-semibold mt-1 inline-block ${cls}`}>{label}</span>;
                })()}
              </div>
            </div>
            {/* FRED key bilgisi — hiç veri yoksa */}
            {!macro.fred.fedFundsRate && !macro.fred.gdpGrowth && !macro.fred.unemployment && (
              <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/80">
                ⚠️ FRED verileri çekilemedi. <code className="text-amber-200">FRED_API_KEY</code> tanımlı mı kontrol edin (ücretsiz: fred.stlouisfed.org/docs/api/api_key.html).
              </div>
            )}
          </motion.div>
        </section>

        {/* Tarihsel Makro Skor Grafiği */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-white/75 uppercase tracking-widest">Makro Skor Trendi</h2>
            {/* Periyot seçici */}
            <div className="ml-auto flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              {([7, 30, 90] as HistoryPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => void handleHistoryPeriodChange(p)}
                  className={`rounded-md px-3 py-0.5 text-xs font-mono font-semibold transition-colors ${
                    historyPeriod === p
                      ? 'bg-primary/80 text-white'
                      : 'text-white/35 hover:text-white/70'
                  }`}
                >
                  {p}g
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-[#0a0a18] px-4 py-3">
            <MacroHistoryChart rows={history} />
          </div>
        </section>

        {/* Sektör Isı Haritası */}
        {sectors?.sectors && sectors.sectors.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-white/75 uppercase tracking-widest">Sektör Momentum</h2>
              {sectors.bestSector && (
                <span className="ml-auto text-xs text-white/30">
                  En iyi:{' '}
                  <span className="text-green-400 font-semibold">{sectors.bestSector.shortName}</span>
                  {sectors.worstSector && (
                    <> &nbsp;·&nbsp; En kötü:{' '}
                      <span className="text-red-400 font-semibold">{sectors.worstSector.shortName}</span>
                    </>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-white/25 font-mono mb-3">
              Skor = Fiyat Momentum + Makro Uyum · Detaylı analiz:{' '}
              <a href="/sektorler" className="text-primary/60 hover:text-primary transition-colors">Sektör Analizi</a>
              {' '}· Sektöre tıkla → sinyal taraması
            </p>
            <SectorHeatmap sectors={sectors.sectors} onSectorClick={handleSectorClick} />
          </section>
        )}

        {/* Footer */}
        <p className="text-sm text-white/25 text-center mt-8 font-mono">
          Güncelleme: <LiveTime isoStr={macro.fetchedAt} /> &nbsp;·&nbsp; Yahoo Finance · FRED · TCMB
        </p>
      </main>
    </div>
  );
}
