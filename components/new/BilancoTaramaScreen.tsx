'use client';

/**
 * Bilanço Kalitesi Taraması (Bilanço B1 → piyasa-geneli liste).
 * "Hangi şirket gerçekten kâr ediyor?" — tüm likit BIST evreni, kâr kalitesine göre.
 * Veri: /api/earnings-scan (earnings-quality cron → ai_cache map, İş Yatırım).
 * ⚠️ KALİTE/RİSK aracı — getiri tahmini DEĞİL (doğrulama kararı).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { EarningsScanRow } from '@/app/api/earnings-scan/route';
import YasalFeragat from '@/components/new/YasalFeragat';

type Filtre = 'tumu' | 'gerçek' | 'finansman-yükü' | 'kağıt-üstü' | 'zayıf';
type Sort = 'score' | 'margin' | 'coverage';

const VERDICT: Record<string, { label: string; color: string; bg: string }> = {
  'gerçek':         { label: 'Gerçek', color: '#16a35b', bg: 'rgba(22,163,91,0.12)' },
  'finansman-yükü': { label: 'Finansman yükü', color: '#c98a00', bg: 'rgba(201,138,0,0.12)' },
  'kağıt-üstü':     { label: 'Kâğıt üstü', color: '#e5484d', bg: 'rgba(229,72,77,0.12)' },
  'zayıf':          { label: 'Zayıf', color: '#8a909b', bg: 'rgba(138,144,155,0.12)' },
  'belirsiz':       { label: 'Belirsiz', color: '#8a909b', bg: 'rgba(138,144,155,0.12)' },
};
const FILTRELER: { id: Filtre; label: string }[] = [
  { id: 'tumu', label: 'Tümü' }, { id: 'gerçek', label: 'Gerçek kâr' },
  { id: 'finansman-yükü', label: 'Finansman yükü' }, { id: 'kağıt-üstü', label: 'Kâğıt üstü' }, { id: 'zayıf', label: 'Zayıf' },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: 'score', label: 'Kalite skoru' }, { id: 'margin', label: 'Faaliyet marjı' }, { id: 'coverage', label: 'Faiz karşılama' },
];

const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : `%${(v * 100).toFixed(1)}`);
const cov = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}×`);
const scoreColor = (s: number) => (s >= 60 ? '#16a35b' : s >= 40 ? '#c98a00' : '#e5484d');

export function BilancoTaramaScreen() {
  const [rows, setRows] = useState<EarningsScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>('tumu');
  const [sort, setSort] = useState<Sort>('score');

  useEffect(() => {
    fetch('/api/earnings-scan').then((r) => r.json()).then((j) => setRows(j.rows ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    let arr = filtre === 'tumu' ? rows : rows.filter((r) => r.verdict === filtre);
    arr = [...arr].sort((a, b) => {
      if (sort === 'margin') return (b.operatingMargin ?? -9) - (a.operatingMargin ?? -9);
      if (sort === 'coverage') return (b.interestCoverage ?? -9) - (a.interestCoverage ?? -9);
      return b.score - a.score;
    });
    return arr;
  }, [rows, filtre, sort]);

  const chipRow = <T extends string>(opts: { id: T; label: string }[], val: T, set: (v: T) => void, count?: (id: T) => number | undefined) => (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button key={o.id} onClick={() => set(o.id)}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${val === o.id ? 'bg-ink text-onink' : 'border border-hairline text-t2 hover:text-ink'}`}>
          {o.label}{count && count(o.id) != null ? <span className="ml-1 opacity-60">{count(o.id)}</span> : null}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative min-h-full px-6 py-5 lg:px-7 lg:py-[22px]">
      <div>
        <h1 className="text-[25px] font-extrabold tracking-[-0.03em] text-ink lg:text-[27px]">Bilanço Kalitesi Taraması</h1>
        <p className="mt-1 text-[13px] font-medium text-t3">Hangi şirket gerçekten kâr ediyor? Tüm likit BIST evreni, kâr kalitesine göre. Risk/kalite merceği — getiri tahmini değil.</p>
      </div>

      <div className="mt-4 flex flex-col gap-3.5 lg:mt-5">
        {/* Özet */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
          <Stat label="Şirket" value={loading ? '…' : String(rows.length)} />
          <Stat label="Gerçek kâr" value={String(counts['gerçek'] ?? 0)} color="#16a35b" />
          <Stat label="Finansman yükü" value={String(counts['finansman-yükü'] ?? 0)} color="#c98a00" />
          <Stat label="Kâğıt üstü" value={String(counts['kağıt-üstü'] ?? 0)} color="#e5484d" />
        </div>

        <div className="flex flex-col gap-2.5">
          {chipRow(FILTRELER, filtre, setFiltre, (id) => id === 'tumu' ? rows.length : counts[id])}
          {chipRow(SORTS, sort, setSort)}
        </div>

        {loading ? (
          <div className="ie-glass h-[300px] animate-pulse rounded-[18px]" />
        ) : shown.length === 0 ? (
          <div className="ie-glass-flat rounded-[18px] px-5 py-10 text-center text-[13px] font-medium text-t3">
            Veri henüz hazır değil (haftalık cron doldurur) ya da bu filtrede şirket yok.
          </div>
        ) : (
          <>
            {/* Masaüstü tablo */}
            <div className="ie-glass-flat hidden overflow-hidden rounded-[18px] lg:block">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-left text-[11px] font-semibold uppercase tracking-wide text-t3">
                    <th className="px-4 py-3">Sembol</th><th className="px-4 py-3">Sektör</th>
                    <th className="px-4 py-3">Değerlendirme</th><th className="px-4 py-3 text-right">Kalite</th>
                    <th className="px-4 py-3 text-right">Faal. marjı</th><th className="px-4 py-3 text-right">Faiz karş.</th>
                    <th className="px-4 py-3">Uyarı</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const v = VERDICT[r.verdict] ?? VERDICT['belirsiz']!;
                    return (
                      <tr key={r.sembol} className="border-b border-hairline/60 last:border-0 hover:bg-fill">
                        <td className="px-4 py-2.5"><Link href={`/hisse/${r.sembol}`} className="font-bold text-ink hover:text-ai">{r.sembol}</Link></td>
                        <td className="px-4 py-2.5 text-t3">{r.sektorAdi}</td>
                        <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: v.bg, color: v.color }}>{v.label}</span></td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold" style={{ color: scoreColor(r.score) }}>{r.score}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-t2">{pct(r.operatingMargin)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${r.interestCoverage != null && r.interestCoverage < 1.5 ? 'text-down' : 'text-t2'}`}>{cov(r.interestCoverage)}</td>
                        <td className="px-4 py-2.5 text-[11px] text-warn">{r.redFlag ?? (r.financeBurden ? 'finansman yükü' : '')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobil kartlar */}
            <div className="flex flex-col gap-2 lg:hidden">
              {shown.map((r) => {
                const v = VERDICT[r.verdict] ?? VERDICT['belirsiz']!;
                return (
                  <Link key={r.sembol} href={`/hisse/${r.sembol}`} className="ie-glass-flat flex items-center gap-3 rounded-[14px] px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-ink">{r.sembol}</span>
                        <span className="rounded-full px-1.5 py-px text-[9px] font-bold" style={{ background: v.bg, color: v.color }}>{v.label}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-t3">{r.sektorAdi} · marj {pct(r.operatingMargin)} · faiz {cov(r.interestCoverage)}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[16px] font-bold" style={{ color: scoreColor(r.score) }}>{r.score}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <YasalFeragat className="mt-2" />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="ie-glass-flat rounded-[14px] px-3.5 py-3">
      <div className="text-[10px] font-medium text-t3 lg:text-[11px]">{label}</div>
      <div className="mt-0.5 font-mono text-[20px] font-bold" style={{ color: color ?? 'var(--ink)' }}>{value}</div>
    </div>
  );
}
