'use client';

/**
 * "Sektör Detay" ekranı (design_handoff_kalan_ekranlar) — hi-fi, açık tema.
 * Koyu momentum kartı (+ ortalama sparkline) + istatistik kutuları + AI sektör
 * notu + şirketler listesi (fiyat + günlük değişim, değişime göre sıralı).
 * Veri: /api/sectors?id=X (momentum/sinyal/reasoning) + /api/ohlcv (şirket fiyatları).
 * Masaüstü: sol koyu kart + şirket tablosu, sağ 300px istatistik + AI notu.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSymbolsBySector } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';

interface SectorAnalysis {
  sectorName: string;
  shortName: string;
  perf20d: number;
  perf60d: number;
  macroAlignment: number;
  compositeScore: number;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  reasoning: string;
  symbolCount: number;
}

interface Candle { time: number; close: number }

interface CompanyRow {
  sym: string;
  price: number;
  chg: number; // günlük %
}

const SIGNAL_LABEL: Record<SectorAnalysis['signal'], { label: string; color: string }> = {
  strong_buy: { label: 'Güçlü pozitif', color: '#16a35b' },
  buy: { label: 'Pozitif', color: '#16a35b' },
  neutral: { label: 'Nötr', color: '#c98a00' },
  sell: { label: 'Negatif', color: '#e5484d' },
  strong_sell: { label: 'Güçlü negatif', color: '#e5484d' },
};

const fmt = (v: number, d = 2) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${fmt(v)}%`);
const colOf = (v: number) => (v >= 0 ? '#16a35b' : '#e5484d');

/** Normalize edilmiş kapanış ortalamasından sparkline path üretir. */
function avgSparkPath(seriesList: number[][], w: number, h: number, pad: number): string | null {
  const valid = seriesList.filter((s) => s.length >= 5);
  if (valid.length === 0) return null;
  const n = Math.min(...valid.map((s) => s.length));
  const avg: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const s of valid) sum += s[s.length - n + i]! / s[s.length - n]!;
    avg.push(sum / valid.length);
  }
  const min = Math.min(...avg);
  const max = Math.max(...avg);
  const rng = max - min || 1;
  return avg
    .map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (n - 1);
      const y = pad + (h - 2 * pad) * (1 - (v - min) / rng);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function SektorDetayScreen({ sectorId }: { sectorId: SectorId }) {
  const [analysis, setAnalysis] = useState<SectorAnalysis | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [sparkSeries, setSparkSeries] = useState<number[][]>([]);
  const [loading, setLoading] = useState(true);

  const symbols = useMemo(() => getSymbolsBySector(sectorId), [sectorId]);

  useEffect(() => {
    const ctrl = new AbortController();

    fetch(`/api/sectors?id=${sectorId}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SectorAnalysis>) : null))
      .then((d) => d && setAnalysis(d))
      .catch(() => {});

    // Şirket fiyatları: sembol başına OHLCV (30g) — eski SectorDetailClient deseni
    Promise.allSettled(
      symbols.map(async (sym) => {
        const r = await fetch(`/api/ohlcv?symbol=${sym}&days=30`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(sym);
        const d = (await r.json()) as { candles?: Candle[] };
        const candles = d.candles ?? [];
        if (candles.length < 2) throw new Error(sym);
        const last = candles[candles.length - 1]!.close;
        const prev = candles[candles.length - 2]!.close;
        return {
          row: { sym, price: last, chg: prev ? ((last - prev) / prev) * 100 : 0 },
          closes: candles.map((c) => c.close),
        };
      })
    ).then((results) => {
      const rows: CompanyRow[] = [];
      const series: number[][] = [];
      for (const res of results) {
        if (res.status === 'fulfilled') {
          rows.push(res.value.row);
          series.push(res.value.closes);
        }
      }
      rows.sort((a, b) => b.chg - a.chg);
      setCompanies(rows);
      setSparkSeries(series.slice(0, 10)); // ortalama sparkline için temsilciler yeter
      setLoading(false);
    });

    return () => ctrl.abort();
  }, [sectorId, symbols]);

  const spark = useMemo(() => avgSparkPath(sparkSeries, 240, 76, 4), [sparkSeries]);
  const sig = analysis ? SIGNAL_LABEL[analysis.signal] : null;

  const darkCard = (
    <div className="flex items-center gap-6 rounded-[20px] bg-ink p-5 lg:px-[22px]">
      <div>
        <div className="text-[12px] font-medium text-t3">Sektör momentumu · 20g</div>
        <div className="mt-1 font-mono text-[28px] font-bold tracking-[-0.02em] lg:text-[32px]" style={{ color: analysis ? (analysis.perf20d >= 0 ? '#3fce8a' : '#f07171') : '#9aa0ad' }}>
          {analysis ? fmtPct(analysis.perf20d) : '…'}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-mono text-[13px] font-semibold" style={{ color: analysis ? (analysis.perf60d >= 0 ? '#3fce8a' : '#f07171') : '#9aa0ad' }}>
            {analysis ? fmtPct(analysis.perf60d) : '—'}
          </span>
          <span className="text-[11px] font-medium text-t3">60 gün</span>
        </div>
      </div>
      <div className="flex-1" />
      {spark && (
        <svg width="240" height="76" viewBox="0 0 240 76" preserveAspectRatio="none" className="hidden max-w-[45%] sm:block">
          <defs>
            <linearGradient id={`sec-${sectorId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(63,206,138,0.28)" />
              <stop offset="1" stopColor="rgba(63,206,138,0)" />
            </linearGradient>
          </defs>
          <path d={`${spark} L236 72 L4 72 Z`} fill={`url(#sec-${sectorId})`} />
          <path d={spark} fill="none" stroke="#3fce8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );

  const statBoxes = (
    <>
      <StatBox label="Şirket" value={analysis ? String(analysis.symbolCount) : '—'} />
      <StatBox label="Makro uyum" value={analysis ? `${analysis.macroAlignment >= 0 ? '+' : ''}${analysis.macroAlignment}` : '—'} color={analysis ? colOf(analysis.macroAlignment) : undefined} />
      <StatBox label="Kompozit skor" value={analysis ? `${analysis.compositeScore >= 0 ? '+' : ''}${analysis.compositeScore}` : '—'} color={analysis ? colOf(analysis.compositeScore) : undefined} />
    </>
  );

  const aiNote = (
    <div className="rounded-[18px] border-[1.5px] border-ai-panel-border bg-ai-panel p-[18px]">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold tracking-[0.06em] text-ai">✦ AI</span>
        <span className="text-[14px] font-bold text-ink">Sektör notu</span>
        <div className="flex-1" />
        {sig && (
          <span className="text-[12px] font-extrabold" style={{ color: sig.color }}>
            {sig.label}
          </span>
        )}
      </div>
      <p className="mt-3 text-[13px] font-medium leading-[1.6] text-t2">
        {analysis?.reasoning ?? 'Sektör analizi yükleniyor…'}
      </p>
    </div>
  );

  const companyList = (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold tracking-[-0.02em] text-ink lg:text-[17px]">Şirketler</h2>
        <span className="text-[11px] font-semibold text-t3 lg:text-[12px]">Değişime göre</span>
      </div>
      {/* Masaüstü tablo başlığı */}
      <div className="mt-3 hidden border-b border-[#f0f1f3] px-4 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t4 lg:flex">
        <span className="flex-[2.2]">Sembol</span>
        <span className="flex-1 text-right">Fiyat</span>
        <span className="flex-1 text-right">Değişim</span>
      </div>
      <div className="mt-1">
        {loading && companies.length === 0 ? (
          <div className="py-6 text-center text-[13px] font-medium text-t3">Şirketler yükleniyor…</div>
        ) : (
          companies.map((c) => (
            <Link key={c.sym} href={`/hisse/${c.sym}`} className="flex items-center gap-3 border-b border-[#f6f7f8] px-0 py-3 hover:bg-fill lg:px-4">
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-fill font-mono text-[11px] font-semibold text-ink">
                {c.sym.slice(0, 2)}
              </span>
              <span className="flex-1 text-[14px] font-bold text-ink">{c.sym}</span>
              <span className="text-right">
                <span className="block font-mono text-[13px] font-semibold text-ink">{fmt(c.price)}</span>
                <span className="block font-mono text-[12px] font-semibold" style={{ color: colOf(c.chg) }}>
                  {fmtPct(c.chg)}
                </span>
              </span>
            </Link>
          ))
        )}
      </div>
    </>
  );

  return (
    <div className="px-6 py-5 lg:px-7 lg:py-6">
      {/* Başlık */}
      <div className="flex items-center gap-3.5">
        <Link href="/makro" aria-label="Geri" className="text-ink">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink lg:text-[22px]">
            {analysis?.sectorName ?? '…'}
          </h1>
          <div className="text-[11px] font-medium text-t3 lg:text-[13px]">BIST Sektör · {symbols.length} şirket</div>
        </div>
      </div>

      {/* Mobil: dikey akış · Masaüstü: sol içerik + sağ 300px */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="min-w-0 lg:flex-[1.6]">
          {darkCard}
          {/* Mobil istatistik + AI notu */}
          <div className="mt-3.5 grid grid-cols-3 gap-2.5 lg:hidden">{statBoxes}</div>
          <div className="mt-3.5 lg:hidden">{aiNote}</div>
          <div className="mt-4 lg:mt-5">{companyList}</div>
        </div>
        <div className="hidden w-[300px] shrink-0 flex-col gap-3.5 lg:flex">
          {statBoxes}
          {aiNote}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border border-hairline bg-panel px-4 py-3.5 max-lg:flex-col max-lg:items-start max-lg:gap-1 max-lg:rounded-[14px] max-lg:px-3">
      <span className="text-[11px] font-medium text-t3 lg:text-[12px]">{label}</span>
      <span className="font-mono text-[15px] font-bold lg:text-[16px]" style={{ color: color ?? '#16181d' }}>
        {value}
      </span>
    </div>
  );
}
