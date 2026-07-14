'use client';

/**
 * "Hisse Detay" hero'su v2 (design_handoff_hisse_detay, liquid glass, sade & profesyonel).
 * Fiyat + büyük alan grafiği (gerçek S/R çizgileri + hacim şeridi + alım/satım
 * baskısı) + AI sinyal kartı + temel istatistikler + Al/Sat aksiyon çubuğu.
 *
 * Bu bileşen kendi verisini çeker (candles + /api/hisse-analiz); altında
 * HisseDetailClient (hideHero) zengin sekmeleri (Teknik/AI/Temel/Haberler)
 * DEĞİŞMEDEN sunmaya devam eder — fonksiyon kaybı yok, sadece üst özet
 * yeniden tasarlandı. Açık/karanlık tema (ie-glass* token sınıfları).
 *
 * Veri: /api/ohlcv (aralık grafiği + günlük istatistikler) + /api/hisse-analiz
 * (AI karar, güven, hedef, R/R'den türetilmiş risk, 90g yüksek/düşük).
 * S/R: lib/support-resistance calculateSRLevels (gerçek pivot analizi).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isUSSymbol } from '@/lib/us-symbols';
import { getSector } from '@/lib/sectors';
import { calculateSRLevels } from '@/lib/support-resistance';
import type { OHLCVCandle } from '@/types';
import type { HisseAnalizResponse } from '@/app/api/hisse-analiz/route';
import { addToWatchlist, removeFromWatchlist } from '@/app/hisse/[sembol]/actions';
import { BrokerLinkButton } from '@/components/BrokerLinkButton';
import { PriceAlertButton } from '@/components/PriceAlertButton';
import { toast } from 'sonner';

type RangeKey = '1G' | '1H' | '1A' | '1Y' | 'Tümü';
const RANGES: RangeKey[] = ['1G', '1H', '1A', '1Y', 'Tümü'];
const RANGE_DAYS: Record<Exclude<RangeKey, '1G'>, number> = { '1H': 7, '1A': 30, '1Y': 365, Tümü: 365 };

const fmt = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtVol = (v: number | null | undefined) => {
  if (v == null) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(v);
};
const pctColor = (v: number | null | undefined) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');

function buildSpark(vals: number[], w: number, h: number, pad = 6) {
  if (vals.length < 2) return { line: '', area: '', min: 0, max: 1 };
  const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / (vals.length - 1);
    const y = pad + (h - 2 * pad) * (1 - (v - min) / rng);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = 'M' + pts.join(' L');
  return { line, area: `${line} L ${(w - pad).toFixed(1)} ${(h - pad).toFixed(1)} L ${pad.toFixed(1)} ${(h - pad).toFixed(1)} Z`, min, max };
}

async function fetchRangeCandles(sembol: string, key: RangeKey, isUS: boolean): Promise<OHLCVCandle[]> {
  const marketQ = isUS ? '&market=US' : '';
  if (key === '1G') {
    const r = await fetch(`/api/ohlcv?symbol=${sembol}&tf=15m${marketQ}`);
    const d = await r.json();
    return d?.candles ?? [];
  }
  const days = RANGE_DAYS[key];
  const r = await fetch(`/api/ohlcv?symbol=${sembol}&days=${days}${marketQ}`);
  const d = await r.json();
  return d?.candles ?? [];
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? '#e0a92e' : 'none'} stroke="#e0a92e" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

interface QuickAddModalProps {
  sembol: string;
  defaultFiyat: number | null;
  onClose: () => void;
  onSaved: () => void;
}

/** "Al" pilinden açılan hızlı pozisyon ekleme — gerçek /api/portfolyo POST (aynı backend). */
function QuickAddModal({ sembol, defaultFiyat, onClose, onSaved }: QuickAddModalProps) {
  const [miktar, setMiktar] = useState('');
  const [fiyat, setFiyat] = useState(defaultFiyat ? String(defaultFiyat) : '');
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!miktar || !fiyat) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/portfolyo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sembol, miktar: Number(miktar), alis_fiyati: Number(fiyat), alis_tarihi: tarih }),
      });
      if (!r.ok) { setErr((await r.json())?.error ?? 'Eklenemedi'); setBusy(false); return; }
      toast.success(`${sembol} portföyüne eklendi`);
      onSaved();
    } catch {
      setErr('Eklenemedi'); setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={submit} className="w-full max-w-[360px] rounded-[20px] bg-panel p-5 shadow-[0_20px_60px_-12px_rgba(15,20,30,0.4)]" onClick={(e) => e.stopPropagation()}>
        <div className="text-[16px] font-extrabold tracking-[-0.02em] text-ink">{sembol} · pozisyon ekle</div>
        <div className="mt-3.5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-t3">Lot</span>
            <input type="number" min="1" step="1" value={miktar} onChange={(e) => setMiktar(e.target.value)} required placeholder="100"
              className="rounded-[11px] border border-hairline bg-fill px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-t3">Alış fiyatı ₺</span>
            <input type="number" min="0.01" step="0.01" value={fiyat} onChange={(e) => setFiyat(e.target.value)} required
              className="rounded-[11px] border border-hairline bg-fill px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-t3">Alış tarihi</span>
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} required
              className="rounded-[11px] border border-hairline bg-fill px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink" />
          </label>
          {err && <p className="text-[12px] font-medium text-down">{err}</p>}
          <div className="mt-1 flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="flex-1 rounded-[12px] bg-fill px-4 py-2.5 text-[14px] font-bold text-ink disabled:opacity-50">Vazgeç</button>
            <button type="submit" disabled={busy} className="flex-1 rounded-[12px] bg-up px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50">{busy ? '…' : 'Kaydet'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function HisseDetayScreen({ sembol, isInWatchlist }: { sembol: string; isInWatchlist: boolean }) {
  const router = useRouter();
  const isUS = isUSSymbol(sembol);
  const market: 'BIST' | 'US' = isUS ? 'US' : 'BIST';

  const [range, setRange] = useState<RangeKey>('1G');
  const [candles, setCandles] = useState<OHLCVCandle[]>([]);
  const [dailyCandles, setDailyCandles] = useState<OHLCVCandle[]>([]);
  const [analiz, setAnaliz] = useState<HisseAnalizResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [watching, setWatching] = useState(isInWatchlist);
  const [watchBusy, setWatchBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Seçili aralığın grafiği
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRangeCandles(sembol, range, isUS)
      .then((c) => { if (!cancelled) setCandles(c); })
      .catch(() => { if (!cancelled) setCandles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sembol, range, isUS]);

  // Günlük istatistikler — aralık sekmesinden bağımsız, sabit (5 günlük mum)
  useEffect(() => {
    let cancelled = false;
    fetchRangeCandles(sembol, '1H', isUS)
      .then((c) => { if (!cancelled) setDailyCandles(c); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sembol, isUS]);

  // AI sinyal (karar, güven, hedef, 90g yüksek/düşük)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hisse-analiz?symbol=${encodeURIComponent(sembol)}&timeframe=1d${isUS ? '&market=US' : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HisseAnalizResponse | null) => { if (!cancelled) setAnaliz(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sembol, isUS]);

  const toggleWatch = useCallback(async () => {
    setWatchBusy(true);
    try {
      if (watching) { await removeFromWatchlist(sembol); setWatching(false); toast.success(`${sembol} izleme listesinden çıkarıldı`); }
      else { await addToWatchlist(sembol); setWatching(true); toast.success(`${sembol} izleme listesine eklendi`); }
    } catch { toast.error('İşlem başarısız oldu'); }
    finally { setWatchBusy(false); }
  }, [sembol, watching]);

  const sectorName = useMemo(() => (isUS ? null : getSector(sembol).name), [sembol, isUS]);

  const lastDaily = dailyCandles[dailyCandles.length - 1];
  const prevDaily = dailyCandles[dailyCandles.length - 2];
  const currentPrice = analiz?.currentPrice ?? lastDaily?.close ?? null;
  const changePercent = analiz?.changePercent ?? (
    lastDaily && prevDaily && prevDaily.close ? ((lastDaily.close - prevDaily.close) / prevDaily.close) * 100 : null
  );
  const changeTL = currentPrice != null && changePercent != null ? currentPrice - currentPrice / (1 + changePercent / 100) : null;

  // Grafik verisi (kapanışlar) + S/R + hacim + baskı — hepsi seçili aralıktan
  const closes = candles.map((c) => c.close);
  const spark = buildSpark(closes, 640, 260);
  const sr = useMemo(() => (candles.length >= 20 ? calculateSRLevels(candles) : null), [candles]);
  const srLines = useMemo(() => {
    if (!sr || spark.max === spark.min) return null;
    const clamp = (p: number) => Math.max(4, Math.min(92, p));
    const rng = spark.max - spark.min;
    const res = sr.nearestResistance ? clamp(((spark.max - sr.nearestResistance.price) / rng) * 100) : null;
    const sup = sr.nearestSupport ? clamp(((spark.max - sr.nearestSupport.price) / rng) * 100) : null;
    return { res, resPrice: sr.nearestResistance?.price ?? null, sup, supPrice: sr.nearestSupport?.price ?? null };
  }, [sr, spark.max, spark.min]);

  const volBars = useMemo(() => {
    if (candles.length === 0) return [];
    const vmax = Math.max(...candles.map((c) => c.volume), 1);
    const n = candles.length;
    const step = 100 / n;
    return candles.map((c, i) => {
      const h = (c.volume / vmax) * 100;
      const up = c.close >= c.open;
      return { x: i * step + step * 0.15, w: step * 0.7, y: 100 - h, h, up };
    });
  }, [candles]);

  const pressure = useMemo(() => {
    let buyVol = 0, sellVol = 0;
    for (const c of candles) { if (c.close >= c.open) buyVol += c.volume; else sellVol += c.volume; }
    const total = buyVol + sellVol;
    const buyPct = total > 0 ? Math.round((buyVol / total) * 100) : 50;
    return { buyPct, sellPct: 100 - buyPct };
  }, [candles]);

  const riskLabel = useMemo(() => {
    const rr = analiz?.priceTargets?.riskReward;
    if (rr == null) return { label: '—', color: '#9aa0ad' };
    if (rr >= 2) return { label: 'Düşük', color: '#16a35b' };
    if (rr >= 1) return { label: 'Orta', color: '#c98a00' };
    return { label: 'Yüksek', color: '#e5484d' };
  }, [analiz]);

  const stats = [
    { k: 'Açılış', v: lastDaily ? `${fmt(lastDaily.open)} ₺` : '—' },
    { k: 'Önceki kapanış', v: prevDaily ? `${fmt(prevDaily.close)} ₺` : '—' },
    { k: 'Gün aralığı', v: lastDaily ? `${fmt(lastDaily.low)} – ${fmt(lastDaily.high)}` : '—' },
    { k: 'Hacim', v: lastDaily ? fmtVol(lastDaily.volume) : '—' },
  ];
  const statsDesktop = [
    ...stats,
    { k: '90G Yüksek', v: analiz?.high90d != null ? `${fmt(analiz.high90d)} ₺` : '—' },
    { k: '90G Düşük', v: analiz?.low90d != null ? `${fmt(analiz.low90d)} ₺` : '—' },
  ];

  const aiRating = analiz?.decisionTr ?? '—';
  const aiColor = analiz?.color ?? '#9aa0ad';
  const target1 = analiz?.priceTargets?.target1?.price ?? null;

  const chartArea = (
    <div className="relative flex-1 lg:min-h-0">
      <svg width="100%" height="100%" viewBox="0 0 640 260" preserveAspectRatio="none" className="h-[184px] w-full lg:h-full">
        <defs>
          <linearGradient id="hd-curve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={changePercent != null && changePercent < 0 ? 'rgba(229,72,77,0.22)' : 'rgba(22,163,91,0.24)'} />
            <stop offset="1" stopColor="rgba(22,163,91,0)" />
          </linearGradient>
        </defs>
        {spark.line && (
          <>
            <path d={spark.area} fill="url(#hd-curve)" />
            <path d={spark.line} fill="none" stroke={changePercent != null && changePercent < 0 ? '#e5484d' : '#16a35b'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
      {srLines?.res != null && (
        <div className="absolute left-0 right-0 flex justify-end border-t border-dashed border-warn/50" style={{ top: `${srLines.res}%` }}>
          <span className="-translate-y-1/2 rounded-[4px] bg-panel/70 px-1.5 py-px font-mono text-[9px] font-semibold text-warn">
            Direnç {fmt(srLines.resPrice, 2)}
          </span>
        </div>
      )}
      {srLines?.sup != null && (
        <div className="absolute left-0 right-0 flex justify-end border-t border-dashed border-ai/50" style={{ top: `${srLines.sup}%` }}>
          <span className="-translate-y-1/2 rounded-[4px] bg-panel/70 px-1.5 py-px font-mono text-[9px] font-semibold text-ai">
            Destek {fmt(srLines.supPrice, 2)}
          </span>
        </div>
      )}
    </div>
  );

  const volumeStrip = (
    <div className="mt-1 flex h-[52px] flex-col lg:h-[60px]">
      <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-t3">Hacim</div>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="flex-1">
        {volBars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.up ? 'rgba(22,163,91,0.45)' : 'rgba(229,72,77,0.4)'} />
        ))}
      </svg>
    </div>
  );

  const pressureBar = (
    <div className="lg:w-[230px]">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
        <span className="text-up">%{pressure.buyPct} alıcı</span>
        <span className="hidden text-t3 lg:inline">İşlem baskısı</span>
        <span className="text-down">%{pressure.sellPct} satıcı</span>
      </div>
      <div className="flex h-[7px] gap-0.5 overflow-hidden rounded-[4px]">
        <div className="rounded-l-[4px]" style={{ width: `${pressure.buyPct}%`, background: '#16a35b' }} />
        <div className="rounded-r-[4px]" style={{ width: `${pressure.sellPct}%`, background: 'rgba(229,72,77,0.5)' }} />
      </div>
    </div>
  );

  const timeframeTabs = (
    <div className="flex gap-1.5 lg:flex-1">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={`flex-1 rounded-[10px] py-2 text-center text-[12px] font-bold transition-colors lg:w-[66px] lg:flex-none ${
            range === r ? 'bg-up text-white' : 'border border-hairline text-t3 hover:text-ink'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );

  const aiCard = (
    <div className="ie-glass-ai rounded-[18px] px-[17px] py-[15px] lg:rounded-[20px] lg:p-[18px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-ai">✦ AI</span>
          <span className="text-[14px] font-bold text-ink lg:text-[15px]">Sinyal</span>
        </div>
        <span className="rounded-[9px] px-[13px] py-[5px] text-[12px] font-extrabold" style={{ background: `${aiColor}22`, color: aiColor }}>
          {aiRating}
        </span>
      </div>
      <div className="mt-3.5 flex gap-6">
        <div>
          <div className="text-[11px] font-medium text-t3">Güven</div>
          <div className="mt-0.5 font-mono text-[17px] font-bold text-ink lg:text-[18px]">{analiz ? `%${Math.round(analiz.confidence)}` : '—'}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-t3">Hedef</div>
          <div className="mt-0.5 font-mono text-[17px] font-bold text-up lg:text-[18px]">{target1 != null ? fmt(target1) : '—'}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-t3">Risk</div>
          <div className="mt-0.5 text-[15px] font-bold" style={{ color: riskLabel.color }}>{riskLabel.label}</div>
        </div>
      </div>
      {analiz?.explanation && (
        <p className="mt-3 hidden text-[13px] font-medium leading-[1.55] text-t2 lg:block">{analiz.explanation}</p>
      )}
    </div>
  );

  const statsCard = (
    <div className="ie-glass-flat flex flex-wrap rounded-[16px] px-4 py-1 lg:flex-col lg:gap-0 lg:rounded-[18px] lg:px-[18px] lg:py-1.5">
      {stats.map((s, i) => (
        <div key={s.k} className="flex w-1/2 items-center justify-between py-2.5 lg:hidden">
          <span className="text-[12px] font-medium text-t3">{s.k}</span>
          <span className="font-mono text-[13px] font-semibold text-ink">{s.v}</span>
        </div>
      ))}
      {statsDesktop.map((s) => (
        <div key={s.k} className="hidden items-center justify-between border-b border-hairline py-3 last:border-0 lg:flex">
          <span className="text-[12px] font-medium text-t3">{s.k}</span>
          <span className="font-mono text-[13px] font-semibold text-ink">{s.v}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="ie-ambient relative overflow-hidden rounded-b-[0px] lg:rounded-[24px]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[40px] -top-[50px] h-[250px] w-[300px] blur-[24px]" style={{ background: 'radial-gradient(circle,rgba(22,163,91,0.18),rgba(22,163,91,0) 68%)' }} />
        <div className="absolute -right-[70px] top-5 h-[240px] w-[280px] blur-[26px]" style={{ background: 'radial-gradient(circle,rgba(107,111,245,0.15),rgba(107,111,245,0) 66%)' }} />
      </div>

      <div className="relative flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3.5 px-5 pb-3 pt-4 lg:px-7 lg:py-0 lg:h-[68px] lg:border-b lg:border-hairline">
          <button onClick={() => router.back()} aria-label="Geri" className="text-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="min-w-0 flex-1 lg:flex-none">
            <div className="text-[18px] font-extrabold tracking-[-0.02em] text-ink lg:text-[22px]">{sembol}</div>
            <div className="truncate text-[11px] font-medium text-t3 lg:text-[13px]">
              {analiz?.shortName ?? '…'}{sectorName ? ` · ${sectorName}` : ''}
            </div>
          </div>
          <div className="hidden flex-1 lg:block" />
          <div className="flex items-center gap-2">
            <BrokerLinkButton sembol={sembol} />
            <PriceAlertButton sembol={sembol} currentPrice={currentPrice ?? undefined} />
            <button onClick={toggleWatch} disabled={watchBusy} aria-label="İzleme listesi" aria-pressed={watching} className="disabled:opacity-50">
              <StarIcon filled={watching} />
            </button>
          </div>
          {/* Masaüstü: Sat/Al topbar'da */}
          <div className="hidden items-center gap-2.5 lg:flex">
            <Link href="/portfolyo" className="flex h-[42px] w-[100px] items-center justify-center rounded-[12px] border border-hairline text-[14px] font-bold text-ink hover:bg-fill">
              Sat
            </Link>
            <button onClick={() => setAddOpen(true)} className="flex h-[42px] w-[120px] items-center justify-center rounded-[12px] bg-up text-[14px] font-bold text-white hover:opacity-95">
              Al
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3.5 px-5 pb-4 lg:flex-row lg:gap-6 lg:px-7 lg:py-6">
          {/* Sol: fiyat + grafik + hacim + sekmeler + baskı */}
          <div className="flex min-w-0 flex-col lg:flex-[1.9]">
            <div className="flex items-end gap-4">
              <div className="font-mono text-[34px] font-bold tracking-[-0.03em] text-ink lg:text-[40px]">
                {currentPrice != null ? fmt(currentPrice) : '—'} <span className="text-[18px] text-t3 lg:text-[22px]">₺</span>
              </div>
              <div className="flex items-center gap-2 pb-1 lg:gap-2.5 lg:pb-2">
                {changeTL != null && (
                  <span className="font-mono text-[14px] font-semibold" style={{ color: pctColor(changePercent) }}>
                    {changeTL >= 0 ? '+' : ''}{fmt(changeTL)} ₺
                  </span>
                )}
                <span className="font-mono text-[13px] font-semibold lg:text-[14px]" style={{ color: pctColor(changePercent) }}>
                  {changePercent != null ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%` : '—'}
                </span>
                <span className="text-[12px] font-medium text-t3 lg:text-[13px]">bugün</span>
              </div>
            </div>

            {loading && candles.length === 0 ? (
              <div className="ie-glass mt-3.5 h-[184px] animate-pulse rounded-[16px] lg:flex-1" />
            ) : (
              <div className="mt-3.5 flex flex-col lg:flex-1 lg:min-h-0">
                {chartArea}
                {volumeStrip}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4.5">
              {timeframeTabs}
              {pressureBar}
            </div>
          </div>

          {/* Sağ ray (masaüstü) / altta (mobil): AI + istatistikler */}
          <div className="mt-3.5 flex flex-col gap-3.5 lg:mt-0 lg:w-[320px] lg:shrink-0">
            {aiCard}
            {statsCard}
          </div>
        </div>

        {/* Al/Sat aksiyon çubuğu — mobil */}
        <div className="ie-glass-flat flex gap-2.5 px-5 py-3.5 lg:hidden">
          <Link href="/portfolyo" className="flex h-[52px] flex-1 items-center justify-center rounded-[15px] border border-hairline text-[15px] font-bold text-ink">
            Sat
          </Link>
          <button onClick={() => setAddOpen(true)} className="flex h-[52px] flex-[1.4] items-center justify-center rounded-[15px] bg-up text-[15px] font-bold text-white">
            Al
          </button>
        </div>
      </div>

      {addOpen && (
        <QuickAddModal
          sembol={sembol}
          defaultFiyat={currentPrice}
          onClose={() => setAddOpen(false)}
          onSaved={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
