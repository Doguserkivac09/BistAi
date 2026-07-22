'use client';

/**
 * "Bugün v2" ekranı (design_handoff_bugun_v2, açık liquid-glass) — hi-fi.
 * Güne-başlama merkezi: önce "ne yapmalıyım" (verdict), sonra bağlam.
 * Pastel ambient zemin + frosted cam kartlar (globals.css: .ie-ambient/.ie-glass*).
 *
 * Bloklar (mobil sıra): selamlama → arama → Portföy K/Z şeridi → AI özet (cam)
 * → verdict listesi → günün fırsatları rayı → sektör şeridi → BIST 100.
 * Masaüstü: bilgi şeridi (sektör + haftanın seçimleri + AI portföyleri) +
 * sol karar sütunu + sağ bağlam rayı (BIST / Portföy / verdict ölçeği).
 *
 * Veri (hepsi mevcut API): /api/smart-signal · /api/macro(+history)
 * · /api/firsatlar (top 3) · /api/sectors (▲/▼) · /api/portfolyo + /api/ohlcv (K/Z)
 * · /api/weekly-picks + /api/ai-portfolio + /api/apex-portfolio (masaüstü şerit).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SmartSignalResult } from '@/lib/smart-signal/types';
import type { FirsatItem, FirsatlarResponse } from '@/app/api/firsatlar/route';
import { SymbolSearch } from '@/components/new/SymbolSearch';
import { SparklineChartButton } from '@/components/new/ChartModal';

interface SignalResp { ok: boolean; pending?: boolean; results: SmartSignalResult[] }
interface MacroResp {
  score?: { score: number; wind: string; label: string };
  risk?: { label: string; color: string };
  indicators?: { bist100?: { price: number; changePercent: number } | null };
}
interface MacroHistResp { history?: Array<{ bist100: number | null }> }
interface SectorLite { shortName: string; perf20d: number }
interface ViopLite {
  code: string; underlying: string; label: string;
  direction: 'long' | 'short' | 'notr'; score: number;
  risk: { entryPrice: number; targetPrice: number; riskRewardRatio: number | null };
}
interface PortfolioStrip { value: number; dayPct: number | null; dayTL: number | null }

// action → tasarım verdict'i
const VERDICT: Record<string, { label: string; color: string; bg: string }> = {
  'Strong Watch': { label: 'Güçlü İzle', color: '#16a35b', bg: 'rgba(22,163,91,0.12)' },
  Consider:       { label: 'Değerlendir', color: '#4aa84a', bg: 'rgba(74,168,74,0.12)' },
  Watch:          { label: 'İzle',        color: '#c98a00', bg: 'rgba(201,138,0,0.12)' },
  Avoid:          { label: 'Uzak Dur',    color: '#8a909b', bg: 'rgba(138,144,155,0.14)' },
};

// Sinyal akışı tipleri — yalnızca SmartSignalResult'ta GERÇEKTEN var olan alanlardan
// (flags/technical_score/status) türetilir. "Verdict ↑" ve "Hacim" isimleri handoff'un
// dilini korur, ama gün-içi zaman-serisi (takas/hacim geçmişi) olmadığı için literal
// "bugün yükseldi" / "hacim anomalisi" tespiti YAPILMAZ — en yakın gerçek proxy kullanılır:
// smart_money_entered → Akıllı para; technical_score yüksek → Teknik; status STRONG →
// Verdict; accumulation/distribution (akış-trend değişimi) → Hacim.
type FeedType = 'smart' | 'brk' | 'vd' | 'vol';
const FEED_META: Record<FeedType, { label: string; color: string; bg: string }> = {
  smart: { label: 'Akıllı para', color: '#6b6ff5', bg: 'rgba(107,111,245,0.14)' },
  brk: { label: 'Teknik', color: '#0e9f6e', bg: 'rgba(14,159,110,0.14)' },
  vd: { label: 'Verdict', color: '#0e8fb7', bg: 'rgba(14,143,183,0.14)' },
  vol: { label: 'Hacim', color: '#c98a00', bg: 'rgba(201,138,0,0.14)' },
};
const LEGEND = [
  { c: '#16a35b', t: 'Güçlü İzle', d: 'Teknik + akıllı para güçlü hizalı' },
  { c: '#4aa84a', t: 'Değerlendir', d: 'Pozitif sinyal, eşiği geçti' },
  { c: '#c98a00', t: 'İzle', d: 'Belirsiz, teyit bekle' },
  { c: '#9aa0ad', t: 'Uzak Dur', d: 'Sinyal zayıf veya negatif' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}
const fmtPrice = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const pctColor = (v: number | null) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');

// Makro wind → Rejim etiketi + renk (AÇIK cam zemin)
function regimeOf(wind?: string): { label: string; color: string } {
  if (!wind) return { label: '—', color: '#9aa0ad' };
  if (wind.includes('positive')) return { label: 'Yükseliş', color: '#16a35b' };
  if (wind.includes('negative')) return { label: 'Düşüş', color: '#e5484d' };
  return { label: 'Yatay', color: '#c98a00' };
}
function riskHex(c?: string): string {
  if (!c) return '#9aa0ad';
  if (c === 'green' || c === '#3fce8a') return '#16a35b';
  if (c === 'red' || c === '#ff5d62') return '#e5484d';
  if (c === 'yellow' || c === '#e6b54a') return '#c98a00';
  return c.startsWith('#') ? c : '#9aa0ad';
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 132, h = 40;
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / rng) * (h - 4) - 2).toFixed(1)}`)
    .join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Sana Özel: sahip olunan/takip edilen sembol → somut aksiyon ────────────────
type Tone = 'up' | 'down' | 'neutral';
const TONE: Record<Tone, { color: string; bg: string }> = {
  up: { color: '#16a35b', bg: 'rgba(22,163,91,0.12)' },
  down: { color: '#e5484d', bg: 'rgba(229,72,77,0.12)' },
  neutral: { color: '#c98a00', bg: 'rgba(201,138,0,0.12)' },
};
function personalAction(r: SmartSignalResult | null, held: boolean): { label: string; tone: Tone; hint: string } {
  if (!r) return { label: held ? 'Fiyat izle' : 'İzle', tone: 'neutral', hint: 'Bugün sinyal verisi yok' };
  const dist = r.flags.includes('distribution');
  const acc = r.flags.includes('accumulation') || r.flags.includes('smart_money_entered');
  if (held) {
    if (r.status === 'NEGATIVE' || dist)
      return { label: 'Kâr al / azalt', tone: 'down', hint: dist ? 'Dağıtım sinyali' : 'Zayıflıyor' };
    if (r.status === 'STRONG' || r.status === 'POSITIVE' || acc)
      return { label: 'Tut / ekle', tone: 'up', hint: acc ? 'Akıllı para güçlü' : 'Pozitif seyir' };
    return { label: 'Tut, teyit bekle', tone: 'neutral', hint: 'Nötr seyir' };
  }
  if (r.status === 'STRONG' || r.status === 'POSITIVE' || acc)
    return { label: 'Alım için değerlendir', tone: 'up', hint: acc ? 'Akıllı para girdi' : 'Pozitif sinyal' };
  if (r.status === 'NEGATIVE') return { label: 'Zayıf, bekle', tone: 'down', hint: 'Negatif sinyal' };
  return { label: 'İzle, teyit bekle', tone: 'neutral', hint: 'Belirsiz' };
}

function PersonalRow({
  sym, held, r, act, mobileHidden,
}: {
  sym: string; held: boolean; watched: boolean; r: SmartSignalResult | null;
  act: { label: string; tone: Tone; hint: string }; mobileHidden?: boolean;
}) {
  const t = TONE[act.tone];
  return (
    <Link
      href={`/hisse/${sym}`}
      className={`ie-glass items-center gap-3.5 rounded-[18px] px-4 py-[13px] transition-colors hover:border-white lg:flex lg:gap-4 lg:rounded-[14px] lg:px-4 lg:py-3 ${mobileHidden ? 'hidden' : 'flex'}`}
    >
      <span className="w-1 shrink-0 self-stretch rounded-[3px]" style={{ background: t.color }} />
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] border border-white/70 bg-white/65 font-mono text-[12px] font-semibold text-ink lg:h-[38px] lg:w-[38px] lg:rounded-[11px] lg:text-[11px]">
        {sym.slice(0, 2)}
      </span>
      <div className="min-w-0 lg:w-[150px] lg:shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-ink lg:text-[14px]">{sym}</span>
          <span
            className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.03em]"
            style={held ? { background: 'rgba(107,111,245,0.14)', color: '#6b6ff5' } : { background: 'rgba(14,143,183,0.12)', color: '#0e8fb7' }}
          >
            {held ? 'Portföy' : 'Takip'}
          </span>
        </div>
        <div className="truncate text-[12px] font-medium text-t3">{act.hint}</div>
      </div>
      <div className="hidden min-w-0 flex-1 truncate text-[12px] font-medium text-t3 lg:block">
        {r ? r.summary : 'Bugün için sinyal verisi yok'}
      </div>
      <span
        className="hidden w-[58px] shrink-0 text-right font-mono text-[13px] font-semibold lg:block"
        style={{ color: pctColor(r?.changePercent ?? null) }}
      >
        {fmtPct(r?.changePercent ?? null)}
      </span>
      <div className="flex shrink-0 flex-col items-end gap-1 lg:w-[118px] lg:flex-none">
        <span className="inline-block rounded-[9px] px-[11px] py-[5px] text-[12px] font-extrabold lg:px-3" style={{ background: t.bg, color: t.color }}>
          {act.label}
        </span>
        <span className="font-mono text-[11px] font-semibold lg:hidden" style={{ color: pctColor(r?.changePercent ?? null) }}>
          {fmtPct(r?.changePercent ?? null)}
        </span>
      </div>
    </Link>
  );
}

function ViopMini({ item }: { item: ViopLite }) {
  const isLong = item.direction === 'long';
  const c = isLong ? '#16a35b' : '#e5484d';
  const bg = isLong ? 'rgba(22,163,91,0.12)' : 'rgba(229,72,77,0.12)';
  return (
    <Link href="/viop" className="flex items-center gap-2.5 rounded-[12px] border border-hairline px-3 py-2.5 transition-colors hover:bg-fill">
      <span className="shrink-0 rounded-[7px] px-2 py-1 text-[10px] font-extrabold" style={{ background: bg, color: c }}>
        {isLong ? '▲ LONG' : '▼ SHORT'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-ink">{item.label}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-t3">
          Giriş {fmtPrice(item.risk.entryPrice)} → {fmtPrice(item.risk.targetPrice)}
          {item.risk.riskRewardRatio != null && ` · R/R ${item.risk.riskRewardRatio}`}
        </div>
      </div>
      <span className="shrink-0 font-mono text-[16px] font-bold" style={{ color: item.score >= 70 ? '#16a35b' : item.score >= 55 ? '#c98a00' : '#9aa0ad' }}>
        {item.score}
      </span>
    </Link>
  );
}

function VerdictRow({ r, feedType, delta, mobileHidden }: { r: SmartSignalResult; feedType?: FeedType | null; delta?: number | null; mobileHidden?: boolean }) {
  const v = VERDICT[r.action] ?? VERDICT.Avoid;
  const fm = feedType ? FEED_META[feedType] : null;
  return (
    <Link
      href={`/hisse/${r.symbol}`}
      className={`ie-glass items-center gap-3.5 rounded-[18px] px-4 py-[13px] transition-colors hover:border-white lg:flex lg:gap-4 lg:rounded-[14px] lg:px-4 lg:py-3 ${mobileHidden ? 'hidden' : 'flex'}`}
    >
      <span className="w-1 shrink-0 self-stretch rounded-[3px]" style={{ background: v.color }} />
      {fm && (
        <span
          className="hidden shrink-0 rounded-[7px] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.03em] lg:block"
          style={{ background: fm.bg, color: fm.color }}
        >
          {fm.label}
        </span>
      )}
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] border border-white/70 bg-white/65 font-mono text-[12px] font-semibold text-ink lg:h-[38px] lg:w-[38px] lg:rounded-[11px] lg:text-[11px]">
        {r.symbol.slice(0, 2)}
      </span>
      <div className="min-w-0 lg:w-[150px] lg:shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-ink lg:text-[14px]">{r.symbol}</span>
          {typeof delta === 'number' && delta > 0 && (
            <span className="shrink-0 rounded-[6px] px-1.5 py-0.5 font-mono text-[10px] font-extrabold" style={{ background: 'rgba(22,163,91,0.14)', color: '#16a35b' }}>
              ▲ +{delta}
            </span>
          )}
          <span className="font-mono text-[12px] font-medium text-t3 lg:hidden">{fmtPrice(r.price)} ₺</span>
        </div>
        {fm && (
          <span className="mt-0.5 inline-block rounded-[6px] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.03em] lg:hidden" style={{ background: fm.bg, color: fm.color }}>
            {fm.label}
          </span>
        )}
        <div className="truncate text-[12px] font-medium text-t3 lg:hidden">{r.summary}</div>
        <span className="hidden font-mono text-[12px] font-medium text-t3 lg:block">{fmtPrice(r.price)} ₺</span>
      </div>
      <div className="hidden min-w-0 flex-1 truncate text-[12px] font-medium text-t3 lg:block">{r.summary}</div>
      <span
        className="hidden w-[58px] shrink-0 text-right font-mono text-[13px] font-semibold lg:block"
        style={{ color: pctColor(r.changePercent) }}
      >
        {fmtPct(r.changePercent)}
      </span>
      <div className="flex shrink-0 flex-col items-end gap-1 lg:w-[100px] lg:flex-none">
        <span
          className="inline-block rounded-[9px] px-[11px] py-[5px] text-[12px] font-extrabold lg:px-3"
          style={{ background: v.bg, color: v.color }}
        >
          {v.label}
        </span>
        <span className="font-mono text-[11px] font-semibold lg:hidden" style={{ color: pctColor(r.changePercent) }}>
          {fmtPct(r.changePercent)}
        </span>
      </div>
    </Link>
  );
}

function OppCard({ o }: { o: FirsatItem }) {
  const tag = o.sinyaller?.[0] ?? (o.direction === 'yukari' ? 'Momentum' : 'Sinyal');
  return (
    <Link href={`/hisse/${o.sembol}`} className="ie-glass min-w-0 flex-1 rounded-[16px] p-[13px] transition-colors hover:border-white lg:rounded-[14px] lg:px-[15px]">
      <div className="flex items-center justify-between">
        <span className="truncate text-[14px] font-bold text-ink">{o.sembol}</span>
        <span className="font-mono text-[12px] font-bold text-ai lg:text-[13px]">{Math.round(o.adjustedScore)}</span>
      </div>
      <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.05em] text-t3">{tag}</div>
      <div className="mt-2 font-mono text-[12px] font-semibold" style={{ color: pctColor(o.changePercent) }}>
        {fmtPct(o.changePercent)}
      </div>
    </Link>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-t3">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold lg:text-[17px]" style={{ color }}>{value}</div>
    </div>
  );
}

export function BugunScreen() {
  const [data, setData] = useState<SmartSignalResult[]>([]);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [macro, setMacro] = useState<MacroResp | null>(null);
  const [bistSeries, setBistSeries] = useState<number[]>([]);
  const [opps, setOpps] = useState<FirsatItem[]>([]);
  const [sectors, setSectors] = useState<SectorLite[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioStrip | null>(null);
  const [weekly, setWeekly] = useState<{ avg: number | null; beatRate: number | null } | null>(null);
  const [aiRet, setAiRet] = useState<{ aegis: number | null; apex: number | null }>({ aegis: null, apex: null });
  const [heldSyms, setHeldSyms] = useState<string[]>([]);
  const [viopTop, setViopTop] = useState<{ long: ViopLite | null; short: ViopLite | null } | null>(null);
  const [watchRows, setWatchRows] = useState<Array<{ sembol: string }>>([]);
  const [watchExpanded, setWatchExpanded] = useState(false);

  useEffect(() => {
    // Smart-signal (verdict) — zorunlu
    fetch('/api/smart-signal')
      .then((r) => r.json() as Promise<SignalResp>)
      .then((j) => { setData(j.results ?? []); setPending(j.pending ?? false); })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Makro: rüzgar / rejim / risk + BIST 100
    fetch('/api/macro')
      .then((r) => r.json() as Promise<MacroResp>)
      .then(setMacro)
      .catch(() => {});
    fetch('/api/macro?history=true&days=30')
      .then((r) => r.json() as Promise<MacroHistResp>)
      .then((h) => setBistSeries((h.history ?? []).map((x) => x.bist100).filter((v): v is number => v != null)))
      .catch(() => {});

    // Günün fırsatları — en yüksek skorlu 3
    fetch('/api/firsatlar')
      .then((r) => (r.ok ? (r.json() as Promise<FirsatlarResponse>) : null))
      .then((d) => {
        if (d?.firsatlar) setOpps([...d.firsatlar].sort((a, b) => b.adjustedScore - a.adjustedScore).slice(0, 3));
      })
      .catch(() => {});

    // Sektör momentumu (▲ en güçlü / ▼ en zayıf, 20g)
    fetch('/api/sectors')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sectors?: SectorLite[] } | null) => setSectors(d?.sectors ?? []))
      .catch(() => {});

    // Portföy K/Z şeridi — auth yoksa/pozisyon yoksa gizli
    fetch('/api/portfolyo')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (positions: Array<{ sembol: string; miktar: number }> | null) => {
        if (!positions || !Array.isArray(positions) || positions.length === 0) return;
        const lots = new Map<string, number>();
        for (const p of positions) lots.set(p.sembol, (lots.get(p.sembol) ?? 0) + p.miktar);
        setHeldSyms([...lots.keys()]);
        let value = 0, prevValue = 0;
        await Promise.all(
          [...lots.entries()].map(async ([sym, lot]) => {
            try {
              const j = await fetch(`/api/ohlcv?symbol=${sym}&days=5`).then((r) => r.json());
              const c: Array<{ close: number }> = j?.candles ?? [];
              const last = c[c.length - 1]?.close;
              const prev = c[c.length - 2]?.close;
              if (typeof last === 'number') value += lot * last;
              if (typeof prev === 'number') prevValue += lot * prev;
            } catch { /* fiyat yoksa atla */ }
          })
        );
        if (value > 0) {
          setPortfolio({
            value,
            dayTL: prevValue > 0 ? value - prevValue : null,
            dayPct: prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : null,
          });
        }
      })
      .catch(() => {});

    // Masaüstü bilgi şeridi: haftanın seçimleri + AI portföyleri
    fetch('/api/weekly-picks')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stats?: { avgReturn?: number; outperformedRate?: number } } | null) => {
        const rate = d?.stats?.outperformedRate;
        setWeekly({
          avg: d?.stats?.avgReturn ?? null,
          beatRate: rate != null ? Math.round(rate <= 1 ? rate * 100 : rate) : null,
        });
      })
      .catch(() => {});
    fetch('/api/ai-portfolio')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { summary?: { totalReturn?: number } } | null) =>
        setAiRet((p) => ({ ...p, aegis: d?.summary?.totalReturn ?? null })))
      .catch(() => {});
    fetch('/api/apex-portfolio')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { summary?: { totalReturn?: number } } | null) =>
        setAiRet((p) => ({ ...p, apex: d?.summary?.totalReturn ?? null })))
      .catch(() => {});

    // VIOP vadeli — tüm varlıklarda en güçlü long + short (premium; tanıtım modunda açık)
    fetch('/api/viop')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: ViopLite[] } | null) => {
        const items = d?.items ?? [];
        if (items.length === 0) return;
        let long: ViopLite | null = null, short: ViopLite | null = null;
        for (const i of items) {
          if (i.direction === 'long' && (!long || i.score > long.score)) long = i;
          if (i.direction === 'short' && (!short || i.score > short.score)) short = i;
        }
        if (long || short) setViopTop({ long, short });
      })
      .catch(() => {});

    // Takip listem — auth yoksa sessizce boş kalır (401)
    fetch('/api/watchlist')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Array<{ sembol: string }> | null) => setWatchRows(d ?? []))
      .catch(() => {});
  }, []);

  // ── #1 Sana Özel Günlük Aksiyon ────────────────────────────────────────────
  // Kullanıcının SAHİP OLDUĞU (portföy) + TAKİP ETTİĞİ (watchlist) semboller, o günün
  // smart-signal durumu/flag'leriyle çaprazlanıp somut aksiyona (Kâr al / Tut-ekle /
  // Değerlendir / İzle) çevrilir. Portföy satırları önce, sonra skor sırası.
  const sanaOzel = useMemo(() => {
    const map = new Map(data.map((r) => [r.symbol, r]));
    const heldSet = new Set(heldSyms);
    const watchSet = new Set(watchRows.map((w) => w.sembol));
    const syms = [...new Set([...heldSyms, ...watchRows.map((w) => w.sembol)])];
    return syms
      .map((sym) => {
        const held = heldSet.has(sym);
        const r = map.get(sym) ?? null;
        return { sym, held, watched: watchSet.has(sym), r, act: personalAction(r, held) };
      })
      .sort((a, b) => {
        if (a.held !== b.held) return a.held ? -1 : 1; // portföy önce
        return (b.r?.total_score ?? -1) - (a.r?.total_score ?? -1);
      });
  }, [data, heldSyms, watchRows]);

  // ── #2 Bugün İvme Kazananlar ────────────────────────────────────────────────
  // Bir önceki güne göre skoru ARTAN (score_delta > 0) semboller, delta'ya göre azalan.
  // Sana Özel'dekiler hariç (tekrar önlemi). Delta verisi henüz yoksa (cron ilk gün)
  // "en güçlü kurulumlar" (top-8) davranışına zarifçe düşülür — bölüm asla boş kalmaz.
  const ivme = useMemo(() => {
    const own = new Set([...heldSyms, ...watchRows.map((w) => w.sembol)]);
    const rising = data
      .filter((r) => typeof r.score_delta === 'number' && r.score_delta > 0 && !own.has(r.symbol))
      .sort((a, b) => (b.score_delta ?? 0) - (a.score_delta ?? 0))
      .slice(0, 8);
    if (rising.length > 0) return { rows: rising, fallback: false };
    const top = [...data].sort((a, b) => b.total_score - a.total_score).slice(0, 8);
    return { rows: top, fallback: true };
  }, [data, heldSyms, watchRows]);

  // Takip listem — /api/watchlist sembolleri + o günün smart-signal verisiyle (fiyat/verdict) eşle
  const watchList = useMemo(() => {
    const map = new Map(data.map((r) => [r.symbol, r]));
    return watchRows.map((w) => ({ sembol: w.sembol, r: map.get(w.sembol) ?? null }));
  }, [watchRows, data]);
  const watchHasMore = watchList.length > 5;
  const watchShown = watchExpanded ? watchList : watchList.slice(0, 5);

  const strong = data.filter((r) => r.status === 'STRONG').length;
  const positive = data.filter((r) => r.status === 'POSITIVE').length;

  const macroScore = macro?.score?.score;
  const regime = regimeOf(macro?.score?.wind);
  const bist = macro?.indicators?.bist100 ?? null;

  const sorted = [...sectors].sort((a, b) => b.perf20d - a.perf20d);
  const secStrong = sorted[0] ?? null;
  const secWeak = sorted.length > 1 ? sorted[sorted.length - 1]! : null;

  // Sağ ray sektör momentum listesi: tüm sektörler (alanı doldurur), skorca sıralı.
  // Bar genişliği için ortak ölçek (mutlak max perf).
  const sectorRows = sorted;
  const sectorMax = Math.max(1, ...sectorRows.map((s) => Math.abs(s.perf20d)));

  const dateStr = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Paylaşılan bloklar ──
  const sectorStrip = secStrong && secWeak && (
    <div className="ie-glass-flat flex items-center gap-2 rounded-[14px] px-[15px] py-[11px]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">Sektör · 20g</span>
      <span className="text-[12px] font-bold text-up">▲ {secStrong.shortName}</span>
      <span className="font-mono text-[12px] font-semibold text-up">{fmtPct(secStrong.perf20d)}</span>
      <span className="mx-1 h-3.5 w-px bg-hairline" />
      <span className="text-[12px] font-bold text-down">▼ {secWeak.shortName}</span>
      <span className="font-mono text-[12px] font-semibold text-down">{fmtPct(secWeak.perf20d)}</span>
    </div>
  );

  // VIOP vadeli — en güçlü long + short (auth/tanıtım yoksa viopTop null → gizli)
  const viopCard = viopTop && (viopTop.long || viopTop.short) && (
    <div className="ie-glass rounded-[18px] px-[18px] py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">VIOP vadeli</span>
          <span className="rounded-full bg-ai-panel px-1.5 py-0.5 text-[9px] font-bold text-ai">PREMIUM</span>
        </div>
        <Link href="/viop" className="text-[11px] font-semibold text-t3 hover:text-ink">Tümü →</Link>
      </div>
      <p className="mt-1 text-[11px] font-medium text-t3">Tüm varlıklarda öne çıkan kaldıraçlı senaryo</p>
      <div className="mt-2.5 flex flex-col gap-2">
        {viopTop.long && <ViopMini item={viopTop.long} />}
        {viopTop.short && <ViopMini item={viopTop.short} />}
      </div>
    </div>
  );

  const aiCard = (
    <div className="ie-glass-ai rounded-[22px] px-5 py-[18px] lg:flex lg:items-center lg:gap-6 lg:rounded-[20px] lg:px-[22px]">
      <div className="lg:flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold tracking-[0.06em] text-ai">✦ AI</span>
          <span className="text-[12px] font-semibold text-t3">Bugünün özeti</span>
        </div>
        <p className="mt-2.5 text-[15px] font-semibold leading-[1.5] text-ink">
          {pending
            ? 'Günün taraması henüz hazır değil; akşam kapanış sonrası güncellenir.'
            : (
              <>
                Bugün <b>{positive + strong} hisse</b> &quot;değerlendir&quot; eşiğini geçti
                {strong > 0 ? <>, <b>{strong}&apos;i güçlü</b> kurulumda.</> : '.'}{' '}
                Kararlar kural-tabanlı; AI yalnızca özetler.
              </>
            )}
        </p>
      </div>
      <div className="mt-3.5 flex gap-[18px] border-t border-hairline pt-3.5 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <Metric label="Makro rüzgar" value={macroScore != null ? String(macroScore) : '—'} color={regime.color} />
        <Metric label="Rejim" value={regime.label} color={regime.label === '—' ? '#9aa0ad' : 'var(--ink)'} />
        <Metric label="Risk" value={macro?.risk?.label ?? '—'} color={riskHex(macro?.risk?.color)} />
      </div>
    </div>
  );

  const oppsBlock = opps.length > 0 && (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">Günün fırsatları</span>
        <Link href="/firsatlar" className="text-[12px] font-semibold text-up hover:underline">
          Tümü →
        </Link>
      </div>
      <div className="flex gap-2.5 lg:gap-3">
        {opps.map((o) => <OppCard key={o.sembol} o={o} />)}
      </div>
    </>
  );

  const bistCard = (
    <div className="ie-glass rounded-[18px] px-4 py-3.5 lg:px-[18px] lg:py-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-t3">BIST 100</span>
        {bist && (
          <span className="font-mono text-[13px] font-semibold" style={{ color: pctColor(bist.changePercent) }}>
            {fmtPct(bist.changePercent)}
          </span>
        )}
      </div>
      <div className="mt-0.5 font-mono text-[20px] font-bold tracking-[-0.02em] text-ink lg:text-[22px]">
        {bist ? bist.price.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '—'}
      </div>
      <SparklineChartButton symbol="XU100" title="BIST 100" className="block w-full">
        <Sparkline values={bistSeries} color={bist && bist.changePercent < 0 ? '#e5484d' : '#16a35b'} />
      </SparklineChartButton>
    </div>
  );

  const takipListemCard = watchList.length > 0 && (
    <div className="ie-glass rounded-[18px] px-[18px] py-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-extrabold text-ink">Takip listem</span>
        <Link href="/watchlist" className="text-[11px] font-semibold text-t3 hover:text-ink">
          Tümü →
        </Link>
      </div>
      <div className="mt-2.5 flex flex-col gap-1">
        {watchShown.map(({ sembol, r }) => {
          const v = r ? VERDICT[r.action] ?? VERDICT.Avoid : null;
          return (
            <Link
              key={sembol}
              href={`/hisse/${sembol}`}
              className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-2 transition-colors hover:bg-fill"
            >
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: v?.color ?? '#9aa0ad' }} />
              <span className="w-[62px] shrink-0 text-[13px] font-bold text-ink">{sembol}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-t3">
                {r ? `${fmtPrice(r.price)} ₺` : '—'}
              </span>
              <span className="shrink-0 font-mono text-[12px] font-semibold" style={{ color: r ? pctColor(r.changePercent) : '#9aa0ad' }}>
                {r ? fmtPct(r.changePercent) : '—'}
              </span>
            </Link>
          );
        })}
      </div>
      {watchHasMore && (
        <button
          onClick={() => setWatchExpanded((v) => !v)}
          className="mt-2 w-full rounded-[10px] py-2 text-center text-[12px] font-bold text-up hover:underline"
        >
          {watchExpanded ? 'Daha az göster' : `Daha fazla göster (+${watchList.length - 5})`}
        </button>
      )}
    </div>
  );

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      {/* Ambient ışımalar — cam kartların kırılması için */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[50px] -top-[50px] h-[250px] w-[280px] blur-[24px]" style={{ background: 'radial-gradient(circle,rgba(107,111,245,0.22),rgba(107,111,245,0) 68%)' }} />
        <div className="absolute -right-[60px] -top-[30px] h-[230px] w-[280px] blur-[26px]" style={{ background: 'radial-gradient(circle,rgba(22,163,91,0.2),rgba(22,163,91,0) 66%)' }} />
        <div className="absolute left-[30%] top-[40%] h-[280px] w-[280px] blur-[32px]" style={{ background: 'radial-gradient(circle,rgba(255,183,120,0.14),rgba(255,183,120,0) 70%)' }} />
      </div>

      <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
        {/* Selamlama — zaman-bazlı (SSR/istemci saati farkı) → suppressHydrationWarning */}
        <div>
          <h1 suppressHydrationWarning className="text-[25px] font-extrabold tracking-[-0.03em] text-ink lg:text-[27px]">{greeting()}</h1>
          <p suppressHydrationWarning className="mt-0.5 text-[13px] font-medium capitalize text-t3">
            {dateStr} · Önce karar, sonra bağlam
          </p>
        </div>

        {/* Hızlı sembol arama — mobil (masaüstünde topbar'da) */}
        <div className="mt-3.5 lg:hidden">
          <SymbolSearch glass />
        </div>

        {/* Portföy günlük K/Z şeridi — mobil (masaüstünde sağ rayda kart) */}
        {portfolio && (
          <Link href="/portfolyo" className="ie-glass mt-3.5 flex items-center gap-2.5 rounded-[14px] px-[15px] py-2.5 lg:hidden">
            <span className="shrink-0 text-[12px] font-bold text-ink">Portföyüm</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-ink">
              {portfolio.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
            </span>
            <span className="shrink-0 text-right leading-[1.2]">
              <span className="block font-mono text-[13px] font-semibold" style={{ color: pctColor(portfolio.dayPct) }}>
                {fmtPct(portfolio.dayPct)}
              </span>
              {portfolio.dayTL != null && (
                <span className="block font-mono text-[11px] font-medium text-t3">
                  {portfolio.dayTL >= 0 ? '+' : ''}
                  {portfolio.dayTL.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺ bugün
                </span>
              )}
            </span>
          </Link>
        )}

        {/* Masaüstü bilgi şeridi: sektör + haftanın seçimleri + AI portföyleri */}
        <div className="ie-glass-flat mt-3.5 hidden items-center rounded-[14px] px-[18px] py-[11px] lg:flex">
          {secStrong && secWeak && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">Sektör · 20g</span>
              <span className="text-[12px] font-bold text-up">▲ {secStrong.shortName}</span>
              <span className="font-mono text-[12px] font-semibold text-up">{fmtPct(secStrong.perf20d)}</span>
              <span className="ml-1.5 text-[12px] font-bold text-down">▼ {secWeak.shortName}</span>
              <span className="font-mono text-[12px] font-semibold text-down">{fmtPct(secWeak.perf20d)}</span>
            </div>
          )}
          {weekly?.avg != null && (
            <>
              <span className="mx-[18px] h-[18px] w-px bg-hairline" />
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">Haftanın seçimleri</span>
                <span className="font-mono text-[12px] font-semibold" style={{ color: pctColor(weekly.avg) }}>{fmtPct(weekly.avg)}</span>
                {weekly.beatRate != null && weekly.beatRate >= 50 && (
                  <span className="rounded-[6px] bg-up/[0.14] px-2 py-0.5 text-[10px] font-bold text-up">
                    BIST&apos;i geçme %{weekly.beatRate}
                  </span>
                )}
              </div>
            </>
          )}
          {(aiRet.aegis != null || aiRet.apex != null) && (
            <>
              <span className="mx-[18px] h-[18px] w-px bg-hairline" />
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-ai">✦</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">AI Portföyleri</span>
                {aiRet.aegis != null && (
                  <>
                    <span className="text-[12px] font-bold text-ink">Aegis</span>
                    <span className="font-mono text-[12px] font-semibold" style={{ color: pctColor(aiRet.aegis) }}>{fmtPct(aiRet.aegis)}</span>
                  </>
                )}
                {aiRet.apex != null && (
                  <>
                    <span className="ml-1 text-[12px] font-bold text-ink">APEX</span>
                    <span className="font-mono text-[12px] font-semibold" style={{ color: pctColor(aiRet.apex) }}>{fmtPct(aiRet.apex)}</span>
                  </>
                )}
              </div>
            </>
          )}
          <span className="flex-1" />
          <Link href="/ai-portfoyler" className="text-[12px] font-semibold text-t3 hover:text-ink">
            Detay →
          </Link>
        </div>

        <div className="mt-3.5 flex flex-col gap-3.5 lg:mt-4 lg:flex-row lg:gap-6">
          {/* Sol: karar sütunu */}
          <div className="flex min-w-0 flex-col gap-3.5 lg:flex-[1.6] lg:gap-4">
            {aiCard}

            <div className="flex items-center justify-between">
              <span className="text-[16px] font-extrabold tracking-[-0.02em] text-ink">Bugün ne yapmalıyım?</span>
              <span className="text-[12px] font-semibold text-t3">Sana özel · günün ivmesi</span>
            </div>

            {/* #1 Sana Özel Günlük Aksiyon — portföyün + takip listen için somut hamle */}
            {loading ? (
              <div className="flex flex-col gap-2.5 lg:gap-[9px]">
                {[...Array(3)].map((_, i) => <div key={i} className="ie-glass h-[72px] animate-pulse rounded-[18px]" />)}
              </div>
            ) : sanaOzel.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-extrabold text-ink">Sana özel</span>
                  <span className="text-[11px] font-semibold text-t3">Portföyün + takip listen · {sanaOzel.length}</span>
                </div>
                <div className="flex flex-col gap-2.5 lg:gap-[9px]">
                  {sanaOzel.slice(0, 8).map((x, i) => (
                    <PersonalRow key={x.sym} sym={x.sym} held={x.held} watched={x.watched} r={x.r} act={x.act} mobileHidden={i >= 4} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="ie-glass rounded-[18px] px-4 py-5 text-center text-[13px] font-medium text-t3">
                Portföy ekle veya hisse takibe al — burada sana özel günlük aksiyonlar belirsin.
              </div>
            )}

            {/* #2 Bugün İvme Kazananlar — skoru dünden bugüne artanlar */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-extrabold text-ink">Bugün ivme kazananlar</span>
                <span className="text-[11px] font-semibold text-t3">
                  {ivme.fallback ? 'En güçlü kurulumlar' : 'Skoru yükselenler'}
                </span>
              </div>
              <div className="flex flex-col gap-2.5 lg:gap-[9px]">
                {loading ? (
                  [...Array(4)].map((_, i) => <div key={i} className="ie-glass h-[72px] animate-pulse rounded-[18px]" />)
                ) : ivme.rows.length === 0 ? (
                  <div className="ie-glass rounded-[18px] px-4 py-8 text-center text-[13px] font-medium text-t3">
                    Tarama henüz çalışmadı. Günlük cron otomatik koşar.
                  </div>
                ) : (
                  ivme.rows.map((r, i) => (
                    <VerdictRow key={r.symbol} r={r} delta={ivme.fallback ? null : r.score_delta} mobileHidden={i >= 3} />
                  ))
                )}
              </div>
            </div>

            {oppsBlock}

            {/* VIOP vadeli — mobil (masaüstünde sağ rayda) */}
            <div className="lg:hidden">{viopCard}</div>

            {/* Sektör şeridi — mobil (masaüstünde bilgi şeridinde) */}
            <div className="lg:hidden">{sectorStrip}</div>

            {/* BIST 100 — mobil (masaüstünde sağ rayda) */}
            <div className="lg:hidden">{bistCard}</div>
          </div>

          {/* Sağ ray: bağlam (masaüstü) */}
          <div className="hidden w-[330px] flex-col gap-3.5 lg:flex">
            {bistCard}

            {portfolio && (
              <div className="ie-glass rounded-[18px] px-[18px] py-4">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-extrabold text-ink">Portföyüm</span>
                  <Link href="/portfolyo" className="text-[11px] font-semibold text-t3 hover:text-ink">
                    Detay →
                  </Link>
                </div>
                <div className="mt-2.5 flex items-end justify-between">
                  <span className="font-mono text-[21px] font-bold text-ink">
                    {portfolio.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[14px] font-semibold" style={{ color: pctColor(portfolio.dayPct) }}>
                      {fmtPct(portfolio.dayPct)}
                    </span>
                    {portfolio.dayTL != null && (
                      <span className="mt-0.5 block font-mono text-[11px] font-medium text-t3">
                        {portfolio.dayTL >= 0 ? '+' : ''}
                        {portfolio.dayTL.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺ bugün
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {takipListemCard}

            {viopCard}

            {/* Sektör momentumu — sağ rayın ana bağlam kartı (büyük) */}
            <div className="ie-glass flex flex-1 flex-col rounded-[18px] px-[18px] py-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">Sektör momentumu</span>
                <Link href="/makro" className="text-[11px] font-semibold text-t3 hover:text-ink">Tümü →</Link>
              </div>
              {sectorRows.length === 0 ? (
                <p className="mt-4 text-[12px] font-medium text-t3">Sektör verisi yükleniyor…</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2.5">
                  {sectorRows.map((s) => (
                    <div key={s.shortName} className="flex items-center gap-2.5">
                      <span className="w-[92px] shrink-0 truncate text-[12px] font-semibold text-ink">{s.shortName}</span>
                      <div className="relative h-[7px] flex-1 overflow-hidden rounded-full bg-fill">
                        {/* Diverging bar: merkezden başlar, max yarım genişlik (%50) → taşmaz */}
                        <span
                          className="absolute top-0 h-full"
                          style={{
                            background: s.perf20d >= 0 ? '#16a35b' : '#e5484d',
                            width: `${Math.min(50, (Math.abs(s.perf20d) / sectorMax) * 50)}%`,
                            left: s.perf20d >= 0 ? '50%' : undefined,
                            right: s.perf20d < 0 ? '50%' : undefined,
                            borderRadius: s.perf20d >= 0 ? '0 3px 3px 0' : '3px 0 0 3px',
                          }}
                        />
                        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-hairline/70" />
                      </div>
                      <span className="w-[52px] shrink-0 text-right font-mono text-[12px] font-semibold" style={{ color: pctColor(s.perf20d) }}>
                        {fmtPct(s.perf20d)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2.5 text-[10px] font-medium text-t4">20 günlük sektör getirisi · çizgi = nötr</p>

              {/* Verdict ölçeği — kompakt (küçük, altta) */}
              <div className="mt-4 border-t border-hairline pt-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-t3">Verdict ölçeği</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {LEGEND.map((l) => (
                    <div key={l.t} className="flex items-center gap-1.5" title={l.d}>
                      <span className="h-[8px] w-[8px] shrink-0 rounded-[2px]" style={{ background: l.c }} />
                      <span className="truncate text-[11px] font-semibold text-t2">{l.t}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-[10px] font-medium leading-[1.5] text-t4">
                Kararlar kural-tabanlı; AI yalnızca özetler. Yatırım tavsiyesi değildir.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
