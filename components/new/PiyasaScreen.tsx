'use client';

/**
 * "Piyasa" ekranı (design_handoff_bistai/bistAI Sayfalar.dc.html) — hi-fi.
 * Makro kartları (USD/TRY · Altın · Brent) + sektör performansı (diverging bar).
 * "Dengeli": diğer makro göstergeler (VIX/DXY/US10Y/CDS/Enflasyon/Faiz) kompakt korunur.
 * Gerçek /api/macro + /api/sectors. Açık tema.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Quote { price: number; changePercent: number; name: string }
interface MacroResp {
  indicators?: Partial<Record<'usdtry' | 'gold' | 'brent' | 'vix' | 'dxy' | 'us10y', Quote | null>>;
  turkey?: { policyRate: number | null; cds5y: number | null; inflation: number | null; bond10y: number | null };
}
interface Sector { sectorId: string; shortName: string; sectorName: string; perf20d: number; signal: string }
interface SectorsResp { sectors?: Sector[] }

const fmtNum = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const col = (v: number | null | undefined) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');

function MacroCard({ label, q }: { label: string; q: Quote | null | undefined }) {
  return (
    <div className="rounded-[18px] border border-[#f0f1f3] p-[18px]">
      <div className="text-[12px] font-semibold text-t3">{label}</div>
      <div className="mt-1.5 font-mono text-[22px] font-bold tracking-[-0.02em] text-ink">{fmtNum(q?.price)}</div>
      <div className="mt-1 font-mono text-[13px] font-semibold" style={{ color: col(q?.changePercent) }}>{fmtPct(q?.changePercent)}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-fill px-3 py-2.5 text-center">
      <div className="font-mono text-[15px] font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-[10px] font-medium text-t3">{label}</div>
    </div>
  );
}

function DivergingBar({ v }: { v: number }) {
  const MAX = 12; // ±%12 = yarı genişlik dolu
  const w = Math.min(Math.abs(v) / MAX, 1) * 50;
  const pos = v >= 0;
  return (
    <div className="relative h-[8px] w-full overflow-hidden rounded-full bg-fill">
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#d4d7dc]" />
      <div
        className="absolute top-0 h-full rounded-full"
        style={{ background: pos ? '#16a35b' : '#e5484d', width: `${w}%`, left: pos ? '50%' : `${50 - w}%` }}
      />
    </div>
  );
}

export function PiyasaScreen() {
  const [macro, setMacro] = useState<MacroResp | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/macro').then((r) => r.json() as Promise<MacroResp>),
      fetch('/api/sectors').then((r) => r.json() as Promise<SectorsResp>),
    ]).then(([m, s]) => {
      if (m.status === 'fulfilled') setMacro(m.value);
      if (s.status === 'fulfilled') setSectors(s.value.sectors ?? []);
      setLoading(false);
    });
  }, []);

  const ind = macro?.indicators ?? {};
  const tr = macro?.turkey;
  const sortedSectors = [...sectors].sort((a, b) => b.perf20d - a.perf20d);

  return (
    <div className="px-6 py-6 lg:px-7 lg:py-[26px]">
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[28px]">Piyasa</h1>
      <p className="mt-[3px] text-[13px] font-medium text-t3 lg:text-[14px]">Makro göstergeler ve sektör performansı</p>

      {/* Hero makro kartları */}
      <div className="mt-[22px] grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MacroCard label="USD/TRY" q={ind.usdtry} />
        <MacroCard label="Altın (ons $)" q={ind.gold} />
        <MacroCard label="Brent ($)" q={ind.brent} />
      </div>

      {/* Dengeli: diğer göstergeler (kompakt) */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Cell label="VIX" value={fmtNum(ind.vix?.price, 1)} />
        <Cell label="DXY" value={fmtNum(ind.dxy?.price, 1)} />
        <Cell label="US 10Y" value={ind.us10y?.price != null ? `%${fmtNum(ind.us10y.price, 2)}` : '—'} />
        <Cell label="CDS 5Y" value={tr?.cds5y != null ? fmtNum(tr.cds5y, 0) : '—'} />
        <Cell label="Enflasyon" value={tr?.inflation != null ? `%${fmtNum(tr.inflation, 1)}` : '—'} />
        <Cell label="Politika Faizi" value={tr?.policyRate != null ? `%${fmtNum(tr.policyRate, 0)}` : '—'} />
      </div>

      {/* Sektör performansı */}
      <div className="mt-7">
        <div className="mb-3 text-[16px] font-extrabold tracking-[-0.02em] text-ink lg:text-[17px]">Sektör performansı</div>
        {loading ? (
          <div className="flex flex-col gap-2.5">{[...Array(8)].map((_, i) => <div key={i} className="h-[40px] animate-pulse rounded-[14px] bg-fill" />)}</div>
        ) : sortedSectors.length === 0 ? (
          <div className="rounded-2xl border border-hairline bg-panel px-4 py-10 text-center text-[13px] font-medium text-t2">Sektör verisi yüklenemedi.</div>
        ) : (
          <div className="flex flex-col gap-[10px]">
            {sortedSectors.map((s) => (
              <Link key={s.sectorId} href={`/sektorler/${s.sectorId}`} className="flex items-center gap-3 rounded-[14px] border border-hairline bg-panel px-4 py-[11px] hover:border-[#e3e5e8]">
                <span className="w-[120px] shrink-0 truncate text-[13px] font-bold text-ink lg:w-[150px]">{s.shortName}</span>
                <div className="min-w-0 flex-1"><DivergingBar v={s.perf20d} /></div>
                <span className="w-[60px] shrink-0 text-right font-mono text-[13px] font-semibold" style={{ color: col(s.perf20d) }}>{fmtPct(s.perf20d)}</span>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] font-medium text-t4">Bar = 20 günlük ortalama performans (merkez = 0). Sektöre tıkla → detay.</p>
      </div>
    </div>
  );
}
