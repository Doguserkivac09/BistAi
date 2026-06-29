'use client';

/**
 * "Bugün" ekranı (design_handoff_bistai/bistAI Bugun.dc.html) — hi-fi.
 * Çekirdek: günlük tek net aksiyon. Verdict listesi GERÇEK smart-signal verisinden
 * (action → verdict). Açık tema, Manrope + JetBrains Mono.
 */

import { useEffect, useState } from 'react';
import type { SmartSignalResult } from '@/lib/smart-signal/types';

interface ApiResponse {
  ok: boolean;
  pending?: boolean;
  results: SmartSignalResult[];
}

// action → tasarım verdict'i (README verdict ölçeği)
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
      <span className="hidden w-[80px] shrink-0 text-right font-mono text-[13px] font-semibold text-ink lg:block">
        {fmtPrice(r.price)} ₺
      </span>
      <div className="shrink-0 text-right">
        <span
          className="inline-block rounded-[9px] px-[11px] py-[5px] text-[12px] font-extrabold lg:px-[13px] lg:py-1.5"
          style={{ background: v.bg, color: v.color }}
        >
          {v.label}
        </span>
      </div>
    </div>
  );
}

export function BugunScreen() {
  const [data, setData] = useState<SmartSignalResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch('/api/smart-signal')
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((j) => {
        setData(j.results ?? []);
        setPending(j.pending ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Günün aksiyonu: en yüksek skorlu (en aksiyon-alınabilir) ~8 hisse
  const list = [...data].sort((a, b) => b.total_score - a.total_score).slice(0, 8);
  const strong = data.filter((r) => r.status === 'STRONG').length;
  const positive = data.filter((r) => r.status === 'POSITIVE').length;

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
            <div className="mt-4 flex gap-[18px] border-t border-white/10 pt-4">
              <div>
                <div className="text-[11px] font-medium text-t3">Güçlü İzle</div>
                <div className="mt-0.5 font-mono text-[15px] font-semibold text-up-on-dark lg:text-[18px]">{strong}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-t3">Değerlendir</div>
                <div className="mt-[3px] text-[14px] font-bold text-white lg:text-[15px]">{positive}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-t3">Taranan</div>
                <div className="mt-[3px] text-[14px] font-bold text-white lg:text-[15px]">{data.length}</div>
              </div>
            </div>
          </div>

          {/* Bugün ne yapmalıyım */}
          <div className="my-[18px] flex items-center justify-between lg:my-[22px]">
            <span className="text-[16px] font-extrabold tracking-[-0.02em] text-ink lg:text-[17px]">
              Bugün ne yapmalıyım?
            </span>
            <span className="text-[12px] font-semibold text-t3">En güçlü kurulumlar</span>
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

        {/* Sağ kolon (masaüstü): verdict ölçeği */}
        <div className="flex w-full flex-col gap-[18px] lg:w-[330px]">
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
