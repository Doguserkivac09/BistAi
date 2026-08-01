'use client';

/**
 * Kâr Kalitesi kartı (Bilanço Öngörü B1) — hisse detay "Temel" sekmesinde.
 * "Bu şirket gerçekten kâr ediyor mu?" — kâr köprüsü + bayraklar + metrikler.
 * /api/earnings-quality?symbol=X (İş Yatırım çeyreklik → earnings-quality-engine).
 */

import { useEffect, useState } from 'react';
import type { EarningsQualityResult } from '@/lib/earnings-quality-engine';

type Resp = Partial<EarningsQualityResult> & {
  applicable: boolean; reason?: string; sembol?: string; lastQuarter?: string; error?: string;
};

const VERDICT: Record<string, { label: string; color: string; bg: string }> = {
  'gerçek':          { label: 'Gerçek faaliyet kârı', color: '#16a35b', bg: 'rgba(22,163,91,0.10)' },
  'finansman-yükü':  { label: 'Finansman yükü',       color: '#c98a00', bg: 'rgba(201,138,0,0.10)' },
  'kağıt-üstü':      { label: 'Kâğıt üstü kâr',        color: '#e5484d', bg: 'rgba(229,72,77,0.10)' },
  'zayıf':           { label: 'Zayıf kâr kalitesi',    color: '#8a909b', bg: 'rgba(138,144,155,0.10)' },
  'belirsiz':        { label: 'Değerlendirilemedi',    color: '#8a909b', bg: 'rgba(138,144,155,0.10)' },
};

const FLAG_COLOR: Record<string, string> = { kırmızı: '#e5484d', turuncu: '#c98a00', yeşil: '#16a35b' };
const TONE_ORDER: Record<string, number> = { kırmızı: 0, turuncu: 1, yeşil: 2 };

function fmtTL(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const s = abs >= 1e9 ? `${(v / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mr`
    : abs >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`
    : v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  return `${s} ₺`;
}
const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `%${(v * 100).toFixed(d)}`);
const x = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}×`);

export default function KarKalitesi({ sembol }: { sembol: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/earnings-quality?symbol=${encodeURIComponent(sembol)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancel) setData(d); })
      .catch(() => { if (!cancel) setData({ applicable: false, reason: 'error' }); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [sembol]);

  if (loading) return <div className="ie-glass h-[180px] animate-pulse rounded-[18px]" />;
  if (!data) return null;

  if (!data.applicable) {
    const msg = data.reason === 'bank' ? 'Banka/finans şirketleri için kâr kalitesi motoru henüz uygulanmıyor.'
      : data.reason === 'us' ? 'Kâr kalitesi analizi BIST hisseleri içindir.'
      : (data.notes?.[0] ?? 'Çeyreklik mali tablo bulunamadı.');
    return (
      <div className="ie-glass-flat rounded-[18px] px-5 py-4">
        <div className="text-[13px] font-bold text-ink">Kâr Kalitesi</div>
        <p className="mt-1.5 text-[12px] font-medium text-t3">{msg}</p>
      </div>
    );
  }

  const v = VERDICT[data.verdict ?? 'belirsiz'] ?? VERDICT['belirsiz']!;
  const bridge = data.bridge ?? [];

  return (
    <div className="ie-glass-flat rounded-[18px] px-5 py-4">
      {/* Başlık + verdict */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold text-ink">Kâr Kalitesi</div>
          <div className="text-[11px] font-medium text-t3">Gerçekten kâr ediyor mu? · {data.lastQuarter} ({data.periodBasis === 'quarter' ? 'tek çeyrek' : 'son 12 ay'})</div>
        </div>
        <div className="flex items-center gap-2">
          {data.score != null && (
            <span className="font-mono text-[20px] font-bold" style={{ color: v.color }}>{data.score}</span>
          )}
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: v.bg, color: v.color }}>{v.label}</span>
        </div>
      </div>

      {/* TEK CÜMLE sade cevap + operasyon trend */}
      {data.plainSummary && (
        <div className="mt-2.5 rounded-[12px] px-3 py-2.5" style={{ background: v.bg }}>
          <p className="text-[13px] font-semibold leading-[1.5]" style={{ color: v.color }}>{data.plainSummary}</p>
          {data.operatingTrend && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: data.operatingTrend.direction === 'iyileşiyor' ? '#16a35b' : data.operatingTrend.direction === 'bozuluyor' ? '#e5484d' : '#8a909b' }}>
              <span>{data.operatingTrend.direction === 'iyileşiyor' ? '↗' : data.operatingTrend.direction === 'bozuluyor' ? '↘' : '→'}</span>
              {data.operatingTrend.detail}
            </div>
          )}
        </div>
      )}

      {/* Bayraklar — tek hafif kutu, satır satır (kırmızılar önce) */}
      {data.flags && data.flags.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2 rounded-[12px] border border-hairline/70 px-3 py-2.5">
          {[...data.flags].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]).map((fl, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: FLAG_COLOR[fl.tone] }} />
              <p className="text-[12px] leading-[1.5]">
                <span className="font-bold" style={{ color: FLAG_COLOR[fl.tone] }}>{fl.label}</span>
                <span className="text-t3"> — {fl.detail}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* KATMAN 1: Ne izlemeli / ne düzeltirse iyileşir */}
      {data.watchTriggers && data.watchTriggers.length > 0 && (
        <div className="mt-2.5 rounded-[12px] bg-fill px-3 py-2.5">
          <div className="mb-1 text-[11px] font-bold text-ink">Ne izlemeli · iyileşme için ne gerekir?</div>
          <ul className="flex flex-col gap-1">
            {data.watchTriggers.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11.5px] font-medium leading-[1.5] text-t2">
                <span className="mt-[3px] text-ai">•</span>{w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Kâr köprüsü */}
      {bridge.length > 0 && (
        <div className="mt-3.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-t3">Kâr Köprüsü ({data.periodBasis === 'quarter' ? 'tek çeyrek' : 'son 12 ay'})</div>
          <div className="flex flex-col gap-1">
            {bridge.map((s) => {
              const positive = s.amount >= 0;
              const w = s.pctOfRevenue != null ? Math.min(100, Math.abs(s.pctOfRevenue)) : 0;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="w-[128px] shrink-0 truncate text-[12px] font-medium text-t2">{s.label}</span>
                  <div className="relative h-[16px] flex-1 overflow-hidden rounded-[4px] bg-fill">
                    <div className="h-full rounded-[4px]" style={{ width: `${w}%`, background: positive ? 'rgba(22,163,91,0.35)' : 'rgba(229,72,77,0.35)' }} />
                  </div>
                  <span className="w-[92px] shrink-0 text-right font-mono text-[12px] font-semibold text-ink">{fmtTL(s.amount)}</span>
                  <span className="w-[46px] shrink-0 text-right font-mono text-[11px] text-t3">{s.pctOfRevenue != null ? `%${s.pctOfRevenue.toFixed(0)}` : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metrikler */}
      <div className="mt-3.5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Faaliyet marjı" value={pct(data.operatingMargin)} />
        <Metric label="Faiz karşılama" value={x(data.interestCoverage)} hint={data.interestCoverage != null && data.interestCoverage < 1.5 ? 'düşük' : undefined} />
        <Metric label="Nakde dönüşüm" value={x(data.fcfConversion)} hint={data.fcfConversion != null && data.fcfConversion < 0.3 ? 'zayıf' : undefined} />
        <Metric label="Net borç/FAVÖK" value={x(data.netDebtToEbitda)} hint={data.netDebtToEbitda != null && data.netDebtToEbitda > 4 ? 'yüksek' : undefined} />
      </div>

      {/* TMS-29 enflasyon etkisi — somut TL (oran yerine) */}
      {data.estimatedMonetaryGain != null && data.netIncome != null && data.estimatedMonetaryGain > 0 && (
        <div className="mt-3 rounded-[10px] bg-fill px-3 py-2.5">
          <div className="text-[11px] font-semibold text-t2">Enflasyon etkisi arındırılınca (tahmini)</div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px]">
            <span className="text-t3">Net kâr</span>
            <span className="font-mono font-semibold text-ink">{fmtTL(data.netIncome)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-t3">− Tahmini enflasyon kazancı</span>
            <span className="font-mono font-semibold text-warn">−{fmtTL(data.estimatedMonetaryGain)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-hairline pt-1.5 text-[12px]">
            <span className="font-semibold text-t2">≈ Arındırılmış kâr</span>
            <span className="font-mono text-[13px] font-bold" style={{ color: (data.cleanedNetIncome ?? 0) >= 0 ? '#16a35b' : '#e5484d' }}>
              {fmtTL(data.cleanedNetIncome)}{(data.cleanedNetIncome ?? 0) < 0 ? ' (zarar)' : ''}
            </span>
          </div>
          <div className="mt-1.5 text-[10.5px] font-medium leading-[1.5] text-t4">
            Net kârdan tahmini enflasyon (parasal) kazancı çıkarıldığında kalan gerçek operasyonel kâr.
            <span className="italic"> KAP dipnotu bloklu → bilançodan tahmin; kesin değer değildir.</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] font-medium leading-[1.5] text-t4">
        Kaynak: İş Yatırım çeyreklik mali tablolar. Kural-tabanlı analiz, yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[10px] bg-fill px-3 py-2">
      <div className="text-[10px] font-medium text-t3">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-bold text-ink">{value}{hint && <span className="ml-1 text-[10px] font-medium text-down">{hint}</span>}</div>
    </div>
  );
}
