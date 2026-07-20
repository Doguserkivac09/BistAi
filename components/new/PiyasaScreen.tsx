'use client';

/**
 * "Piyasa" hub ekranı (design_handoff_piyasa_hub, liquid glass) — hi-fi.
 * Eski tek-görünüm makro sayfasının yerine 3 sekmeli hub geldi: Sektörler ·
 * Emtia · Gündem. Eski basit makro kart görünümü Emtia sekmesinin "Makro
 * göstergeler" rayına taşındı — hiçbir veri kaybolmadı.
 *
 * Veri: /api/sectors (sektör rotasyonu) + /api/movers (öne çıkanlar) +
 * /api/macro (+history, emtia/makro) + /api/haber + /api/kap (gündem) +
 * lib/ekonomi-takvimi (ekonomi takvimi, ENABLE_ECONOMIC_CALENDAR flag'i
 * arkasında — /haberler sayfasındaki ile aynı davranış).
 *
 * Dürüstlük notu: handoff'un Emtia grid'i "Gram/Ons altın, Brent, USD/TRY,
 * EUR/TRY, BIST 100, gümüş, Bitcoin" istiyor. /api/macro'da EUR/TRY ve
 * Bitcoin YOK (gerçek kaynak yok, uydurma veri yasak) — bunların yerine
 * mevcut 6 gerçek enstrüman (Altın/Gümüş/Brent/USD-TRY/BIST100/EM ETF)
 * kullanıldı. Sektör tablosunda spec "günlük%/haftalık%" istiyor ama
 * /api/sectors yalnızca perf20d/perf60d döndürüyor — kolonlar dürüstçe
 * "20G/60G" etiketlendi.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ENABLE_ECONOMIC_CALENDAR } from '@/lib/flags';
import { EKONOMI_EVENTS } from '@/lib/ekonomi-takvimi';
import type { HaberItem } from '@/app/api/haber/route';
import type { KapDuyuru } from '@/lib/kap';

interface Quote { price: number; changePercent: number; name: string }
interface MacroResp {
  indicators?: Partial<Record<'usdtry' | 'gold' | 'brent' | 'vix' | 'dxy' | 'us10y' | 'silver' | 'eem' | 'bist100', Quote | null>>;
  turkey?: { policyRate: { value: number } | null; cds5y: { value: number } | null; inflation: { value: number } | null; bond10y: { value: number } | null };
}
type MacroHistRow = Record<'gold' | 'silver' | 'brent' | 'usdtry' | 'bist100' | 'eem', number | null> & { snapshot_date: string };
interface MacroHistResp { history?: MacroHistRow[] }
interface SymbolPerf { symbol: string; perf20d: number }
interface Sector {
  sectorId: string; shortName: string; sectorName: string; perf20d: number; perf60d: number;
  compositeScore: number; signal: string; reasoning: string;
  topPerformers?: SymbolPerf[]; bottomPerformers?: SymbolPerf[];
}
interface SectorsResp { sectors?: Sector[] }
interface Mover { sembol: string; changePercent: number; lastClose: number | null; sectorName: string | null }
interface MoversResp { gainers?: Mover[]; losers?: Mover[] }

const fmtNum = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const col = (v: number | null | undefined) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');

const SIGNAL_META: Record<string, { label: string; color: string }> = {
  strong_buy: { label: 'Güçlü Al', color: '#16a35b' },
  buy: { label: 'Al', color: '#4aa84a' },
  neutral: { label: 'Nötr', color: '#c98a00' },
  sell: { label: 'Sat', color: '#e5484d' },
  strong_sell: { label: 'Güçlü Sat', color: '#e5484d' },
};

function DivergingBar({ v }: { v: number }) {
  const MAX = 60; // ±60 kompozit skor = yarı genişlik dolu
  const w = Math.min(Math.abs(v) / MAX, 1) * 50;
  const pos = v >= 0;
  return (
    <div className="relative h-[7px] w-full overflow-hidden rounded-full bg-fill">
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-hairline" />
      <div className="absolute top-0 h-full rounded-full" style={{ background: pos ? '#16a35b' : '#e5484d', width: `${w}%`, left: pos ? '50%' : `${50 - w}%` }} />
    </div>
  );
}

function AreaSpark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-[46px]" />;
  const w = 200, h = 46;
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => [((i / (values.length - 1)) * w), (h - ((v - min) / rng) * (h - 6) - 3)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const gid = `grad-${color.replace('#', '')}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Emtia/döviz teknik durumu — kartın KENDİ geçmiş serisinden (macro history) türetilir.
 * Ölçüt: son fiyat dönem ortalamasının üstünde mi (trend) + son ~5 günlük momentum.
 * Bilinçli olarak "AL/SAT" demez: bu bir teknik durum tespiti, yatırım tavsiyesi değil
 * (sitenin geri kalanıyla aynı dil). Seri kısaysa (<6) hiç etiket gösterilmez.
 */
function trendVerdict(series: number[]): { label: string; color: string; note: string } | null {
  if (series.length < 6) return null;
  const last = series[series.length - 1]!;
  const ref = series[series.length - 6]!;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const mom5 = ref !== 0 ? ((last - ref) / ref) * 100 : 0;
  const above = last > mean;
  const note = `${above ? 'Ort. üstünde' : 'Ort. altında'} · 5g ${mom5 >= 0 ? '+' : ''}${mom5.toFixed(1)}%`;
  if (above && mom5 > 2) return { label: 'Güçlü', color: '#16a35b', note };
  if (above) return { label: 'Yükselişte', color: '#4aa84a', note };
  if (mom5 < -2) return { label: 'Zayıf', color: '#e5484d', note };
  return { label: 'Yatay', color: '#c98a00', note };
}

type PiyasaTab = 'sektorler' | 'emtia' | 'gundem';
const TABS: { key: PiyasaTab; label: string }[] = [
  { key: 'sektorler', label: 'Sektörler' },
  { key: 'emtia', label: 'Emtia' },
  { key: 'gundem', label: 'Gündem' },
];

type GundemSrc = 'all' | 'haber' | 'kap' | 'takvim';

export function PiyasaScreen() {
  const [tab, setTab] = useState<PiyasaTab>('sektorler');

  // Sektörler
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [movers, setMovers] = useState<MoversResp | null>(null);
  const [sectorsLoading, setSectorsLoading] = useState(true);

  // Emtia
  const [macro, setMacro] = useState<MacroResp | null>(null);
  const [macroHist, setMacroHist] = useState<MacroHistRow[]>([]);
  const [emtiaLoading, setEmtiaLoading] = useState(true);

  // Gündem
  const [haberler, setHaberler] = useState<HaberItem[]>([]);
  const [kap, setKap] = useState<KapDuyuru[]>([]);
  const [gundemSrc, setGundemSrc] = useState<GundemSrc>('all');
  const [gundemLoading, setGundemLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/sectors').then((r) => r.json() as Promise<SectorsResp>),
      fetch('/api/movers').then((r) => (r.ok ? r.json() : null) as Promise<MoversResp | null>),
    ]).then(([s, m]) => {
      if (s.status === 'fulfilled') setSectors(s.value.sectors ?? []);
      if (m.status === 'fulfilled' && m.value) setMovers(m.value);
      setSectorsLoading(false);
    });

    Promise.allSettled([
      fetch('/api/macro').then((r) => r.json() as Promise<MacroResp>),
      fetch('/api/macro?history=true&days=20').then((r) => r.json() as Promise<MacroHistResp>),
    ]).then(([m, h]) => {
      if (m.status === 'fulfilled') setMacro(m.value);
      if (h.status === 'fulfilled') setMacroHist(h.value.history ?? []);
      setEmtiaLoading(false);
    });

    Promise.allSettled([
      fetch('/api/haber').then((r) => (r.ok ? r.json() : null) as Promise<{ haberler?: HaberItem[] } | null>),
      fetch('/api/kap').then((r) => (r.ok ? r.json() : null) as Promise<{ duyurular?: KapDuyuru[] } | null>),
    ]).then(([h, k]) => {
      if (h.status === 'fulfilled') setHaberler(h.value?.haberler ?? []);
      if (k.status === 'fulfilled') setKap(k.value?.duyurular ?? []);
      setGundemLoading(false);
    });
  }, []);

  const sortedSectors = useMemo(() => [...sectors].sort((a, b) => b.compositeScore - a.compositeScore), [sectors]);
  const bestSector = sortedSectors[0] ?? null;
  const worstSector = sortedSectors.length > 1 ? sortedSectors[sortedSectors.length - 1]! : null;
  const rotation = useMemo(() => {
    if (sectors.length === 0) return { label: '—', color: '#9aa0ad' };
    const bull = sectors.filter((s) => s.signal === 'strong_buy' || s.signal === 'buy').length;
    const bear = sectors.filter((s) => s.signal === 'sell' || s.signal === 'strong_sell').length;
    if (bull > bear * 1.5) return { label: 'Risk-On', color: '#16a35b' };
    if (bear > bull * 1.5) return { label: 'Risk-Off', color: '#e5484d' };
    return { label: 'Karışık', color: '#c98a00' };
  }, [sectors]);

  // ── Sektör para akışı ──────────────────────────────────────────────────────
  // "Para girişi" proxy'si: 20g performansı POZİTİF ve 20 günlük hız, 60 günlük
  // eşdeğer hızını (perf60d/3) AŞIYOR → son dönemde HIZLANAN sektör. Rotasyon
  // "Karışık" olsa bile paranın nereye aktığı böyle görünür. Çıkış: 20g negatif.
  const flow = useMemo(() => {
    if (sectors.length === 0) return null;
    const withAccel = sectors.map((s) => ({ s, accel: s.perf20d - s.perf60d / 3 }));
    return {
      inflow: withAccel.filter((x) => x.s.perf20d > 0 && x.accel > 0).sort((a, b) => b.accel - a.accel),
      outflow: withAccel.filter((x) => x.s.perf20d < 0).sort((a, b) => a.s.perf20d - b.s.perf20d),
    };
  }, [sectors]);

  // Sektör yorumu — engine'in sabit "Makro koşullar nötr" metni yerine gerçek analiz.
  // Düz metin değil ETİKETLİ satırlar döner: başlıklar kalın, değerler ayrı okunur.
  const sectorComment = useMemo(() => {
    if (!flow || !bestSector) return null;
    const names = (arr: typeof flow.inflow, n: number) =>
      arr.slice(0, n).map((x) => `${x.s.shortName} ${fmtPct(x.s.perf20d)}`).join(' · ');
    const lider = bestSector.topPerformers?.[0];
    return {
      rows: [
        flow.inflow.length > 0
          ? { label: 'Para girişi hızlanan sektörler', text: names(flow.inflow, 3), tone: 'up' as const }
          : { label: 'Para girişi', text: 'Hızlanan sektör yok — geniş tabanlı giriş görünmüyor.', tone: 'flat' as const },
        flow.outflow.length > 0
          ? { label: 'Para çıkışı olan sektörler', text: names(flow.outflow, 2), tone: 'down' as const }
          : null,
        lider
          ? { label: 'Lider sektörü taşıyan hisse', text: `${bestSector.shortName}: ${lider.symbol} ${fmtPct(lider.perf20d)}`, tone: 'flat' as const }
          : null,
      ].filter((x): x is { label: string; text: string; tone: 'up' | 'down' | 'flat' } => x !== null),
      sonuc:
        rotation.label === 'Risk-On'
          ? 'Genel eğilim risk alma yönünde — giriş olan sektörler geniş tabanlı.'
          : rotation.label === 'Risk-Off'
            ? 'Genel eğilim savunmacı — güçlü sektörler seçici kalıyor.'
            : 'Rotasyon karışık: yön tek yönlü değil. Giriş olan sektörlerde seçici davranmak gerekiyor.',
    };
  }, [flow, bestSector, rotation]);

  const ind = macro?.indicators ?? {};
  const tr = macro?.turkey;
  const seriesOf = (key: keyof Omit<MacroHistRow, 'snapshot_date'>) =>
    macroHist.map((r) => r[key]).filter((v): v is number => v != null);

  const EMTIA_CARDS = [
    { key: 'gold' as const, label: 'Altın (ons $)', q: ind.gold },
    { key: 'brent' as const, label: 'Brent ($)', q: ind.brent },
    { key: 'usdtry' as const, label: 'USD/TRY', q: ind.usdtry },
    { key: 'bist100' as const, label: 'BIST 100', q: ind.bist100 },
    { key: 'silver' as const, label: 'Gümüş (ons $)', q: ind.silver },
    { key: 'eem' as const, label: 'Gelişen Piyasalar (EEM)', q: ind.eem },
  ];

  const gundemFeed = useMemo(() => {
    type Item = { type: 'haber' | 'kap' | 'takvim'; title: string; source: string; time: string; sortAt: number; importance?: string };
    const items: Item[] = [];
    for (const h of haberler) items.push({ type: 'haber', title: h.baslik, source: h.kaynak, time: new Date(h.tarih).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), sortAt: new Date(h.tarih).getTime() });
    for (const k of kap) items.push({ type: 'kap', title: `${k.sirket ?? k.sembol}: ${k.baslik}`, source: 'KAP', time: new Date(k.tarih).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), sortAt: new Date(k.tarih).getTime() });
    if (ENABLE_ECONOMIC_CALENDAR) {
      const now = Date.now();
      for (const e of EKONOMI_EVENTS) {
        const t = new Date(`${e.tarih}T${e.saat ?? '00:00'}`).getTime();
        if (t >= now) items.push({ type: 'takvim', title: e.baslik, source: e.ulke, time: new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), sortAt: t, importance: e.onem });
      }
    }
    return items.sort((a, b) => b.sortAt - a.sortAt);
  }, [haberler, kap]);
  const filteredFeed = gundemSrc === 'all' ? gundemFeed : gundemFeed.filter((x) => x.type === gundemSrc);
  const upcomingEvents = useMemo(() => {
    if (!ENABLE_ECONOMIC_CALENDAR) return [];
    const now = Date.now();
    return EKONOMI_EVENTS
      .map((e) => ({ ...e, t: new Date(`${e.tarih}T${e.saat ?? '00:00'}`).getTime() }))
      .filter((e) => e.t >= now)
      .sort((a, b) => a.t - b.t)
      .slice(0, 5);
  }, []);

  const feedTypeMeta: Record<'haber' | 'kap' | 'takvim', { label: string; color: string; bg: string }> = {
    haber: { label: 'Haber', color: '#16a35b', bg: 'rgba(22,163,91,0.12)' },
    kap: { label: 'KAP', color: '#6b6ff5', bg: 'rgba(107,111,245,0.12)' },
    takvim: { label: 'Takvim', color: '#c98a00', bg: 'rgba(201,138,0,0.12)' },
  };

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[50px] -top-[50px] h-[250px] w-[280px] blur-[24px]" style={{ background: 'radial-gradient(circle,rgba(107,111,245,0.2),rgba(107,111,245,0) 68%)' }} />
        <div className="absolute -right-[60px] -top-[30px] h-[230px] w-[280px] blur-[26px]" style={{ background: 'radial-gradient(circle,rgba(22,163,91,0.18),rgba(22,163,91,0) 66%)' }} />
      </div>

      <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
        <h1 className="text-[25px] font-extrabold tracking-[-0.03em] text-ink lg:text-[27px]">Piyasa</h1>
        <p className="mt-0.5 text-[13px] font-medium text-t3">Sektör rotasyonu · emtia/döviz · gündem — tek bakışta</p>

        <div className="mt-3.5 flex gap-1 overflow-x-auto border-b border-hairline">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 border-b-2 px-4 py-3 text-[14px] font-bold transition-colors ${tab === t.key ? 'border-up text-ink' : 'border-transparent text-t3 hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === 'sektorler' && (
            <div className="flex flex-col gap-3.5 lg:flex-row lg:gap-6">
              <div className="flex min-w-0 flex-col gap-3.5 lg:flex-[1.7]">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div className="ie-glass-flat rounded-[14px] px-4 py-3">
                    <div className="text-[11px] font-medium text-t3">En güçlü sektör</div>
                    <div className="mt-0.5 text-[15px] font-bold text-ink">{bestSector?.shortName ?? '—'}</div>
                    {bestSector && <div className="font-mono text-[12px] font-semibold" style={{ color: col(bestSector.perf20d) }}>{fmtPct(bestSector.perf20d)} · 20G</div>}
                  </div>
                  <div className="ie-glass-flat rounded-[14px] px-4 py-3">
                    <div className="text-[11px] font-medium text-t3">En zayıf sektör</div>
                    <div className="mt-0.5 text-[15px] font-bold text-ink">{worstSector?.shortName ?? '—'}</div>
                    {worstSector && <div className="font-mono text-[12px] font-semibold" style={{ color: col(worstSector.perf20d) }}>{fmtPct(worstSector.perf20d)} · 20G</div>}
                  </div>
                  <div className="ie-glass-flat rounded-[14px] px-4 py-3">
                    <div className="text-[11px] font-medium text-t3">Rotasyon yönü</div>
                    <div className="mt-0.5 text-[15px] font-bold" style={{ color: rotation.color }}>{rotation.label}</div>
                    <div className="text-[11px] font-medium text-t3">
                      {flow ? <><span className="font-semibold text-up">{flow.inflow.length} giriş</span> · <span className="font-semibold text-down">{flow.outflow.length} çıkış</span> · {sectors.length} sektör</> : `${sectors.length} sektör`}
                    </div>
                  </div>
                </div>

                <div className="ie-glass flex flex-col rounded-[18px] px-4 py-3.5 lg:px-5">
                  <div className="mb-2 text-[14px] font-extrabold text-ink">Sektör gücü</div>
                  {sectorsLoading ? (
                    <div className="flex flex-col gap-2">{[...Array(7)].map((_, i) => <div key={i} className="h-[42px] animate-pulse rounded-[10px] bg-fill" />)}</div>
                  ) : sortedSectors.length === 0 ? (
                    <p className="py-6 text-center text-[13px] font-medium text-t3">Sektör verisi yüklenemedi.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {/* Sütun başlıkları — hangi sayının ne olduğu satırın üstünde okunsun */}
                      <div className="flex items-center gap-3 px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.04em] text-t3">
                        <span className="w-[110px] shrink-0 lg:w-[130px]">Sektör</span>
                        <span className="hidden w-[64px] shrink-0 sm:block">Lider hisse</span>
                        <span className="hidden w-[54px] shrink-0 text-right sm:block">20 gün</span>
                        <span className="hidden w-[54px] shrink-0 text-right lg:block">60 gün</span>
                        <span className="min-w-0 flex-1 pl-2">Güç skoru</span>
                      </div>
                      {sortedSectors.map((s, i) => (
                        <Link
                          key={s.sectorId}
                          href={`/sektorler/${s.sectorId}`}
                          className={`flex items-center gap-3 rounded-[12px] px-2.5 py-2.5 transition-colors hover:bg-fill ${i >= 7 ? 'hidden lg:flex' : 'flex'}`}
                        >
                          <span className="w-[110px] shrink-0 truncate text-[13px] font-bold text-ink lg:w-[130px]">{s.shortName}</span>
                          <span className="hidden w-[64px] shrink-0 truncate text-[11px] font-semibold text-t3 sm:block">{s.topPerformers?.[0]?.symbol ?? '—'}</span>
                          <span className="hidden w-[54px] shrink-0 text-right font-mono text-[12px] font-semibold sm:block" style={{ color: col(s.perf20d) }}>{fmtPct(s.perf20d)}</span>
                          <span className="hidden w-[54px] shrink-0 text-right font-mono text-[12px] font-semibold lg:block" style={{ color: col(s.perf60d) }}>{fmtPct(s.perf60d)}</span>
                          <div className="min-w-0 flex-1"><DivergingBar v={s.compositeScore} /></div>
                        </Link>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-[11px] font-medium leading-[1.45] text-t4">
                    <strong className="font-bold text-t3">20 / 60 gün</strong>: sektörün o dönemdeki ortalama getirisi.
                    <strong className="font-bold text-t3"> Güç skoru</strong>: fiyat momentumu + makro uyumundan üretilen
                    −100…+100 arası bileşik puan; liste bu skora göre sıralı. Satıra tıkla → sektör detayı.
                  </p>
                </div>
              </div>

              <div className="mt-1 flex flex-col gap-3.5 lg:mt-0 lg:w-[300px] lg:shrink-0">
                {bestSector && (
                  <div className="ie-glass-ai rounded-[16px] px-[17px] py-[15px]">
                    <div className="flex items-center gap-2"><span className="font-mono text-[11px] font-bold text-ai">✦</span><span className="text-[13px] font-bold text-ink">Sektör yorumu</span></div>
                    {sectorComment ? (
                      <div className="mt-2.5 flex flex-col gap-2">
                        {sectorComment.rows.map((r) => (
                          <div key={r.label}>
                            <div
                              className="text-[13px] font-extrabold leading-snug"
                              style={{ color: r.tone === 'up' ? '#16a35b' : r.tone === 'down' ? '#e5484d' : undefined }}
                            >
                              {r.label}
                            </div>
                            <div className="text-[13px] font-medium leading-[1.5] text-t2">{r.text}</div>
                          </div>
                        ))}
                        <p className="border-t border-hairline pt-2 text-[13px] font-semibold leading-[1.5] text-ink">{sectorComment.sonuc}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-[13px] font-medium leading-[1.5] text-t2">{bestSector.reasoning}</p>
                    )}
                    {flow && flow.inflow.length > 0 && (
                      <div className="mt-3 border-t border-hairline pt-2.5">
                        <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.05em] text-t3">Para girişi olan sektörler</div>
                        <div className="flex flex-col gap-1">
                          {flow.inflow.slice(0, 4).map(({ s, accel }) => (
                            <Link key={s.sectorId} href={`/sektorler/${s.sectorId}`} className="flex items-center justify-between rounded-[8px] px-1.5 py-1 hover:bg-fill">
                              <span className="truncate text-[13px] font-bold text-ink">{s.shortName}</span>
                              <span className="ml-2 shrink-0 font-mono text-[12px] font-semibold text-up">
                                {fmtPct(s.perf20d)} <span className="text-t3">· hızlanma +{accel.toFixed(1)}p</span>
                              </span>
                            </Link>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] font-medium leading-[1.45] text-t4">
                          <strong className="font-bold text-t3">Hızlanma</strong> = son 20 günün getirisi, aynı sektörün 60 günlük
                          ortalama hızının kaç puan üstünde. Yüksek olması paranın son dönemde o sektöre yöneldiğini gösterir.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="ie-glass flex-1 rounded-[16px] px-[17px] py-[15px]">
                  <div className="mb-2 text-[14px] font-extrabold text-ink">Öne çıkanlar</div>
                  {movers ? (
                    <div className="flex flex-col gap-1">
                      {[...(movers.gainers ?? []).slice(0, 3), ...(movers.losers ?? []).slice(0, 3)].map((m) => (
                        <Link key={m.sembol} href={`/hisse/${m.sembol}`} className="flex items-center justify-between rounded-[8px] px-1.5 py-1.5 hover:bg-fill">
                          <span className="text-[13px] font-bold text-ink">{m.sembol}</span>
                          <span className="font-mono text-[12px] font-semibold" style={{ color: col(m.changePercent) }}>{fmtPct(m.changePercent)}</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-t3">Yükleniyor…</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'emtia' && (
            <div className="flex flex-col gap-3.5 lg:flex-row lg:gap-6">
              <div className="min-w-0 lg:flex-[1.7]">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {emtiaLoading ? (
                    [...Array(6)].map((_, i) => <div key={i} className="ie-glass h-[130px] animate-pulse rounded-[16px]" />)
                  ) : (
                    EMTIA_CARDS.map(({ key, label, q }) => {
                      const series = seriesOf(key);
                      const tv = trendVerdict(series);
                      return (
                        <div key={key} className="ie-glass rounded-[16px] px-4 py-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-t3">{label}</span>
                            {q && <span className="rounded-[7px] px-2 py-0.5 font-mono text-[11px] font-bold" style={{ background: `${col(q.changePercent)}1f`, color: col(q.changePercent) }}>{fmtPct(q.changePercent)}</span>}
                          </div>
                          <div className="mt-1 font-mono text-[21px] font-bold tracking-[-0.02em] text-ink">{fmtNum(q?.price)}</div>
                          {tv && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="rounded-[7px] px-2 py-0.5 text-[11px] font-extrabold" style={{ background: `${tv.color}1f`, color: tv.color }}>{tv.label}</span>
                              <span className="truncate font-mono text-[10px] font-medium text-t3">{tv.note}</span>
                            </div>
                          )}
                          <AreaSpark values={series} color={q && q.changePercent < 0 ? '#e5484d' : '#16a35b'} />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="mt-1 flex flex-col gap-3.5 lg:mt-0 lg:w-[300px] lg:shrink-0">
                <div className="ie-glass rounded-[16px] px-[17px] py-[15px]">
                  <div className="mb-2.5 text-[14px] font-extrabold text-ink">Makro göstergeler</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[10px] bg-fill px-2.5 py-2 text-center">
                      <div className="font-mono text-[14px] font-bold text-ink">{tr?.policyRate?.value != null ? `%${fmtNum(tr.policyRate.value, 0)}` : '—'}</div>
                      <div className="mt-0.5 text-[10px] font-medium text-t3">TCMB Faizi</div>
                    </div>
                    <div className="rounded-[10px] bg-fill px-2.5 py-2 text-center">
                      <div className="font-mono text-[14px] font-bold text-ink">{tr?.inflation?.value != null ? `%${fmtNum(tr.inflation.value, 1)}` : '—'}</div>
                      <div className="mt-0.5 text-[10px] font-medium text-t3">Enflasyon</div>
                    </div>
                    <div className="rounded-[10px] bg-fill px-2.5 py-2 text-center">
                      <div className="font-mono text-[14px] font-bold text-ink">{tr?.cds5y?.value != null ? fmtNum(tr.cds5y.value, 0) : '—'}</div>
                      <div className="mt-0.5 text-[10px] font-medium text-t3">CDS 5Y</div>
                    </div>
                    <div className="rounded-[10px] bg-fill px-2.5 py-2 text-center">
                      <div className="font-mono text-[14px] font-bold text-ink">{fmtNum(ind.dxy?.price, 1)}</div>
                      <div className="mt-0.5 text-[10px] font-medium text-t3">DXY</div>
                    </div>
                  </div>
                </div>
                <div className="ie-glass-flat rounded-[16px] px-[17px] py-[15px]">
                  <p className="text-[12px] font-medium leading-[1.5] text-t2">
                    USD/TRY {seriesOf('usdtry').length >= 2 ? fmtPct(((seriesOf('usdtry').at(-1)! - seriesOf('usdtry')[0]!) / seriesOf('usdtry')[0]!) * 100) : '—'} ·
                    {' '}Altın {seriesOf('gold').length >= 2 ? fmtPct(((seriesOf('gold').at(-1)! - seriesOf('gold')[0]!) / seriesOf('gold')[0]!) * 100) : '—'} (son 20 gün).
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'gundem' && (
            <div className="flex flex-col gap-3.5 lg:flex-row lg:gap-6">
              <div className="min-w-0 lg:flex-[1.7]">
                <div className="flex flex-wrap gap-1.5">
                  {([['all', 'Tümü'], ['haber', 'Haber'], ['kap', 'KAP'], ...(ENABLE_ECONOMIC_CALENDAR ? [['takvim', 'Takvim'] as const] : [])] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setGundemSrc(key)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${gundemSrc === key ? 'bg-ink text-onink' : 'bg-fill text-t3 hover:text-ink'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {gundemLoading ? (
                    [...Array(6)].map((_, i) => <div key={i} className="ie-glass h-[64px] animate-pulse rounded-[16px]" />)
                  ) : filteredFeed.length === 0 ? (
                    <div className="ie-glass rounded-[16px] px-4 py-8 text-center text-[13px] font-medium text-t3">Bu kaynakta gösterilecek içerik yok.</div>
                  ) : (
                    filteredFeed.slice(0, 30).map((item, i) => {
                      const m = feedTypeMeta[item.type];
                      return (
                        <div key={i} className="ie-glass flex items-start gap-3 rounded-[14px] px-4 py-3">
                          <span className="shrink-0 rounded-[7px] px-2 py-1 text-[10px] font-extrabold" style={{ background: m.bg, color: m.color }}>{m.label}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-semibold text-ink">{item.title}</div>
                            <div className="mt-0.5 text-[11px] font-medium text-t3">{item.source} · {item.time}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              {ENABLE_ECONOMIC_CALENDAR && upcomingEvents.length > 0 && (
                <div className="mt-1 lg:mt-0 lg:w-[300px] lg:shrink-0">
                  <div className="ie-glass rounded-[16px] px-[17px] py-[15px]">
                    <div className="mb-2.5 text-[14px] font-extrabold text-ink">Ekonomi takvimi</div>
                    <div className="flex flex-col gap-2">
                      {upcomingEvents.map((e) => (
                        <div key={e.id} className="border-t border-hairline pt-2 first:border-0 first:pt-0">
                          <div className="text-[12px] font-bold text-ink">{e.baslik}</div>
                          <div className="mt-0.5 text-[11px] font-medium text-t3">{e.ulke} · {e.saat} · {e.onem}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
