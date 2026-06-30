'use client';

/**
 * "Bugün" ekranı (design_handoff_bistai/bistAI Bugun.dc.html) — hi-fi.
 * Çekirdek: günlük tek net aksiyon.
 *
 * Veri: /api/smart-signal (verdict) · /api/watchlist (kişisel liste) ·
 * /api/macro (Makro rüzgar / Rejim / Risk + BIST 100) · /api/macro?history (sparkline).
 * Açık tema, Manrope + JetBrains Mono.
 */

import { useEffect, useState } from 'react';
import type { SmartSignalResult } from '@/lib/smart-signal/types';

interface SignalResp { ok: boolean; pending?: boolean; results: SmartSignalResult[] }
interface WatchItem { sembol: string }
interface MacroResp {
  score?: { score: number; wind: string; label: string };
  risk?: { label: string; color: string };
  indicators?: { bist100?: { price: number; changePercent: number } | null };
}
interface MacroHistResp { history?: Array<{ bist100: number | null }> }

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
function fmtPrice(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function pctColor(v: number | null): string {
  if (v == null) return '#9aa0ad';
  return v >= 0 ? '#16a35b' : '#e5484d';
}

// Makro wind → Rejim etiketi + renk (koyu zemin uyumlu)
function regimeOf(wind?: string): { label: string; color: string } {
  if (!wind) return { label: '—', color: '#9aa0ad' };
  if (wind.includes('positive')) return { label: 'Yükseliş', color: '#3fce8a' };
  if (wind.includes('negative')) return { label: 'Düşüş', color: '#ff5d62' };
  return { label: 'Yatay', color: '#e6b54a' };
}
// risk.color → koyu zemin hex (API hex döndürür; isim de tolere edilir)
function riskHex(c?: string): string {
  if (!c) return '#9aa0ad';
  if (c.startsWith('#')) return c;
  if (c === 'green') return '#3fce8a';
  if (c === 'red') return '#ff5d62';
  if (c === 'yellow') return '#e6b54a';
  return '#9aa0ad';
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
    <div className="flex items-center gap-3.5 rounded-[18px] border border-hairline bg-panel px-4 py-[15px] lg:gap-4 lg:rounded-2xl lg:px-[18px]">
      <span className="self-stretch w-1 shrink-0 rounded-[3px]" style={{ background: v.color }} />
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-fill font-mono text-[12px] font-semibold text-ink">
        {r.symbol.slice(0, 2)}
      </span>
      <div className="min-w-0 lg:w-[150px] lg:shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-ink">{r.symbol}</span>
          <span className="font-mono text-[12px] font-medium text-t3 lg:hidden">{fmtPrice(r.price)} ₺</span>
        </div>
        <div className="truncate text-[12px] font-medium text-t2 lg:hidden">{r.summary}</div>
      </div>
      <div className="hidden min-w-0 flex-1 truncate text-[13px] font-medium text-t2 lg:block">{r.summary}</div>
      <span className="hidden w-[78px] shrink-0 text-right font-mono text-[13px] font-semibold text-ink lg:block">
        {fmtPrice(r.price)} ₺
      </span>
      <span
        className="hidden w-[64px] shrink-0 text-right font-mono text-[13px] font-semibold lg:block"
        style={{ color: pctColor(r.changePercent) }}
      >
        {fmtPct(r.changePercent)}
      </span>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className="inline-block rounded-[9px] px-[11px] py-[5px] text-[12px] font-extrabold lg:px-[13px] lg:py-1.5"
          style={{ background: v.bg, color: v.color }}
        >
          {v.label}
        </span>
        <span className="font-mono text-[11px] font-semibold lg:hidden" style={{ color: pctColor(r.changePercent) }}>
          {fmtPct(r.changePercent)}
        </span>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-t3">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold lg:text-[18px]" style={{ color }}>{value}</div>
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

    // Makro: Makro rüzgar / Rejim / Risk + BIST 100
    fetch('/api/macro')
      .then((r) => r.json() as Promise<MacroResp>)
      .then((m) => setMacro(m))
      .catch(() => {});

    // BIST 100 sparkline serisi (son ~30 gün)
    fetch('/api/macro?history=true&days=30')
      .then((r) => r.json() as Promise<MacroHistResp>)
      .then((h) => setBistSeries((h.history ?? []).map((x) => x.bist100).filter((v): v is number => v != null)))
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
  const macroColor = regime.color; // makro rüzgar rengi rejimle aynı yönde
  const bist = macro?.indicators?.bist100 ?? null;

  const dateStr = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="px-6 py-6 lg:px-7 lg:py-[26px]">
      {/* Selamlama */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[28px]">{greeting()}</h1>
          <p className="mt-[3px] text-[13px] font-medium capitalize text-t3 lg:text-[14px]">
            {dateStr} · Günün tek net aksiyonu
          </p>
        </div>
      </div>

      <div className="mt-[22px] flex flex-col gap-6 lg:flex-row lg:gap-6">
        {/* Sol: AI özet + verdict listesi */}
        <div className="flex min-w-0 flex-col lg:flex-[1.6]">
          {/* AI günlük özet (koyu kart) */}
          <div className="rounded-[22px] bg-ink p-5 lg:rounded-[20px] lg:p-[22px]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold tracking-[0.06em] text-ai-on-dark">✦ AI</span>
              <span className="text-[12px] font-semibold text-t3">Bugünün özeti</span>
            </div>
            <p className="mt-[11px] text-[16px] font-semibold leading-[1.5] text-[#f4f5f6] lg:text-[17px]">
              {pending
                ? 'Günün taraması henüz hazır değil; akşam kapanış sonrası güncellenir.'
                : (
                  <>
                    Bugün <b className="text-white">{positive + strong} hisse</b> &quot;değerlendir&quot; eşiğini geçti
                    {strong > 0 ? <>, <b className="text-white">{strong}&apos;i güçlü</b> kurulumda.</> : '.'}{' '}
                    Tüm kararlar kural-tabanlı; AI yalnızca özetler.
                  </>
                )}
            </p>
            {/* Makro rüzgar / Rejim / Risk */}
            <div className="mt-4 flex gap-7 border-t border-white/10 pt-4">
              <Metric label="Makro rüzgar" value={macroScore != null ? String(macroScore) : '—'} color={macroColor} />
              <Metric label="Rejim" value={regime.label} color={regime.label === '—' ? '#9aa0ad' : '#f4f5f6'} />
              <Metric label="Risk" value={macro?.risk?.label ?? '—'} color={riskHex(macro?.risk?.color)} />
            </div>
          </div>

          {/* Bugün ne yapmalıyım */}
          <div className="my-[18px] flex items-center justify-between lg:my-[22px]">
            <span className="text-[16px] font-extrabold tracking-[-0.02em] text-ink lg:text-[17px]">
              Bugün ne yapmalıyım?
            </span>
            <span className="text-[12px] font-semibold text-t3">
              {usingWatchlist ? 'Takip listem' : 'En güçlü kurulumlar'}
            </span>
          </div>

          <div className="flex flex-col gap-[11px]">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-[74px] animate-pulse rounded-2xl border border-hairline bg-panel" />
              ))
            ) : list.length === 0 ? (
              <div className="rounded-2xl border border-hairline bg-panel px-4 py-8 text-center text-[13px] font-medium text-t2">
                Tarama henüz çalışmadı. Günlük cron otomatik koşar.
              </div>
            ) : (
              list.map((r) => <VerdictRow key={r.symbol} r={r} />)
            )}
          </div>
        </div>

        {/* Sağ kolon: BIST 100 + verdict ölçeği */}
        <div className="flex w-full flex-col gap-[18px] lg:w-[330px]">
          {/* BIST 100 mini kart */}
          <div className="rounded-[18px] border border-[#f0f1f3] p-[18px]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-extrabold tracking-[-0.01em] text-ink">BIST 100</span>
              {bist && (
                <span className="font-mono text-[13px] font-semibold" style={{ color: pctColor(bist.changePercent) }}>
                  {fmtPct(bist.changePercent)}
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-[24px] font-bold tracking-[-0.02em] text-ink">
              {bist ? bist.price.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '—'}
            </div>
            <Sparkline
              values={bistSeries}
              color={bist && bist.changePercent < 0 ? '#e5484d' : '#16a35b'}
            />
          </div>

          {/* Verdict ölçeği */}
          <div className="flex flex-col rounded-[18px] border border-[#f0f1f3] p-[18px]">
            <div className="text-[15px] font-extrabold tracking-[-0.01em] text-ink">Verdict ölçeği</div>
            <div className="mt-4 flex flex-col gap-3">
              {LEGEND.map((l) => (
                <div key={l.t} className="flex items-center gap-[11px]">
                  <span className="h-[10px] w-[10px] shrink-0 rounded-[3px]" style={{ background: l.c }} />
                  <div>
                    <div className="text-[13px] font-bold text-ink">{l.t}</div>
                    <div className="text-[11px] font-medium text-t3">{l.d}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3.5 text-[11px] font-medium leading-[1.5] text-t4">
              Tüm kararlar kural-tabanlı; AI yalnızca özetler. Yatırım tavsiyesi değildir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
