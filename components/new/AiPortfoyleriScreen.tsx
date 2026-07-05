'use client';

/**
 * "AI Portföyleri" ekranı (design_handoff_kalan_ekranlar) — hi-fi, açık tema.
 * Model portföy kartları (ad + tagline + risk rozeti + getiri + pozisyon + İncele)
 * + risk filtresi çipleri + AI açıklama bandı. Masaüstü: 2 sütun kart gridi.
 * KORUNAN: gerçek portföy API'leri (weekly-picks, ai/apex/apex-us/aegis-us) +
 * ENABLE_US bayrağı + detay sayfa linkleri. Tasarımdaki "beklenen getiri" yerine
 * GERÇEK toplam getiri gösterilir (sahte veri yok).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ENABLE_US } from '@/lib/flags';

type RiskLevel = 'dusuk' | 'orta' | 'yuksek';

interface Summary {
  totalValue: number;
  totalReturn: number;
  positionCount: number;
  weeklyReturn?: number;
  dailyReturn?: number;
  winRate?: number | null;
  maxDrawdown?: number;
}

interface WeeklyStats {
  avgReturn: number | null;
  outperformedRate: number | null; // 0-100
  totalWeeks: number;
  thisWeekCount: number;
}

const RISK_STYLE: Record<RiskLevel, { label: string; bg: string; fg: string }> = {
  dusuk: { label: 'Düşük risk', bg: 'rgba(22,163,91,0.13)', fg: '#16a35b' },
  orta: { label: 'Orta risk', bg: 'rgba(201,138,0,0.14)', fg: '#c98a00' },
  yuksek: { label: 'Yüksek risk', bg: 'rgba(229,72,77,0.12)', fg: '#e5484d' },
};

const FILTERS: { id: 'all' | RiskLevel; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'dusuk', label: 'Düşük risk' },
  { id: 'orta', label: 'Orta' },
  { id: 'yuksek', label: 'Yüksek' },
];

const fmtTL = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺';
const fmtUSD = (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtPct = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d).replace('.', ',')}%`;

function Ret({ v }: { v: number | null | undefined }) {
  return (
    <span className="font-mono font-bold" style={{ color: v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d' }}>
      {fmtPct(v)}
    </span>
  );
}

interface CardDef {
  key: string;
  name: string;
  flag?: string;
  tagline: string;
  risk: RiskLevel;
  riskNote?: string;
  href: string;
  us?: boolean;
  main: number | null | undefined; // ana getiri
  mainLabel: string;
  rows: { k: string; v: React.ReactNode }[];
}

export function AiPortfoyleriScreen() {
  const [weekly, setWeekly] = useState<WeeklyStats | null>(null);
  const [aegis, setAegis] = useState<Summary | null>(null);
  const [apex, setApex] = useState<Summary | null>(null);
  const [apexUS, setApexUS] = useState<Summary | null>(null);
  const [aegisUS, setAegisUS] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | RiskLevel>('all');

  useEffect(() => {
    const ctrl = new AbortController();
    const grab = (url: string) => fetch(url, { signal: ctrl.signal }).then((r) => r.json());

    Promise.allSettled([
      grab('/api/weekly-picks'),
      grab('/api/ai-portfolio'),
      grab('/api/apex-portfolio'),
      ...(ENABLE_US ? [grab('/api/apex-us-portfolio'), grab('/api/aegis-us-portfolio')] : []),
    ]).then(([w, ai, ap, apUS, aeUS]) => {
      if (w?.status === 'fulfilled') {
        const d = w.value as { stats?: { avgReturn?: number; outperformedRate?: number; totalWeeks?: number }; thisWeek?: unknown[] };
        // outperformedRate 0-1 (oran) veya 0-100 (yüzde) gelebilir — normalize et
        const rawRate = d.stats?.outperformedRate;
        setWeekly({
          avgReturn: d.stats?.avgReturn ?? null,
          outperformedRate: rawRate != null ? Math.round(rawRate <= 1 ? rawRate * 100 : rawRate) : null,
          totalWeeks: d.stats?.totalWeeks ?? 0,
          thisWeekCount: (d.thisWeek ?? []).length,
        });
      }
      const summaryOf = (r: PromiseSettledResult<unknown> | undefined): Summary | null =>
        r?.status === 'fulfilled' ? ((r.value as { summary?: Summary }).summary ?? null) : null;
      setAegis(summaryOf(ai));
      setApex(summaryOf(ap));
      setApexUS(summaryOf(apUS));
      setAegisUS(summaryOf(aeUS));
      setLoading(false);
    });

    return () => ctrl.abort();
  }, []);

  const cards = useMemo<CardDef[]>(
    () => [
      {
        key: 'weekly',
        name: 'Haftanın Seçimleri',
        tagline: 'Her Pazartesi algoritmanın seçtiği en güçlü 5-7 hisse',
        risk: 'dusuk',
        riskNote: 'Haftalık',
        href: '/haftalik-secimler',
        main: weekly?.avgReturn,
        mainLabel: 'Ort. haftalık getiri',
        rows: [
          { k: "BIST'i geçme", v: weekly?.outperformedRate != null ? `%${weekly.outperformedRate}` : '—' },
          { k: 'Takip edilen hafta', v: weekly?.totalWeeks ?? '—' },
          { k: 'Bu hafta seçim', v: weekly ? `${weekly.thisWeekCount} hisse` : '—' },
        ],
      },
      {
        key: 'aegis',
        name: 'Aegis Portföy',
        flag: '🇹🇷',
        tagline: 'Sermayeyi koruyarak büyüt — haftalık AI kararları',
        risk: 'orta',
        href: '/yapay-zeka-portfoyu',
        main: aegis?.totalReturn,
        mainLabel: 'Toplam getiri',
        rows: [
          { k: 'Toplam değer', v: aegis ? fmtTL(aegis.totalValue) : '—' },
          { k: 'Açık pozisyon', v: aegis ? `${aegis.positionCount} hisse` : '—' },
          { k: 'Haftalık', v: <Ret v={aegis?.weeklyReturn} /> },
        ],
      },
      {
        key: 'apex',
        name: 'APEX BIST',
        flag: '🇹🇷',
        tagline: 'Agresif momentum — günlük kararlar, ATR trailing stop',
        risk: 'yuksek',
        riskNote: 'Günlük',
        href: '/apex-portfoyu',
        main: apex?.totalReturn,
        mainLabel: 'Toplam getiri',
        rows: [
          { k: 'Toplam değer', v: apex ? fmtTL(apex.totalValue) : '—' },
          { k: 'Açık pozisyon', v: apex ? `${apex.positionCount} hisse` : '—' },
          { k: 'Win rate', v: apex?.winRate != null ? `%${apex.winRate.toFixed(0)}` : '—' },
        ],
      },
      ...(ENABLE_US
        ? ([
            {
              key: 'apex-us',
              name: 'APEX US',
              flag: '🇺🇸',
              tagline: 'ABD piyasasında agresif momentum — kesirli pay + haber analizi',
              risk: 'yuksek',
              riskNote: 'USD',
              href: '/apex-us-portfoyu',
              main: apexUS?.totalReturn,
              mainLabel: 'Toplam getiri',
              rows: [
                { k: 'Toplam değer', v: apexUS ? fmtUSD(apexUS.totalValue) : '—' },
                { k: 'Açık pozisyon', v: apexUS ? `${apexUS.positionCount} hisse` : '—' },
                { k: 'Win rate', v: apexUS?.winRate != null ? `%${apexUS.winRate.toFixed(0)}` : '—' },
              ],
            },
            {
              key: 'aegis-us',
              name: 'Aegis US',
              flag: '🇺🇸',
              tagline: 'ABD borsasında haftalık AI kararları — orta vadeli',
              risk: 'orta',
              riskNote: 'USD',
              href: '/aegis-us-portfoyu',
              main: aegisUS?.totalReturn,
              mainLabel: 'Toplam getiri',
              rows: [
                { k: 'Toplam değer', v: aegisUS ? fmtUSD(aegisUS.totalValue) : '—' },
                { k: 'Açık pozisyon', v: aegisUS ? `${aegisUS.positionCount} hisse` : '—' },
                { k: 'Haftalık', v: <Ret v={aegisUS?.weeklyReturn} /> },
              ],
            },
          ] as CardDef[])
        : []),
    ],
    [weekly, aegis, apex, apexUS, aegisUS]
  );

  const visible = cards.filter((c) => filter === 'all' || c.risk === filter);

  return (
    <div className="px-6 py-6 lg:px-7 lg:py-[26px]">
      {/* Başlık + risk filtreleri */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[22px]">
            <span className="font-mono text-[13px] font-bold text-ai">✦</span>
            AI Portföyleri
          </h1>
          <p className="mt-0.5 text-[12px] font-medium text-t3 lg:text-[13px]">Hedefine göre hazır model setler — sanal sermaye</p>
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-[11px] px-3.5 py-2 text-[12px] transition-colors ${
                filter === f.id ? 'bg-ink font-bold text-onink' : 'bg-fill font-semibold text-t2 hover:bg-hairline'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kartlar */}
      <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-5">
        {visible.map((c) => {
          const rs = RISK_STYLE[c.risk];
          return (
            <div key={c.key} className="flex flex-col rounded-[20px] border border-hairline bg-panel p-4 lg:p-[22px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[16px] font-extrabold tracking-[-0.02em] text-ink lg:text-[18px]">
                    {c.name}
                    {c.flag && <span className="text-[13px]">{c.flag}</span>}
                  </div>
                  <div className="mt-0.5 text-[12px] font-medium text-t3 lg:text-[13px]">{c.tagline}</div>
                </div>
                <span className="whitespace-nowrap rounded-[8px] px-3 py-[5px] text-[11px] font-bold" style={{ background: rs.bg, color: rs.fg }}>
                  {rs.label}
                  {c.riskNote ? ` · ${c.riskNote}` : ''}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-6 lg:mt-[18px]">
                <div>
                  <div className="whitespace-nowrap text-[11px] font-medium text-t3">{c.mainLabel}</div>
                  <div className="mt-0.5 whitespace-nowrap font-mono text-[21px] font-bold tracking-[-0.02em]" style={{ color: loading ? '#9aa0ad' : c.main == null ? '#9aa0ad' : c.main >= 0 ? '#16a35b' : '#e5484d' }}>
                    {loading ? '…' : fmtPct(c.main)}
                  </div>
                </div>
                {c.rows.map((r) => (
                  <div key={r.k} className="hidden sm:block">
                    <div className="whitespace-nowrap text-[11px] font-medium text-t3">{r.k}</div>
                    <div className="mt-0.5 whitespace-nowrap font-mono text-[15px] font-bold text-ink">{loading ? '…' : r.v}</div>
                  </div>
                ))}
                <div className="flex-1" />
                <Link
                  href={c.href}
                  className="whitespace-nowrap rounded-[12px] border-[1.5px] border-[#e7e9ec] px-[18px] py-2.5 text-[13px] font-bold text-ink transition-colors hover:bg-fill"
                >
                  İncele
                </Link>
              </div>

              {/* Mobilde satırlar alta */}
              <div className="mt-3 flex gap-5 border-t border-[#f6f7f8] pt-3 sm:hidden">
                {c.rows.map((r) => (
                  <div key={r.k}>
                    <div className="text-[10px] font-medium text-t3">{r.k}</div>
                    <div className="mt-0.5 font-mono text-[13px] font-bold text-ink">{loading ? '…' : r.v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI açıklama bandı */}
      <div className="mt-5 flex items-center gap-3 rounded-[18px] border-[1.5px] border-ai-panel-border bg-ai-panel px-5 py-4">
        <span className="font-mono text-[12px] font-bold text-ai">✦</span>
        <span className="text-[13px] font-medium leading-[1.5] text-t2">
          Tüm portföyler <b className="font-bold text-ink">sanal sermaye</b> üzerinde çalışır; kararlar algoritma/AI tarafından
          otomatik verilir. Geçmiş performans gelecekteki sonuçları garanti etmez — yatırım tavsiyesi değildir.
        </span>
      </div>
    </div>
  );
}
