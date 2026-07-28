'use client';

/**
 * Geçmiş Fırsatlar — yeni tasarım (AppShell).
 * Geçmiş sinyallerin GERÇEKLEŞEN performansı (kaçırılan fırsatlar / isabet oranı).
 * Veri: /api/gecmis-firsatlar (evaluate motoru forward-return'leri; BIST varsayılan).
 * NOT: return7d sıralaması "en büyük kazananlar" listesidir → yüksek getiriler
 * beklenen; winRate seçim yanlılığı taşımasın diye ayrı 'En yeni' sıralaması sunulur.
 * Emir dili YOK (nötr: Yukarı/Aşağı, Kazandı/Kaybetti — geçmiş olgu, tavsiye değil).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { GecmisFirsatlarResponse, GecmisFirsat } from '@/app/api/gecmis-firsatlar/route';
import YasalFeragat from '@/components/new/YasalFeragat';

type Sort = 'return7d' | 'return30d' | 'date' | 'confluence';
type Dir = 'all' | 'yukari' | 'asagi';

const SORTS: { k: Sort; label: string }[] = [
  { k: 'return7d', label: 'En iyi 7g' },
  { k: 'return30d', label: 'En iyi 30g' },
  { k: 'date', label: 'En yeni' },
  { k: 'confluence', label: 'Confluence' },
];
const DAYS: { k: string; label: string }[] = [
  { k: '30', label: '30 gün' },
  { k: '90', label: '90 gün' },
  { k: '180', label: '180 gün' },
];
const DIRS: { k: Dir; label: string }[] = [
  { k: 'all', label: 'Tümü' },
  { k: 'yukari', label: 'Yukarı' },
  { k: 'asagi', label: 'Aşağı' },
];

function pct(v: number | null, net = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const p = v * 100 - (net ? 0.4 : 0);
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
}
function dirLabel(d: string | null): string {
  return d === 'asagi' ? 'Aşağı' : d === 'yukari' ? 'Yukarı' : 'Nötr';
}
function retColor(v: number | null): string {
  if (v == null) return 'text-t3';
  return v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-t2';
}

export function GecmisFirsatlarScreen() {
  const [data, setData] = useState<GecmisFirsatlarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('90');
  const [sort, setSort] = useState<Sort>('return7d');
  const [dir, setDir] = useState<Dir>('all');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ days, sort, direction: dir, minConfluence: '60', limit: '200' });
    fetch(`/api/gecmis-firsatlar?${params}`)
      .then((r) => (r.ok ? (r.json() as Promise<GecmisFirsatlarResponse>) : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days, sort, dir]);

  useEffect(() => { load(); }, [load]);

  // Yön-düzeltmeli görünüm: 'asagi' sinyalde fiyat düşüşü KAZANÇtır → ham return
  // işareti çevrilir. Böylece gösterilen % ile "Kazandı/Kaybetti" tutarlı olur ve
  // sıralama başarısız short'ları "en iyi" göstermez (winRate zaten yön-düzeltmeli).
  const adj = (v: number | null, d: string | null): number | null =>
    v == null || !Number.isFinite(v) ? null : d === 'asagi' ? -v : v;

  const view = useMemo(() => {
    const rows = (data?.items ?? []).map((it) => ({
      ...it,
      adj7: adj(it.return_7d, it.direction),
      adj30: adj(it.return_30d, it.direction),
    }));
    if (sort === 'return7d') rows.sort((a, b) => (b.adj7 ?? -Infinity) - (a.adj7 ?? -Infinity));
    else if (sort === 'return30d') rows.sort((a, b) => (b.adj30 ?? -Infinity) - (a.adj30 ?? -Infinity));
    const evRows = rows.filter((r) => r.evaluated);
    const ev7 = evRows.filter((r) => r.adj7 != null) as (typeof rows[number] & { adj7: number })[];
    const wins = rows.filter((r) => r.isWinner === true).length;
    const avg = ev7.length ? ev7.reduce((s, r) => s + r.adj7, 0) / ev7.length : null;
    let best: number | null = null; let bestSym: string | null = null;
    for (const r of ev7) if (best == null || r.adj7 > best) { best = r.adj7; bestSym = r.sembol; }
    return {
      rows,
      total: rows.length,
      evaluated: evRows.length,
      winners: wins,
      winRate: evRows.length ? (wins / evRows.length) * 100 : null,
      avg,
      best,
      bestSym,
    };
  }, [data, sort]);

  const stats = view;
  const items = view.rows;

  const statCards = (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
      <div className="ie-glass-flat rounded-[14px] px-3.5 py-3">
        <div className="text-[10px] font-medium text-t3 lg:text-[11px]">İsabet oranı</div>
        <div className="mt-0.5 font-mono text-[20px] font-bold text-up">{stats?.winRate != null ? `%${stats.winRate.toFixed(0)}` : '—'}</div>
        <div className="text-[10px] text-t4">{stats ? `${stats.winners}/${stats.evaluated} kazandı` : ''}</div>
      </div>
      <div className="ie-glass-flat rounded-[14px] px-3.5 py-3">
        <div className="text-[10px] font-medium text-t3 lg:text-[11px]">Ort. 7g getiri</div>
        <div className={`mt-0.5 font-mono text-[20px] font-bold ${retColor(stats.avg)}`}>{pct(stats.avg)}</div>
      </div>
      <div className="ie-glass-flat rounded-[14px] px-3.5 py-3">
        <div className="text-[10px] font-medium text-t3 lg:text-[11px]">En iyi 7g</div>
        <div className="mt-0.5 font-mono text-[20px] font-bold text-up">{pct(stats.best)}</div>
        <div className="truncate text-[10px] text-t4">{stats.bestSym ?? ''}</div>
      </div>
      <div className="ie-glass-flat rounded-[14px] px-3.5 py-3">
        <div className="text-[10px] font-medium text-t3 lg:text-[11px]">Değerlendirilen</div>
        <div className="mt-0.5 font-mono text-[20px] font-bold text-ink">{stats?.evaluated ?? '—'}</div>
        <div className="text-[10px] text-t4">{stats ? `${stats.total} sinyal` : ''}</div>
      </div>
    </div>
  );

  const chipRow = <T extends string>(opts: { k: T; label: string }[], val: T, set: (v: T) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button
          key={o.k}
          onClick={() => set(o.k)}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            val === o.k ? 'bg-ink text-onink' : 'border border-hairline text-t2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative min-h-full px-6 py-5 lg:px-7 lg:py-[22px]">
      <div>
        <h1 className="text-[25px] font-extrabold tracking-[-0.03em] text-ink lg:text-[27px]">Geçmiş Fırsatlar</h1>
        <p className="mt-1 text-[13px] font-medium text-t3">Geçmiş sinyallerin gerçekleşen performansı — kaçırılan fırsatlar ve isabet oranı.</p>
      </div>

      <div className="mt-4 flex flex-col gap-3.5 lg:mt-5">
        {statCards}

        <div className="flex flex-col gap-2.5">
          {chipRow(SORTS, sort, setSort)}
          <div className="flex flex-wrap gap-2.5">
            {chipRow(DAYS, days, setDays)}
            {chipRow(DIRS, dir, setDir)}
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="ie-glass h-[300px] animate-pulse rounded-[18px]" />
        ) : items.length === 0 ? (
          <div className="ie-glass-flat rounded-[18px] px-5 py-10 text-center text-[13px] font-medium text-t3">
            Bu filtrelerde değerlendirilmiş sinyal yok.
          </div>
        ) : (
          <>
            {/* Masaüstü tablo */}
            <div className="ie-glass-flat hidden overflow-hidden rounded-[18px] lg:block">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-left text-[11px] font-semibold uppercase tracking-wide text-t3">
                    <th className="px-4 py-3">Sembol</th>
                    <th className="px-4 py-3">Sinyal</th>
                    <th className="px-4 py-3">Yön</th>
                    <th className="px-4 py-3 text-right">Confluence</th>
                    <th className="px-4 py-3 text-right">7g</th>
                    <th className="px-4 py-3 text-right">30g</th>
                    <th className="px-4 py-3 text-right">Yaş</th>
                    <th className="px-4 py-3 text-center">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-hairline/60 last:border-0 hover:bg-fill">
                      <td className="px-4 py-2.5">
                        <Link href={`/hisse/${it.sembol}`} className="font-bold text-ink hover:text-ai">{it.sembol}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-t2">{it.signal_type}</td>
                      <td className="px-4 py-2.5 text-t3">{dirLabel(it.direction)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-t2">{it.confluence_score ?? '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-bold ${retColor(it.adj7)}`}>{pct(it.adj7)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${retColor(it.adj30)}`}>{pct(it.adj30)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-t3">{it.daysAgo}g</td>
                      <td className="px-4 py-2.5 text-center">
                        {it.isWinner == null ? (
                          <span className="text-[11px] text-t4">bekliyor</span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${it.isWinner ? 'bg-up/12 text-up' : 'bg-down/12 text-down'}`}>
                            {it.isWinner ? 'Kazandı' : 'Kaybetti'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobil kartlar */}
            <div className="flex flex-col gap-2 lg:hidden">
              {items.map((it) => (
                <Link key={it.id} href={`/hisse/${it.sembol}`} className="ie-glass-flat flex items-center gap-3 rounded-[14px] px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold text-ink">{it.sembol}</span>
                      {it.isWinner != null && (
                        <span className={`rounded-full px-1.5 py-px text-[9px] font-bold ${it.isWinner ? 'bg-up/12 text-up' : 'bg-down/12 text-down'}`}>
                          {it.isWinner ? 'Kazandı' : 'Kaybetti'}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-t3">{it.signal_type} · {dirLabel(it.direction)} · {it.daysAgo}g önce</div>
                  </div>
                  <div className={`shrink-0 font-mono text-[15px] font-bold ${retColor(it.adj7)}`}>{pct(it.adj7)}</div>
                </Link>
              ))}
            </div>
          </>
        )}

        <YasalFeragat className="mt-2" />
      </div>
    </div>
  );
}
