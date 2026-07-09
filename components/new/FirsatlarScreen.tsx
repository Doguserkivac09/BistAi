'use client';

/**
 * "Fırsatlar v2" ekranı (design_handoff_firsatlar, liquid glass) — hi-fi.
 * Yatırım radarı: özet şerit (Bugün yeni / Ort. skor / En güçlü sektör) + filtre
 * çipleri + "Günün Fırsatı" öne çıkan kart (skor halkası + gerçek OHLCV sparkline
 * + gerekçe) + sıralı radar (mobil kart / masaüstü tablo) + kategori dağılımı.
 * Pastel ambient + frosted cam (globals.css: ie-ambient, ie-glass, ie-glass-feature).
 *
 * Veri: /api/firsatlar (adjustedScore, decision, catalyst, tavan, sinyaller, sektör)
 * + öne çıkan sembol için /api/ohlcv (tek çağrı, gerçek sparkline). Açık/karanlık tema.
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

const VC: Record<string, string> = {
  'Güçlü Al': '#16a35b', Al: '#4aa84a', Tut: '#c98a00', Sat: '#e5484d', 'Güçlü Sat': '#d23b40',
};

const fmtPrice = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const pctColor = (v: number | null) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');
const clamp = (v: number) => Math.max(0, Math.min(100, v));

function matchesFilter(it: FirsatItem, f: Filtre): boolean {
  if (f === 'tumu') return true;
  if (f === 'momentum') return it.direction === 'yukari' && it.adjustedScore >= 55;
  if (f === 'akilli') return (it.adjustments?.volumeConfirm ?? 0) > 0 || it.tavanYaklasıyor || it.isTavan;
  if (f === 'katalist') return it.catalyst != null;
  return true;
}

function reasonOf(it: FirsatItem): string {
  const parts: string[] = [];
  if (it.sinyaller?.length) parts.push(it.sinyaller.slice(0, 2).join(', '));
  if (it.catalyst) parts.push('haber katalisti destekli');
  if (it.weeklyAligned) parts.push('haftalık trend uyumlu');
  if (it.tavanYaklasıyor || it.isTavan) parts.push('tavana yakın');
  if (parts.length === 0) parts.push(`${it.sektorAdi} · çoklu faktör skoru ${Math.round(it.adjustedScore)}`);
  return parts.join(' · ');
}

function tagsOf(it: FirsatItem): string[] {
  const t: string[] = [];
  if (it.tavanYaklasıyor || it.isTavan) t.push('⚡ Tavan yakın');
  if (it.catalyst) t.push('🗞️ Katalist');
  if (it.weeklyAligned) t.push('Haftalık ✓');
  if (it.sinyaller?.[0] && t.length < 3) t.push(it.sinyaller[0]);
  return t.slice(0, 3);
}

/** SVG skor halkası (stroke-dasharray). */
function ScoreRing({ size, score, color = '#16a35b' }: { size: number; score: number; color?: string }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamp(score) / 100) * c;
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(22,163,91,0.15)" strokeWidth={stroke} />
      <circle
        cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash.toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text x={cx} y={cx - 2} textAnchor="middle" className="fill-ink font-mono" style={{ fontSize: size * 0.26, fontWeight: 700 }}>
        {Math.round(score)}
      </text>
      <text x={cx} y={cx + size * 0.18} textAnchor="middle" className="fill-t3" style={{ fontSize: size * 0.12, fontWeight: 600, letterSpacing: '0.08em' }}>
        SKOR
      </text>
    </svg>
  );
}

function buildSpark(vals: number[], w: number, h: number, pad = 3) {
  if (vals.length < 2) return { line: '', area: '' };
  const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / (vals.length - 1);
    const y = pad + (h - 2 * pad) * (1 - (v - min) / rng);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = 'M' + pts.join(' L');
  const area = `${line} L ${(w - pad).toFixed(1)} ${(h - pad).toFixed(1)} L ${pad.toFixed(1)} ${(h - pad).toFixed(1)} Z`;
  return { line, area };
}

function RadarRow({ it, rank }: { it: FirsatItem; rank: number }) {
  const rating = it.decision?.rating ?? 'Tut';
  const color = VC[rating] ?? '#8a909b';
  return (
    <Link
      href={`/hisse/${it.sembol}`}
      className="ie-glass flex items-center gap-3 rounded-[16px] px-3.5 py-3 transition-colors hover:border-white lg:gap-0 lg:rounded-[12px] lg:px-4 lg:py-3"
    >
      <span className="w-4 shrink-0 font-mono text-[12px] font-semibold text-t3 lg:w-7">{rank}</span>
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-white/70 bg-white/70 font-mono text-[11px] font-semibold text-ink lg:mr-3">
        {it.sembol.slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1 lg:flex-[1.6]">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-ink">{it.sembol}</span>
          <span className="shrink-0 rounded-[7px] px-[7px] py-[2px] text-[10px] font-extrabold" style={{ background: `${color}22`, color }}>
            {rating}
          </span>
          <span className="font-mono text-[12px] font-semibold lg:hidden" style={{ color: pctColor(it.changePercent) }}>
            {fmtPct(it.changePercent)}
          </span>
        </div>
        <div className="truncate text-[11px] font-medium text-t3">{it.sektorAdi}</div>
      </div>
      {/* Masaüstü fiyat + değişim */}
      <span className="hidden flex-1 text-right font-mono text-[13px] font-semibold text-ink lg:block">
        {fmtPrice(it.entryPrice)} ₺
      </span>
      <span className="hidden flex-1 text-right font-mono text-[13px] font-semibold lg:block" style={{ color: pctColor(it.changePercent) }}>
        {fmtPct(it.changePercent)}
      </span>
      {/* Skor barı */}
      <div className="flex shrink-0 items-center gap-2 lg:flex-[1.6] lg:gap-3 lg:pl-5">
        <div className="h-[5px] w-[46px] overflow-hidden rounded-full bg-[rgba(80,90,120,0.14)] lg:h-[7px] lg:w-auto lg:flex-1 lg:rounded-[4px]">
          <div className="h-full rounded-full bg-ai" style={{ width: `${clamp(it.adjustedScore)}%` }} />
        </div>
        <span className="w-[26px] font-mono text-[12px] font-bold text-ink lg:text-[13px]">{Math.round(it.adjustedScore)}</span>
      </div>
    </Link>
  );
}

export function FirsatlarScreen() {
  const [items, setItems] = useState<FirsatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>('tumu');
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [featSpark, setFeatSpark] = useState<Record<string, number[]>>({});

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
  const featured = matched[0] ?? null;
  const rest = matched.slice(1, MAX);

  // Öne çıkan sembol için gerçek OHLCV sparkline (tek çağrı, sembol değişince)
  useEffect(() => {
    const sym = featured?.sembol;
    if (!sym || featSpark[sym]) return;
    const ctrl = new AbortController();
    fetch(`/api/ohlcv?symbol=${sym}&days=30`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { candles?: Array<{ close: number }> } | null) => {
        const closes = (d?.candles ?? []).map((c) => c.close).filter((v) => typeof v === 'number');
        if (closes.length >= 2) setFeatSpark((p) => ({ ...p, [sym]: closes }));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [featured?.sembol, featSpark]);

  const counts = useMemo(() => ({
    tumu: items.length,
    momentum: items.filter((it) => matchesFilter(it, 'momentum')).length,
    akilli: items.filter((it) => matchesFilter(it, 'akilli')).length,
    katalist: items.filter((it) => matchesFilter(it, 'katalist')).length,
  }), [items]);

  // Özet: bugün yeni · ort. skor · en güçlü sektör
  const newToday = items.filter((it) => it.ageHours != null && it.ageHours < 24).length;
  const avgScore = items.length ? Math.round(items.reduce((s, it) => s + it.adjustedScore, 0) / items.length) : null;
  const topSector = useMemo(() => {
    const bySec = new Map<string, number>();
    for (const it of items) bySec.set(it.sektorAdi, (bySec.get(it.sektorAdi) ?? 0) + it.adjustedScore);
    let best: string | null = null, bestV = -1;
    for (const [sec, v] of bySec) if (v > bestV) { bestV = v; best = sec; }
    return best ? best.split(' & ')[0]! : '—';
  }, [items]);

  const catMax = Math.max(counts.momentum, counts.akilli, counts.katalist, 1);
  const dist = [
    { label: 'Momentum', n: counts.momentum, color: '#16a35b' },
    { label: 'Akıllı para', n: counts.akilli, color: '#6b6ff5' },
    { label: 'Katalist', n: counts.katalist, color: '#e0a92e' },
  ];

  const featReason = featured ? reasonOf(featured) : '';
  const featCloses = featured ? featSpark[featured.sembol] : undefined;

  // ── Paylaşılan bloklar ──
  const summaryStrip = (
    <div className="flex gap-2.5 lg:gap-3">
      <div className="ie-glass-flat flex-1 rounded-[14px] px-3.5 py-3">
        <div className="text-[10px] font-medium text-t3 lg:text-[11px]">Bugün yeni</div>
        <div className="mt-0.5 font-mono text-[18px] font-bold text-ink lg:text-[20px]">{loading ? '…' : newToday}</div>
      </div>
      <div className="ie-glass-flat flex-1 rounded-[14px] px-3.5 py-3">
        <div className="text-[10px] font-medium text-t3 lg:text-[11px]">Ort. skor</div>
        <div className="mt-0.5 font-mono text-[18px] font-bold text-ai lg:text-[20px]">{avgScore ?? '—'}</div>
      </div>
      <div className="ie-glass-flat flex-[1.3] rounded-[14px] px-3.5 py-3 lg:flex-1">
        <div className="text-[10px] font-medium text-t3 lg:text-[11px]">En güçlü sektör</div>
        <div className="mt-1 truncate text-[13px] font-bold text-up lg:text-[15px]">{topSector}</div>
      </div>
    </div>
  );

  const filterChips = (
    <div className="flex flex-wrap gap-2">
      {FILTRELER.map((f) => {
        const active = filtre === f.id;
        return (
          <button
            key={f.id}
            onClick={() => setFiltre(f.id)}
            className={`flex items-center gap-1.5 rounded-[11px] px-3.5 py-2 text-[12px] font-semibold transition-colors ${
              active ? 'bg-ink text-onink' : 'ie-glass-flat text-t2 hover:text-ink'
            }`}
          >
            {f.label}
            <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${active ? 'bg-white/20' : 'text-t3'}`}>
              {counts[f.id]}
            </span>
          </button>
        );
      })}
    </div>
  );

  function FeaturedCard({ desktop }: { desktop?: boolean }) {
    if (!featured) return null;
    const featRating = featured.decision?.rating ?? 'Tut';
    const featColor = VC[featRating] ?? '#8a909b';
    const ringSize = desktop ? 60 : 58;
    const spark = buildSpark(featCloses ?? [], desktop ? 284 : 300, 44);
    return (
      <div className={`ie-glass-feature rounded-[20px] p-[18px] ${desktop ? '' : 'rounded-[22px] px-5 py-[18px]'}`}>
        <div className="flex items-center gap-2">
          <span className="rounded-[7px] bg-up px-[9px] py-[3px] text-[10px] font-bold tracking-[0.03em] text-white">GÜNÜN FIRSATI</span>
          {!desktop && <span className="text-[11px] font-semibold text-t3">en yüksek skor</span>}
        </div>
        <div className="mt-3.5 flex items-center gap-4">
          {!desktop && (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-white/70 bg-white/70 font-mono text-[13px] font-semibold text-ink">
              {featured.sembol.slice(0, 2)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[20px] font-extrabold tracking-[-0.02em] text-ink">{featured.sembol}</span>
              <span className="rounded-[7px] px-2 py-[3px] text-[11px] font-extrabold" style={{ background: `${featColor}22`, color: featColor }}>
                {featRating}
              </span>
              <span className="font-mono text-[13px] font-semibold" style={{ color: pctColor(featured.changePercent) }}>
                {fmtPct(featured.changePercent)}
              </span>
            </div>
            <div className="truncate text-[12px] font-medium text-t3">{featured.sektorAdi}</div>
          </div>
          <ScoreRing size={ringSize} score={featured.adjustedScore} />
        </div>

        {spark.line ? (
          <svg width="100%" height="44" viewBox={`0 0 ${desktop ? 284 : 300} 44`} preserveAspectRatio="none" className="mt-2">
            <defs>
              <linearGradient id={`feat-${featured.sembol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(22,163,91,0.24)" />
                <stop offset="1" stopColor="rgba(22,163,91,0)" />
              </linearGradient>
            </defs>
            <path d={spark.area} fill={`url(#feat-${featured.sembol})`} />
            <path d={spark.line} fill="none" stroke="#16a35b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className="mt-2 h-[44px]" />
        )}

        <p className="mt-2 text-[12px] font-medium leading-[1.55] text-t2">{featReason}</p>

        {desktop ? (
          <div className="mt-3.5 flex gap-2.5">
            <Link href={`/hisse/${featured.sembol}`} className="flex h-10 flex-1 items-center justify-center rounded-[12px] border border-[#e0e4ec] text-[13px] font-bold text-ink transition-colors hover:bg-white/60">
              İzle
            </Link>
            <Link href={`/hisse/${featured.sembol}`} className="flex h-10 flex-1 items-center justify-center rounded-[12px] bg-up text-[13px] font-bold text-white hover:opacity-95">
              Detay
            </Link>
          </div>
        ) : (
          <div className="mt-3 flex gap-1.5">
            {tagsOf(featured).map((t) => (
              <span key={t} className="rounded-[8px] border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-t2">{t}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[50px] -top-[50px] h-[250px] w-[280px] blur-[24px]" style={{ background: 'radial-gradient(circle,rgba(107,111,245,0.2),rgba(107,111,245,0) 68%)' }} />
        <div className="absolute -right-[60px] -top-[30px] h-[230px] w-[280px] blur-[26px]" style={{ background: 'radial-gradient(circle,rgba(22,163,91,0.18),rgba(22,163,91,0) 66%)' }} />
        <div className="absolute left-[30%] top-[40%] h-[280px] w-[280px] blur-[32px]" style={{ background: 'radial-gradient(circle,rgba(255,183,120,0.13),rgba(255,183,120,0) 70%)' }} />
      </div>

      <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
        {/* Başlık + Canlı çipi */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[22px]">
              Fırsatlar <span className="hidden text-[13px] font-semibold text-t3 lg:inline">· Yatırım radarı</span>
            </h1>
            <p className="mt-0.5 text-[12px] font-medium text-t3">
              Yatırım radarı · {items.length} aktif sinyal
              {refreshedAt && ` · ${new Date(refreshedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
          <div className="flex items-center gap-[7px] rounded-[10px] border border-up/20 bg-up/[0.12] px-[11px] py-[6px]">
            <span className="h-1.5 w-1.5 rounded-full bg-up" />
            <span className="text-[10px] font-bold text-up">Canlı</span>
          </div>
        </div>

        {/* Masaüstü filtre çipleri (sağ üst) — mobilde aşağıda */}
        <div className="mt-4 hidden lg:mt-5 lg:block">{filterChips}</div>

        <div className="mt-4 flex flex-col gap-3.5 lg:mt-5 lg:flex-row lg:gap-6">
          {/* Sol: özet + radar */}
          <div className="flex min-w-0 flex-col gap-3.5 lg:flex-[1.7] lg:gap-4">
            {summaryStrip}

            {/* Mobil: filtre + öne çıkan kart */}
            <div className="lg:hidden">{filterChips}</div>
            <div className="lg:hidden">
              {loading ? <div className="ie-glass h-[220px] animate-pulse rounded-[22px]" /> : <FeaturedCard />}
            </div>

            {/* Sıralı radar başlığı */}
            <div className="flex items-center justify-between lg:mt-1">
              <span className="text-[15px] font-extrabold tracking-[-0.02em] text-ink lg:text-[16px]">Sıralı radar</span>
              <span className="text-[11px] font-semibold text-t3">Skora göre</span>
            </div>

            {/* Masaüstü tablo başlığı */}
            <div className="hidden border-b border-[rgba(80,90,120,0.14)] px-4 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3 lg:flex">
              <span className="w-7">#</span>
              <span className="ml-[50px] flex-[1.6]">Sembol</span>
              <span className="flex-1 text-right">Fiyat</span>
              <span className="flex-1 text-right">Değişim</span>
              <span className="flex-[1.6] pl-5">Skor</span>
            </div>

            <div className="flex flex-col gap-2.5 lg:gap-1">
              {loading ? (
                [...Array(6)].map((_, i) => <div key={i} className="ie-glass h-[64px] animate-pulse rounded-[16px]" />)
              ) : matched.length === 0 ? (
                <div className="ie-glass rounded-[16px] px-4 py-10 text-center text-[13px] font-medium text-t2">
                  Bu filtrede fırsat bulunamadı.
                </div>
              ) : (
                <>
                  {/* Masaüstü: #1 dahil tam liste; Mobil: öne çıkan zaten üstte → kalanı */}
                  <div className="hidden lg:flex lg:flex-col lg:gap-1">
                    {matched.slice(0, MAX).map((it, i) => <RadarRow key={it.sembol} it={it} rank={i + 1} />)}
                  </div>
                  <div className="flex flex-col gap-2.5 lg:hidden">
                    {rest.map((it, i) => <RadarRow key={it.sembol} it={it} rank={i + 2} />)}
                  </div>
                </>
              )}
            </div>

            {!loading && matched.length > MAX && (
              <p className="mt-1 text-center text-[12px] font-medium text-t3">
                En yüksek skorlu {MAX} gösteriliyor · toplam {matched.length} fırsat
              </p>
            )}
          </div>

          {/* Sağ ray (masaüstü): öne çıkan + kategori dağılımı */}
          <div className="hidden w-[320px] shrink-0 flex-col gap-3.5 lg:flex">
            {loading ? <div className="ie-glass h-[260px] animate-pulse rounded-[20px]" /> : <FeaturedCard desktop />}

            <div className="ie-glass flex flex-1 flex-col rounded-[18px] px-[18px] py-4">
              <div className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">Kategori dağılımı</div>
              <div className="mt-3.5 flex flex-col gap-3">
                {dist.map((d) => (
                  <div key={d.label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-t2">{d.label}</span>
                      <span className="font-mono text-[12px] font-semibold" style={{ color: d.color }}>{d.n}</span>
                    </div>
                    <div className="h-[6px] overflow-hidden rounded-[3px] bg-[rgba(80,90,120,0.12)]">
                      <div className="h-full rounded-[3px]" style={{ width: `${(d.n / catMax) * 100}%`, background: d.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex-1" />
              <p className="mt-3 text-[11px] font-medium leading-[1.5] text-t3">
                Skorlar teknik + makro + sektör + temel + katalist birleşimidir. Yatırım tavsiyesi değildir.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] font-medium italic text-t4 lg:hidden">
          Skor = teknik + makro + sektör + temel + katalist (kural-tabanlı). Yatırım tavsiyesi değildir.
        </p>
      </div>
    </div>
  );
}
