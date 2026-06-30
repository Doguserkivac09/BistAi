'use client';

/**
 * "Fırsatlar" ekranı (design_handoff_bistai/bistAI Sayfalar.dc.html) — hi-fi.
 * Yatırım radarı / tarama. Filtre çipleri + fırsat satırları (skor barı + verdict + etiketler).
 * Gerçek /api/firsatlar verisi (adjustedScore, decision, catalyst, tavan). Açık tema.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { FirsatItem, FirsatlarResponse } from '@/app/api/firsatlar/route';

type Filtre = 'tumu' | 'momentum' | 'akilli' | 'katalist';

const FILTRELER: { id: Filtre; label: string }[] = [
  { id: 'tumu', label: 'Tümü' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'akilli', label: 'Akıllı Para' },
  { id: 'katalist', label: 'Katalist' },
];

// decision.rating → renk
const VC: Record<string, string> = {
  'Güçlü Al': '#16a35b', Al: '#4aa84a', Tut: '#c98a00', Sat: '#e5484d', 'Güçlü Sat': '#d23b40',
};

function fmtPrice(v: number | null): string {
  return v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
const pctColor = (v: number | null) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');

function tagsOf(it: FirsatItem): string[] {
  const t: string[] = [];
  if (it.tavanYaklasıyor || it.isTavan) t.push('⚡ Tavan yakın');
  if (it.catalyst) t.push('🗞️ Katalist');
  if (it.weeklyAligned) t.push('Haftalık ✓');
  if (it.sinyaller?.[0] && t.length < 3) t.push(it.sinyaller[0]);
  return t.slice(0, 3);
}

function matchesFilter(it: FirsatItem, f: Filtre): boolean {
  if (f === 'tumu') return true;
  if (f === 'momentum') return it.direction === 'yukari' && it.adjustedScore >= 55;
  if (f === 'akilli') return (it.adjustments?.volumeConfirm ?? 0) > 0 || it.tavanYaklasıyor || it.isTavan;
  if (f === 'katalist') return it.catalyst != null;
  return true;
}

function Row({ it }: { it: FirsatItem }) {
  const rating = it.decision?.rating ?? 'Tut';
  const color = VC[rating] ?? '#8a909b';
  const tags = tagsOf(it);
  return (
    <Link
      href={`/hisse/${it.sembol}`}
      className="flex items-center gap-3.5 rounded-[18px] border border-hairline bg-panel px-4 py-[14px] transition-colors hover:border-[#e3e5e8] lg:gap-4 lg:px-[18px]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-fill font-mono text-[12px] font-semibold text-ink">
        {it.sembol.slice(0, 2)}
      </span>
      <div className="min-w-0 lg:w-[160px] lg:shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-ink">{it.sembol}</span>
          <span className="font-mono text-[12px] font-semibold lg:hidden" style={{ color: pctColor(it.changePercent) }}>
            {fmtPct(it.changePercent)}
          </span>
        </div>
        <div className="truncate text-[12px] font-medium text-t3">{it.sektorAdi}</div>
      </div>

      {/* Skor barı (mürdüm) */}
      <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
        <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-fill">
          <div className="h-full rounded-full bg-ai" style={{ width: `${Math.max(0, Math.min(100, it.adjustedScore))}%` }} />
        </div>
        <span className="w-8 shrink-0 font-mono text-[13px] font-bold text-ink">{Math.round(it.adjustedScore)}</span>
      </div>

      {/* Etiketler */}
      <div className="hidden shrink-0 gap-1.5 lg:flex">
        {tags.map((t) => (
          <span key={t} className="rounded-[8px] bg-fill px-2 py-1 text-[10px] font-semibold text-t2">{t}</span>
        ))}
      </div>

      <span className="hidden w-[78px] shrink-0 text-right font-mono text-[13px] font-semibold text-ink lg:block">
        {fmtPrice(it.entryPrice)} ₺
      </span>
      <span className="hidden w-[60px] shrink-0 text-right font-mono text-[13px] font-semibold lg:block" style={{ color: pctColor(it.changePercent) }}>
        {fmtPct(it.changePercent)}
      </span>

      {/* Mobil: skor + verdict */}
      <div className="flex shrink-0 flex-col items-end gap-1 lg:w-[88px]">
        <span className="rounded-[9px] px-[10px] py-[5px] text-[12px] font-extrabold" style={{ background: `${color}22`, color }}>
          {rating}
        </span>
        <span className="font-mono text-[11px] font-semibold text-t3 lg:hidden">skor {Math.round(it.adjustedScore)}</span>
      </div>
    </Link>
  );
}

export function FirsatlarScreen() {
  const [items, setItems] = useState<FirsatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>('tumu');
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/firsatlar')
      .then((r) => r.json() as Promise<FirsatlarResponse>)
      .then((j) => { setItems(j.firsatlar ?? []); setRefreshedAt(j.lastRefreshedAt ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const MAX = 50;
  const matched = useMemo(
    () => items.filter((it) => matchesFilter(it, filtre)).sort((a, b) => b.adjustedScore - a.adjustedScore),
    [items, filtre],
  );
  const filtered = matched.slice(0, MAX);

  const counts = useMemo(() => ({
    tumu: items.length,
    momentum: items.filter((it) => matchesFilter(it, 'momentum')).length,
    akilli: items.filter((it) => matchesFilter(it, 'akilli')).length,
    katalist: items.filter((it) => matchesFilter(it, 'katalist')).length,
  }), [items]);

  return (
    <div className="px-6 py-6 lg:px-7 lg:py-[26px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[28px]">Fırsatlar</h1>
          <p className="mt-[3px] text-[13px] font-medium text-t3 lg:text-[14px]">
            Çoklu faktör skoruyla taranan hisseler
            {refreshedAt && ` · son güncelleme ${new Date(refreshedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
      </div>

      {/* Filtre çipleri */}
      <div className="mt-[18px] flex flex-wrap gap-2">
        {FILTRELER.map((f) => {
          const active = filtre === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFiltre(f.id)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[13px] font-semibold transition-colors ${
                active ? 'bg-ink text-white' : 'bg-fill text-t2 hover:text-ink'
              }`}
            >
              {f.label}
              <span className={`rounded-full px-1.5 py-px text-[10px] ${active ? 'bg-white/20' : 'bg-white/70 text-t3'}`}>
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Liste */}
      <div className="mt-5 flex flex-col gap-[11px]">
        {loading ? (
          [...Array(6)].map((_, i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-hairline bg-panel" />)
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-hairline bg-panel px-4 py-10 text-center text-[13px] font-medium text-t2">
            Bu filtrede fırsat bulunamadı.
          </div>
        ) : (
          filtered.map((it) => <Row key={it.sembol} it={it} />)
        )}
      </div>

      {!loading && matched.length > MAX && (
        <p className="mt-4 text-center text-[12px] font-medium text-t3">
          En yüksek skorlu {MAX} gösteriliyor · toplam {matched.length} fırsat
        </p>
      )}
      <p className="mt-6 text-center text-[10px] font-medium italic text-t4">
        Skor = teknik + makro + sektör + temel + katalist (kural-tabanlı). Yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}
