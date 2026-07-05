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
 * Veri (hepsi mevcut API): /api/smart-signal · /api/watchlist · /api/macro(+history)
 * · /api/firsatlar (top 3) · /api/sectors (▲/▼) · /api/portfolyo + /api/ohlcv (K/Z)
 * · /api/weekly-picks + /api/ai-portfolio + /api/apex-portfolio (masaüstü şerit).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SmartSignalResult } from '@/lib/smart-signal/types';
import type { FirsatItem, FirsatlarResponse } from '@/app/api/firsatlar/route';
import { SymbolSearch } from '@/components/new/SymbolSearch';

interface SignalResp { ok: boolean; pending?: boolean; results: SmartSignalResult[] }
interface WatchItem { sembol: string }
interface MacroResp {
  score?: { score: number; wind: string; label: string };
  risk?: { label: string; color: string };
  indicators?: { bist100?: { price: number; changePercent: number } | null };
}
interface MacroHistResp { history?: Array<{ bist100: number | null }> }
interface SectorLite { shortName: string; perf20d: number }
interface PortfolioStrip { value: number; dayPct: number | null; dayTL: number | null }

// action → tasarım verdict'i
const VERDICT: Record<string, { label: string; color: string; bg: string }> = {
  'Strong Watch': { label: 'Güçlü İzle', color: '#16a35b', bg: 'rgba(22,163,91,0.12)' },
  Consider:       { label: 'Değerlendir', color: '#4aa84a', bg: 'rgba(74,168,74,0.12)' },
  Watch:          { label: 'İzle',        color: '#c98a00', bg: 'rgba(201,138,0,0.12)' },
  Avoid:          { label: 'Uzak Dur',    color: '#8a909b', bg: 'rgba(138,144,155,0.14)' },
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

function VerdictRow({ r }: { r: SmartSignalResult }) {
  const v = VERDICT[r.action] ?? VERDICT.Avoid;
  return (
    <Link
      href={`/hisse/${r.symbol}`}
      className="ie-glass flex items-center gap-3.5 rounded-[18px] px-4 py-[13px] transition-colors hover:border-white lg:gap-4 lg:rounded-[14px] lg:px-4 lg:py-3"
    >
      <span className="w-1 shrink-0 self-stretch rounded-[3px]" style={{ background: v.color }} />
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] border border-white/70 bg-white/65 font-mono text-[12px] font-semibold text-ink lg:h-[38px] lg:w-[38px] lg:rounded-[11px] lg:text-[11px]">
        {r.symbol.slice(0, 2)}
      </span>
      <div className="min-w-0 lg:w-[150px] lg:shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-ink lg:text-[14px]">{r.symbol}</span>
          <span className="font-mono text-[12px] font-medium text-t3 lg:hidden">{fmtPrice(r.price)} ₺</span>
        </div>
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
  const [watchSyms, setWatchSyms] = useState<string[]>([]);
  const [macro, setMacro] = useState<MacroResp | null>(null);
  const [bistSeries, setBistSeries] = useState<number[]>([]);
  const [opps, setOpps] = useState<FirsatItem[]>([]);
  const [sectors, setSectors] = useState<SectorLite[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioStrip | null>(null);
  const [weekly, setWeekly] = useState<{ avg: number | null; beatRate: number | null } | null>(null);
  const [aiRet, setAiRet] = useState<{ aegis: number | null; apex: number | null }>({ aegis: null, apex: null });

  useEffect(() => {
    // Smart-signal (verdict) — zorunlu
    fetch('/api/smart-signal')
      .then((r) => r.json() as Promise<SignalResp>)
      .then((j) => { setData(j.results ?? []); setPending(j.pending ?? false); })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Watchlist — auth-gated; 401/boş → fallback top-N
    fetch('/api/watchlist')
      .then((r) => (r.ok ? (r.json() as Promise<WatchItem[]>) : []))
      .then((items) => setWatchSyms(Array.isArray(items) ? items.map((i) => i.sembol) : []))
      .catch(() => {});

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
  }, []);

  // Verdict listesi: takip listesi (varsa) → smart-signal ile eşleşenler; yoksa en güçlü 8
  const bySym = new Map(data.map((r) => [r.symbol, r]));
  const watchMatched = watchSyms.map((s) => bySym.get(s)).filter((r): r is SmartSignalResult => !!r);
  const usingWatchlist = watchMatched.length > 0;
  const list = usingWatchlist
    ? watchMatched.sort((a, b) => b.total_score - a.total_score)
    : [...data].sort((a, b) => b.total_score - a.total_score).slice(0, 8);

  const strong = data.filter((r) => r.status === 'STRONG').length;
  const positive = data.filter((r) => r.status === 'POSITIVE').length;

  const macroScore = macro?.score?.score;
  const regime = regimeOf(macro?.score?.wind);
  const bist = macro?.indicators?.bist100 ?? null;

  const sorted = [...sectors].sort((a, b) => b.perf20d - a.perf20d);
  const secStrong = sorted[0] ?? null;
  const secWeak = sorted.length > 1 ? sorted[sorted.length - 1]! : null;

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
      <Sparkline values={bistSeries} color={bist && bist.changePercent < 0 ? '#e5484d' : '#16a35b'} />
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
        {/* Selamlama */}
        <div>
          <h1 className="text-[25px] font-extrabold tracking-[-0.03em] text-ink lg:text-[27px]">{greeting()}</h1>
          <p className="mt-0.5 text-[13px] font-medium capitalize text-t3">
            {dateStr} · Önce karar, sonra bağlam
          </p>
        </div>

        {/* Hızlı sembol arama — mobil (masaüstünde topbar'da) */}
        <div className="mt-3.5 lg:hidden">
          <SymbolSearch glass />
        </div>

        {/* Portföy günlük K/Z şeridi — mobil (masaüstünde sağ rayda kart) */}
        {portfolio && (
          <Link href="/portfolyo" className="ie-glass mt-3.5 flex items-center gap-2.5 rounded-[14px] px-[15px] py-3 lg:hidden">
            <span className="shrink-0 text-[12px] font-bold text-ink">Portföyüm</span>
            <span className="shrink-0 font-mono text-[13px] font-semibold text-ink">
              {portfolio.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
            </span>
            <span className="flex-1" />
            <span className="shrink-0 font-mono text-[13px] font-semibold" style={{ color: pctColor(portfolio.dayPct) }}>
              {fmtPct(portfolio.dayPct)}
            </span>
            {portfolio.dayTL != null && (
              <span className="shrink-0 font-mono text-[12px] font-medium text-t3">
                {portfolio.dayTL >= 0 ? '+' : ''}
                {portfolio.dayTL.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺ bugün
              </span>
            )}
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
              <span className="text-[12px] font-semibold text-t3">
                {usingWatchlist ? `Takip listem · ${list.length} hisse` : 'En güçlü kurulumlar'}
              </span>
            </div>

            <div className="flex flex-col gap-2.5 lg:gap-[9px]">
              {loading ? (
                [...Array(5)].map((_, i) => <div key={i} className="ie-glass h-[72px] animate-pulse rounded-[18px]" />)
              ) : list.length === 0 ? (
                <div className="ie-glass rounded-[18px] px-4 py-8 text-center text-[13px] font-medium text-t3">
                  Tarama henüz çalışmadı. Günlük cron otomatik koşar.
                </div>
              ) : (
                list.map((r) => <VerdictRow key={r.symbol} r={r} />)
              )}
            </div>

            {oppsBlock}

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

            <div className="ie-glass flex flex-1 flex-col rounded-[18px] px-[18px] py-4">
              <div className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">Verdict ölçeği</div>
              <div className="mt-3 flex flex-col gap-[11px]">
                {LEGEND.map((l) => (
                  <div key={l.t} className="flex items-center gap-[11px]">
                    <span className="h-[10px] w-[10px] shrink-0 rounded-[3px]" style={{ background: l.c }} />
                    <div>
                      <div className="text-[12px] font-bold text-ink">{l.t}</div>
                      <div className="text-[11px] font-medium text-t3">{l.d}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex-1" />
              <p className="mt-3 text-[11px] font-medium leading-[1.5] text-t3">
                Kararlar kural-tabanlı; AI yalnızca özetler. Yatırım tavsiyesi değildir.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
