'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Shield, BarChart3, Globe, Building2,
  Zap, Activity,
} from 'lucide-react';
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
      if (p > 3000) return { text: 'Rekor Yüksek', cls: 'text-red-400' };
      if (p > 2500) return { text: 'Güçlü',        cls: 'text-orange-400' };
      if (p > 2000) return { text: 'Normal',        cls: 'text-yellow-400' };
      return             { text: 'Düşük',           cls: 'text-green-400' };
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

// ── Makro Gauge (yeniden tasarım) ───────────────────────────────────

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

      {/* Track */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#1a1a2e" strokeWidth="13" />

      {/* Gradient arka plan */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="url(#mgGrad)" strokeWidth="13" strokeOpacity="0.2" />

      {/* Dolu yay */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="url(#mgGrad)" strokeWidth="13"
        strokeDasharray={`${filled} ${arcLen + 20}`}
        strokeLinecap="round"
        filter="url(#mgGlow)"
      />

      {/* Skala çizgileri */}
      {[-100, -50, 0, 50, 100].map((v) => {
        const a = ((v + 100) / 200) * 180;
        const ra = (a * Math.PI) / 180;
        const x1 = cx + (r - 6)  * Math.cos(Math.PI - ra);
        const y1 = cy - (r - 6)  * Math.sin(Math.PI - ra);
        const x2 = cx + (r + 4)  * Math.cos(Math.PI - ra);
        const y2 = cy - (r + 4)  * Math.sin(Math.PI - ra);
        return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />;
      })}

      {/* İbre */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="white" strokeWidth="2" strokeLinecap="round"
        filter="url(#needleGlow)" />
      <circle cx={cx} cy={cy} r="5.5" fill={col} filter="url(#needleGlow)" />
      <circle cx={cx} cy={cy} r="2.5" fill="white" />

      {/* Skor */}
      <text x={cx} y={cy - 20} textAnchor="middle"
        fill={col} fontSize="32" fontWeight="800" fontFamily="monospace"
        filter="url(#mgGlow)">
        {score > 0 ? '+' : ''}{score}
      </text>
    </svg>
  );
}

// ── Risk Halkası (yeniden tasarım) ──────────────────────────────────

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
          strokeDasharray={`${circ} ${circ}`}
        />
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={col} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          filter="url(#rGlow)"
        />
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
      {/* Arka plan glow */}
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
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: barCol }}
                      initial={{ width: 0 }}
                      animate={{ width: `${barPct}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                    />
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
          <motion.div
            className="text-6xl font-black tracking-tight leading-none"
            style={{ color: col }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.15 }}
          >
            {translateWind(macro.score.wind)}
          </motion.div>
          <div className="text-base text-white/50 font-medium">{macro.score.label}</div>

          {/* Kısa açıklama satırı */}
          <div className="mt-2 px-4 py-2.5 rounded-lg bg-white/4 border border-white/6 text-sm text-white/55 max-w-[240px]">
            {score >= 30
              ? 'Makro koşullar güçlü. Yükseliş için zemin uygun.'
              : score >= 0
              ? 'Makro koşullar nötr. Seçici pozisyon önerilir.'
              : score >= -30
              ? 'Makro baskı var. Savunmacı duruş mantıklı.'
              : 'Yüksek risk ortamı. Pozisyon küçültme önerilir.'}
          </div>

          {/* Son güncelleme */}
          <div className="text-sm text-white/25 font-mono mt-1">
            {new Date(macro.score.calculatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Sağ — Risk Circle */}
        {risk && (
          <div className="flex flex-col items-center justify-center py-8 px-6 gap-4">
            <p className="text-sm text-white/40 uppercase tracking-[0.18em] font-mono">Piyasa Risk Skoru</p>
            <RiskCircle score={risk.score} label={risk.label} emoji={risk.emoji} />
            <p className="text-sm text-white/45 text-center max-w-[210px] leading-relaxed">
              {risk.recommendation}
            </p>
            <div className="w-full space-y-1.5 mt-1">
              {risk.components.map((c) => (
                <div key={c.name} className="flex items-center gap-2">
                  <span className="text-sm text-white/45 w-20 truncate">{c.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: riskColor(c.score) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${c.score}%` }}
                      transition={{ duration: 0.8, delay: 0.4 }}
                    />
                  </div>
                  <span className="text-sm font-mono w-7 text-right" style={{ color: riskColor(c.score) }}>
                    {c.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Gösterge Kartı ──────────────────────────────────────────────────

function IndicatorCard({
  label, data, suffix, delay,
}: {
  label: string;
  data: { price: number; change: number; changePercent: number } | null;
  suffix: string;
  delay: number;
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
      style={{
        background: `linear-gradient(135deg, ${bgGlow}, #0a0a18)`,
        border: `1px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/35 font-mono uppercase tracking-widest">{label}</span>
        <span className={`text-sm font-semibold ${sig.cls}`}>{sig.text}</span>
      </div>
      <p className="text-3xl font-bold text-white font-mono leading-none">
        {data ? `${data.price.toFixed(2)}${suffix}` : '—'}
      </p>
      <div className="flex items-center gap-1 mt-2.5">
        {data ? (
          up ? <TrendingUp className="h-3.5 w-3.5 text-green-400" /> :
          dn ? <TrendingDown className="h-3.5 w-3.5 text-red-400" /> :
          <Minus className="h-3.5 w-3.5 text-white/30" />
        ) : null}
        <span className={`text-sm font-mono ${up ? 'text-green-400' : dn ? 'text-red-400' : 'text-white/30'}`}>
          {data ? `${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%` : '—'}
        </span>
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

function SectorHeatmap({ sectors }: { sectors: SectorItem[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const sorted = [...sectors].sort((a, b) => b.compositeScore - a.compositeScore);

  function cellStyle(score: number): React.CSSProperties {
    let bg: string, border: string;
    if (score >= 40)      { bg = 'rgba(34,197,94,0.22)';  border = 'rgba(34,197,94,0.45)';  }
    else if (score >= 20) { bg = 'rgba(34,197,94,0.13)';  border = 'rgba(34,197,94,0.30)';  }
    else if (score >= 5)  { bg = 'rgba(132,204,22,0.10)'; border = 'rgba(132,204,22,0.25)'; }
    else if (score >= -5) { bg = 'rgba(234,179,8,0.10)';  border = 'rgba(234,179,8,0.25)';  }
    else if (score >= -20){ bg = 'rgba(249,115,22,0.13)'; border = 'rgba(249,115,22,0.30)'; }
    else if (score >= -40){ bg = 'rgba(239,68,68,0.15)';  border = 'rgba(239,68,68,0.35)';  }
    else                  { bg = 'rgba(239,68,68,0.22)';  border = 'rgba(239,68,68,0.45)';  }
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
            className="rounded-xl p-4 cursor-default relative overflow-hidden"
            style={cellStyle(s.compositeScore)}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-base font-semibold text-white leading-tight">{s.shortName}</span>
              <span
                className="text-base font-black font-mono leading-none"
                style={{ color: scoreCol(s.compositeScore) }}
              >
                {s.compositeScore > 0 ? '+' : ''}{s.compositeScore.toFixed(0)}
              </span>
            </div>

            {/* Momentum bar */}
            <div className="h-1 rounded-full bg-white/8 overflow-hidden mb-2.5">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: scoreCol(s.compositeScore) }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(Math.abs(s.compositeScore), 100)}%` }}
                transition={{ duration: 0.7, delay: i * 0.04 + 0.2 }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {s.perf20d > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-400" />
                ) : s.perf20d < 0 ? (
                  <TrendingDown className="h-3 w-3 text-red-400" />
                ) : (
                  <Minus className="h-3 w-3 text-white/30" />
                )}
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

            {/* Hover detay */}
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
                    <p className="text-sm text-white/55 leading-relaxed line-clamp-4">{s.reasoning}</p>
                  </div>
                  <div className="flex items-center justify-between text-sm text-white/35 mt-2">
                    <span>{s.symbolCount} hisse</span>
                    <span className="font-mono">20g: {s.perf20d > 0 ? '+' : ''}{s.perf20d.toFixed(1)}%</span>
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
  if (rows.length < 3) {
    return (
      <div className="flex items-center justify-center h-28 text-white/30 text-sm font-mono">
        Veri birikmekte... ({rows.length} gün)
      </div>
    );
  }

  const W = 600, H = 120, PAD = { t: 12, b: 28, l: 40, r: 12 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const scores = rows.map(r => r.macro_score);
  const minS = Math.min(-100, ...scores);
  const maxS = Math.max(100, ...scores);
  const range = maxS - minS || 1;

  const toX = (i: number) => PAD.l + (i / (rows.length - 1)) * chartW;
  const toY = (s: number) => PAD.t + ((maxS - s) / range) * chartH;
  const zeroY = toY(0);

  const points = rows.map((r, i) => `${toX(i)},${toY(r.macro_score)}`).join(' ');
  // fill polygon: altına kapat
  const fillPts = `${toX(0)},${zeroY} ` + points + ` ${toX(rows.length - 1)},${zeroY}`;

  // Son skor rengi
  const lastScore = scores[scores.length - 1] ?? 0;
  const lineCol = lastScore >= 30 ? '#22c55e' : lastScore >= 0 ? '#84cc16' : lastScore >= -30 ? '#eab308' : '#ef4444';
  const fillCol = lastScore >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';

  // X ekseni etiketleri: ilk, orta, son
  const labelIdxs = [0, Math.floor(rows.length / 2), rows.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      {/* Sıfır çizgisi */}
      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="rgba(255,255,255,0.10)" strokeWidth="1" strokeDasharray="4 3" />

      {/* +30 / -30 bant */}
      <rect x={PAD.l} y={PAD.t} width={chartW} height={toY(30) - PAD.t} fill="rgba(34,197,94,0.04)" />
      <rect x={PAD.l} y={toY(-30)} width={chartW} height={chartH - (toY(-30) - PAD.t)} fill="rgba(239,68,68,0.04)" />

      {/* Alan dolgusu */}
      <polygon points={fillPts} fill={fillCol} />

      {/* Çizgi */}
      <polyline points={points} fill="none" stroke={lineCol} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Son nokta */}
      <circle cx={toX(rows.length - 1)} cy={toY(lastScore)} r="3.5" fill={lineCol} />

      {/* Y ekseni etiketleri */}
      {[100, 50, 0, -50, -100].map(v => (
        <text key={v} x={PAD.l - 4} y={toY(v) + 4}
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
    </svg>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────

export default function MakroPage() {
  const [macro,   setMacro]   = useState<MacroResponse | null>(null);
  const [risk,    setRisk]    = useState<RiskResponse | null>(null);
  const [sectors, setSectors] = useState<SectorsResponse | null>(null);
  const [alerts,  setAlerts]  = useState<AlertsResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [macroRes, riskRes, sectorsRes, alertsRes, histRes] = await Promise.all([
        fetch('/api/macro').then(r => r.json()),
        fetch('/api/risk').then(r => r.json()),
        fetch('/api/sectors').then(r => r.json()),
        fetch('/api/alerts').then(r => r.json()),
        fetch('/api/macro?history=true&days=30').then(r => r.json()),
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

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchAll}>Tekrar Dene</Button>
        </div>
      </div>
    );
  }

  const ind = macro.indicators;

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
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}
            className="border-white/10 text-white/60 hover:text-white hover:border-white/25">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        {/* Alerts */}
        {alerts && alerts.alerts.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 space-y-2"
          >
            {alerts.alerts.slice(0, 3).map((a) => (
              <div key={a.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${severityStyle(a.severity)}`}>
                <span className="text-base mt-0.5">{a.emoji}</span>
                <div className="min-w-0">
                  <p className="text-base font-medium text-white">{a.title}</p>
                  <p className="text-sm text-white/55 mt-0.5">{a.message}</p>
                </div>
              </div>
            ))}
          </motion.section>
        )}

        {/* Hero Command Center */}
        <HeroSection macro={macro} risk={risk} />

        {/* Piyasa Göstergeleri */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-white/75 uppercase tracking-widest">Piyasa Göstergeleri</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: 'VIX',     data: ind.vix,     suffix: '' },
              { label: 'DXY',     data: ind.dxy,     suffix: '' },
              { label: 'US 10Y',  data: ind.us10y,   suffix: '%' },
              { label: 'USD/TRY', data: ind.usdtry,  suffix: '' },
              { label: 'EEM',     data: ind.eem,     suffix: '' },
              { label: 'Brent',   data: ind.brent,   suffix: '$' },
              { label: 'Altın',   data: ind.gold,    suffix: '$' },
              { label: 'BIST100', data: ind.bist100, suffix: '' },
            ].map(({ label, data, suffix }, i) => (
              <IndicatorCard key={label} label={label} data={data} suffix={suffix} delay={i * 0.06} />
            ))}
          </div>
        </section>

        {/* Türkiye + ABD */}
        <section className="grid gap-4 md:grid-cols-2 mb-6">
          {/* Türkiye */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-xl border border-white/8 bg-[#0a0a18] p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">🇹🇷</span>
              <h3 className="text-base font-semibold text-white">Türkiye Makro</h3>
            </div>
            <MetricRow
              label="TCMB Politika Faizi"
              value={numVal(macro.turkey.policyRate) != null ? `%${numVal(macro.turkey.policyRate)}` : '—'}
              context={numVal(macro.turkey.policyRate) != null && numVal(macro.turkey.policyRate)! > 35 ? 'Kısıtlayıcı' : 'Nötr'}
              contextCls={numVal(macro.turkey.policyRate) != null && numVal(macro.turkey.policyRate)! > 35 ? 'text-orange-400' : 'text-yellow-400'}
            />
            <MetricRow
              label="CDS (5Y)"
              value={numVal(macro.turkey.cds5y) != null ? numVal(macro.turkey.cds5y)!.toFixed(0) : '—'}
              context={numVal(macro.turkey.cds5y) != null ? (numVal(macro.turkey.cds5y)! < 200 ? 'Düşük Risk' : numVal(macro.turkey.cds5y)! < 400 ? 'Orta Risk' : 'Yüksek Risk') : undefined}
              contextCls={numVal(macro.turkey.cds5y) != null ? (numVal(macro.turkey.cds5y)! < 200 ? 'text-green-400' : numVal(macro.turkey.cds5y)! < 400 ? 'text-yellow-400' : 'text-red-400') : undefined}
            />
            <MetricRow
              label="TÜFE"
              value={numVal(macro.turkey.inflation) != null ? fmtPct(numVal(macro.turkey.inflation)) : '—'}
              context={numVal(macro.turkey.inflation) != null ? (numVal(macro.turkey.inflation)! > 30 ? 'Yüksek' : numVal(macro.turkey.inflation)! > 10 ? 'Orta' : 'Düşük') : undefined}
              contextCls={numVal(macro.turkey.inflation) != null ? (numVal(macro.turkey.inflation)! > 30 ? 'text-red-400' : numVal(macro.turkey.inflation)! > 10 ? 'text-orange-400' : 'text-green-400') : undefined}
            />
          </motion.div>

          {/* ABD */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="rounded-xl border border-white/8 bg-[#0a0a18] p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">🇺🇸</span>
              <h3 className="text-base font-semibold text-white">ABD Ekonomisi</h3>
              {macro.usEconomy && (
                <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-md bg-white/5 ${
                  macro.usEconomy.color === 'green' ? 'text-green-400' :
                  macro.usEconomy.color === 'red'   ? 'text-red-400'   : 'text-yellow-400'
                }`}>
                  {macro.usEconomy.label}
                </span>
              )}
            </div>
            <MetricRow
              label="Fed Funds Rate"
              value={macro.fred.fedFundsRate ? `%${Number(macro.fred.fedFundsRate.value).toFixed(2)}` : '—'}
              context={macro.fred.fedFundsRate ? (Number(macro.fred.fedFundsRate.value) > 4 ? 'Kısıtlayıcı' : 'Nötr') : undefined}
              contextCls={macro.fred.fedFundsRate && Number(macro.fred.fedFundsRate.value) > 4 ? 'text-orange-400' : 'text-yellow-400'}
            />
            <MetricRow
              label="GDP Büyüme"
              value={macro.fred.gdpGrowth ? fmtPct(Number(macro.fred.gdpGrowth.value)) : '—'}
              context={macro.fred.gdpGrowth ? (Number(macro.fred.gdpGrowth.value) > 2 ? 'Güçlü' : Number(macro.fred.gdpGrowth.value) > 0 ? 'Zayıf' : 'Negatif') : undefined}
              contextCls={macro.fred.gdpGrowth ? (Number(macro.fred.gdpGrowth.value) > 2 ? 'text-green-400' : Number(macro.fred.gdpGrowth.value) > 0 ? 'text-yellow-400' : 'text-red-400') : undefined}
            />
            <MetricRow
              label="İşsizlik Oranı"
              value={macro.fred.unemployment ? fmtPct(Number(macro.fred.unemployment.value)) : '—'}
              context={macro.fred.unemployment ? (Number(macro.fred.unemployment.value) < 4 ? 'Tam İstihdam' : Number(macro.fred.unemployment.value) < 6 ? 'Normal' : 'Yüksek') : undefined}
              contextCls={macro.fred.unemployment ? (Number(macro.fred.unemployment.value) < 4 ? 'text-green-400' : Number(macro.fred.unemployment.value) < 6 ? 'text-yellow-400' : 'text-red-400') : undefined}
            />
          </motion.div>
        </section>

        {/* Tarihsel Makro Skor Grafiği */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-white/75 uppercase tracking-widest">Makro Skor Trendi</h2>
            <span className="ml-auto text-xs text-white/25 font-mono">Son 30 gün</span>
          </div>
          <div className="rounded-xl border border-white/8 bg-[#0a0a18] px-4 py-3">
            <MacroHistoryChart rows={history} />
          </div>
        </section>

        {/* Sektör Isı Haritası */}
        {sectors?.sectors && sectors.sectors.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
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
            <SectorHeatmap sectors={sectors.sectors} />
          </section>
        )}

        {/* Footer */}
        <p className="text-sm text-white/25 text-center mt-8 font-mono">
          Güncelleme: {new Date(macro.fetchedAt).toLocaleString('tr-TR')} &nbsp;·&nbsp; Yahoo Finance · FRED · TCMB
        </p>
      </main>
    </div>
  );
}
