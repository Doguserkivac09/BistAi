'use client';

/**
 * "Portföyüm v2" ekranı (design_handoff_portfoyum, liquid glass) — hi-fi.
 * Pastel ambient + frosted cam. Bloklar: değer kartı (toplam değer + günlük
 * değişim + GERÇEK değer eğrisi + K/Z/Getiri/Maliyet şeridi) + allokasyon donut'u
 * (sektör dağılımı SVG) + AI portföy notu + Varlıklarım (mobil kart / masaüstü tablo).
 *
 * Değer eğrisi + günlük değişim, her pozisyonun OHLCV kapanışları toplanarak
 * GERÇEK portföy değeri serisinden hesaplanır (uydurma "nakit/eğri" yok).
 * Yönetim KORUNDU: ekle/düzenle/sil (/api/portfolyo POST/PATCH/DELETE) + CSV
 * + hedef fiyat + modal + auth durumu. Açık/karanlık tema (token sınıfları).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSector } from '@/lib/sectors';

interface Pozisyon {
  id: string;
  sembol: string;
  miktar: number;
  alis_fiyati: number;
  alis_tarihi: string;
  notlar: string | null;
  hedef_fiyat: number | null;
}
interface Grup {
  sembol: string;
  sektor: string;
  totalLot: number;
  avgCost: number;
  maliyet: number;
  price: number | null;
  deger: number | null;
  kar: number | null;
  karPct: number | null;
  positions: Pozisyon[];
}

const SECTOR_COLORS = ['#16a35b', '#6b6ff5', '#c98a00', '#9aa0ad', '#4aa84a', '#e5484d', '#3fce8a', '#8b8fff'];

const fmtTL = (v: number | null, d = 2) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const pnlColor = (v: number | null) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');
const todayISO = () => new Date().toISOString().slice(0, 10);

function buildSpark(vals: number[], w: number, h: number, pad = 4) {
  if (vals.length < 2) return { line: '', area: '' };
  const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / (vals.length - 1);
    const y = pad + (h - 2 * pad) * (1 - (v - min) / rng);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = 'M' + pts.join(' L');
  return { line, area: `${line} L ${(w - pad).toFixed(1)} ${(h - pad).toFixed(1)} L ${pad.toFixed(1)} ${(h - pad).toFixed(1)} Z` };
}

/** SVG donut dilimleri — stroke-dasharray/dashoffset. */
function makeDonut(items: { pct: number; color: string }[], r: number) {
  const C = 2 * Math.PI * r;
  let acc = 0;
  return items.map((a) => {
    const frac = a.pct / 100;
    const dash = frac * C;
    const offset = -acc * C;
    acc += frac;
    return { color: a.color, dashArray: `${dash.toFixed(2)} ${(C - dash).toFixed(2)}`, offset: offset.toFixed(2) };
  });
}

export function PortfoyumScreen() {
  const [positions, setPositions] = useState<Pozisyon[]>([]);
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [modal, setModal] = useState<'add' | { edit: Pozisyon } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadPositions = useCallback(async () => {
    const r = await fetch('/api/portfolyo');
    if (r.status === 401) { setAuthNeeded(true); setLoading(false); return; }
    const data = (await r.json()) as Pozisyon[];
    setPositions(Array.isArray(data) ? data : []);
    setLoading(false);
    // Her sembol için son ~30g kapanış serisi — gerçek fiyat + günlük değişim + değer eğrisi
    const syms = [...new Set((data ?? []).map((p) => p.sembol))];
    await Promise.all(
      syms.map(async (s) => {
        try {
          const j = await fetch(`/api/ohlcv?symbol=${s}&days=30`).then((res) => res.json());
          const closes: number[] = (j?.candles ?? []).map((c: { close: number }) => c.close).filter((v: unknown) => typeof v === 'number');
          if (closes.length) setSeries((prev) => ({ ...prev, [s]: closes }));
        } catch { /* fiyat yoksa — */ }
      }),
    );
  }, []);

  useEffect(() => { void loadPositions(); }, [loadPositions]);

  const groups = useMemo<Grup[]>(() => {
    const bySym = new Map<string, Pozisyon[]>();
    for (const p of positions) {
      const a = bySym.get(p.sembol) ?? [];
      a.push(p); bySym.set(p.sembol, a);
    }
    return [...bySym.entries()].map(([sembol, pos]) => {
      const totalLot = pos.reduce((s, p) => s + p.miktar, 0);
      const maliyet = pos.reduce((s, p) => s + p.miktar * p.alis_fiyati, 0);
      const price = series[sembol]?.at(-1) ?? null;
      const deger = price != null ? totalLot * price : null;
      const kar = deger != null ? deger - maliyet : null;
      return {
        sembol, sektor: getSector(sembol).name, totalLot,
        avgCost: totalLot > 0 ? maliyet / totalLot : 0, maliyet, price, deger, kar,
        karPct: kar != null && maliyet > 0 ? (kar / maliyet) * 100 : null,
        positions: pos,
      };
    }).sort((a, b) => (b.karPct ?? -Infinity) - (a.karPct ?? -Infinity));
  }, [positions, series]);

  const totalDeger = groups.reduce((s, g) => s + (g.deger ?? g.maliyet), 0);
  const totalMaliyet = groups.reduce((s, g) => s + g.maliyet, 0);
  const totalKar = totalDeger - totalMaliyet;
  const totalKarPct = totalMaliyet > 0 ? (totalKar / totalMaliyet) * 100 : 0;

  // Gerçek portföy değeri serisi (hizalı son N gün, lot×kapanış toplamı)
  const valueSeries = useMemo(() => {
    const withSeries = groups.filter((g) => (series[g.sembol]?.length ?? 0) >= 2);
    if (withSeries.length === 0) return [] as number[];
    const N = Math.min(30, ...withSeries.map((g) => series[g.sembol]!.length));
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      let v = 0;
      for (const g of withSeries) {
        const s = series[g.sembol]!;
        v += g.totalLot * s[s.length - N + i]!;
      }
      out.push(v);
    }
    return out;
  }, [groups, series]);

  // Günlük değişim (son iki kapanış)
  const { dayKar, dayPct } = useMemo(() => {
    let cur = 0, prev = 0;
    for (const g of groups) {
      const s = series[g.sembol];
      if (s && s.length >= 2) { cur += g.totalLot * s[s.length - 1]!; prev += g.totalLot * s[s.length - 2]!; }
    }
    return { dayKar: prev > 0 ? cur - prev : null, dayPct: prev > 0 ? ((cur - prev) / prev) * 100 : null };
  }, [groups, series]);

  // Sektör dağılımı (değer ağırlıklı) + renk
  const dagilim = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) m.set(g.sektor, (m.get(g.sektor) ?? 0) + (g.deger ?? g.maliyet));
    const tot = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()]
      .map(([name, v]) => ({ name, pct: (v / tot) * 100 }))
      .sort((a, b) => b.pct - a.pct)
      .map((d, i) => ({ ...d, color: SECTOR_COLORS[i % SECTOR_COLORS.length]! }));
  }, [groups]);

  const aiNote = useMemo(() => {
    if (groups.length === 0) return null;
    const dur = totalKar >= 0 ? 'kârda' : 'zararda';
    const top = dagilim[0]!;
    const cesit = dagilim.length >= 4 ? 'çeşitlendirme iyi' : dagilim.length >= 2 ? 'orta düzey çeşitlendirme' : 'tek sektöre yoğun — risk yüksek';
    return `Portföyün toplam %${Math.abs(totalKarPct).toFixed(1)} ${dur}. En ağır sektör ${top.name} (%${top.pct.toFixed(0)}); ${dagilim.length} sektöre yayılmış — ${cesit}.`;
  }, [groups, dagilim, totalKar, totalKarPct]);

  // ── yönetim ──
  async function submitAdd(form: HTMLFormElement) {
    setBusy(true); setErr(null);
    const f = new FormData(form);
    const body = {
      sembol: String(f.get('sembol') || '').toUpperCase().trim(),
      miktar: Number(f.get('miktar')),
      alis_fiyati: Number(f.get('alis_fiyati')),
      alis_tarihi: String(f.get('alis_tarihi') || todayISO()),
      hedef_fiyat: f.get('hedef_fiyat') ? Number(f.get('hedef_fiyat')) : null,
      notlar: String(f.get('notlar') || '') || null,
    };
    const r = await fetch('/api/portfolyo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json())?.error ?? 'Eklenemedi'); return; }
    setModal(null); await loadPositions();
  }
  async function submitEdit(form: HTMLFormElement, id: string) {
    setBusy(true); setErr(null);
    const f = new FormData(form);
    const body = { id, miktar: Number(f.get('miktar')), hedef_fiyat: f.get('hedef_fiyat') ? Number(f.get('hedef_fiyat')) : null, notlar: String(f.get('notlar') || '') || null };
    const r = await fetch('/api/portfolyo', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json())?.error ?? 'Güncellenemedi'); return; }
    setModal(null); await loadPositions();
  }
  async function remove(id: string) {
    if (!confirm('Bu pozisyon silinsin mi?')) return;
    const r = await fetch(`/api/portfolyo?id=${id}`, { method: 'DELETE' });
    if (r.ok) await loadPositions();
  }

  function downloadCSV() {
    const headers = ['Sembol', 'Lot', 'Ort. Maliyet', 'Güncel Fiyat', 'Değer', 'K/Z ₺', 'K/Z %'];
    const rows = groups.map((g) => [
      g.sembol, g.totalLot, g.avgCost.toFixed(2),
      g.price?.toFixed(2) ?? '', g.deger?.toFixed(2) ?? '',
      g.kar?.toFixed(2) ?? '', g.karPct?.toFixed(2) ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bistai-portfolyo-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (authNeeded) {
    return (
      <div className="ie-ambient min-h-full px-6 py-16 text-center">
        <p className="text-[15px] font-semibold text-ink">Portföyünü görmek için giriş yap.</p>
        <a href="/giris?redirect=/portfolyo" className="mt-3 inline-block rounded-[12px] bg-ink px-5 py-2.5 text-[14px] font-bold text-onink">Giriş yap</a>
      </div>
    );
  }

  const spark = buildSpark(valueSeries, 300, 52);
  const donut = makeDonut(dagilim, 30);
  const curveUp = valueSeries.length < 2 || valueSeries[valueSeries.length - 1]! >= valueSeries[0]!;

  // ── Paylaşılan bloklar ──
  const valueCard = (
    <div className="ie-glass-feature rounded-[22px] px-5 py-[18px] lg:rounded-[20px] lg:p-[18px]">
      <div className="text-[12px] font-medium text-t3">Toplam değer</div>
      <div className="flex items-end justify-between">
        <div className="mt-0.5 font-mono text-[30px] font-bold tracking-[-0.02em] text-ink lg:text-[28px]">
          {fmtTL(totalDeger, 0)} <span className="text-[16px] text-t3">₺</span>
        </div>
        <div className="text-right">
          <div className="font-mono text-[14px] font-semibold" style={{ color: pnlColor(dayPct) }}>{fmtPct(dayPct)}</div>
          {dayKar != null && (
            <div className="font-mono text-[11px] font-medium text-t3">
              {dayKar >= 0 ? '+' : ''}{fmtTL(dayKar, 0)} ₺ bugün
            </div>
          )}
        </div>
      </div>
      {spark.line ? (
        <svg width="100%" height="52" viewBox="0 0 300 52" preserveAspectRatio="none" className="mt-2.5">
          <defs>
            <linearGradient id="pf-curve" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={curveUp ? 'rgba(22,163,91,0.24)' : 'rgba(229,72,77,0.22)'} />
              <stop offset="1" stopColor="rgba(22,163,91,0)" />
            </linearGradient>
          </defs>
          <path d={spark.area} fill="url(#pf-curve)" />
          <path d={spark.line} fill="none" stroke={curveUp ? '#16a35b' : '#e5484d'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <div className="mt-2.5 h-[52px]" />
      )}
      <div className="mt-1.5 flex gap-5 border-t border-[rgba(80,90,120,0.14)] pt-3">
        <div>
          <div className="text-[10px] font-medium text-t3">Toplam K/Z</div>
          <div className="mt-0.5 font-mono text-[14px] font-semibold" style={{ color: pnlColor(totalKar) }}>
            {totalKar >= 0 ? '+' : ''}{fmtTL(totalKar, 0)} ₺
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-t3">Getiri</div>
          <div className="mt-0.5 font-mono text-[14px] font-semibold" style={{ color: pnlColor(totalKarPct) }}>{fmtPct(totalKarPct)}</div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-t3">Maliyet</div>
          <div className="mt-0.5 font-mono text-[14px] font-semibold text-ink">{fmtTL(totalMaliyet, 0)} ₺</div>
        </div>
      </div>
    </div>
  );

  const allocCard = dagilim.length > 0 && (
    <div className="ie-glass rounded-[18px] px-[17px] py-[15px]">
      <div className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">Dağılım</div>
      <div className="mt-3 flex items-center gap-4">
        <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
          {donut.map((d, i) => (
            <circle key={i} cx="42" cy="42" r="30" fill="none" stroke={d.color} strokeWidth="11" strokeDasharray={d.dashArray} strokeDashoffset={d.offset} transform="rotate(-90 42 42)" />
          ))}
          <text x="42" y="39" textAnchor="middle" className="fill-ink font-mono" style={{ fontSize: 15, fontWeight: 700 }}>{dagilim.length}</text>
          <text x="42" y="52" textAnchor="middle" className="fill-t3" style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.06em' }}>SEKTÖR</text>
        </svg>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {dagilim.slice(0, 5).map((d) => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-t2">{d.name}</span>
              <span className="font-mono text-[12px] font-semibold text-ink">%{d.pct.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const aiCard = aiNote && (
    <div className="ie-glass-ai flex flex-col rounded-[18px] px-[18px] py-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold tracking-[0.06em] text-ai">✦ AI</span>
        <span className="text-[13px] font-bold text-ink">Portföy notu</span>
      </div>
      <p className="mt-2.5 text-[13px] font-medium leading-[1.6] text-t2">{aiNote}</p>
      <Link href="/sohbet" className="mt-3 hidden h-10 items-center justify-center rounded-[12px] border border-[#e0e4ec] text-[13px] font-bold text-ink transition-colors hover:bg-white/60 lg:flex">
        AI ile analiz et
      </Link>
    </div>
  );

  function HoldingCard({ g }: { g: Grup }) {
    const open = expanded === g.sembol;
    return (
      <div className="ie-glass overflow-hidden rounded-[16px]">
        <div className="flex items-center gap-3 px-3.5 py-3 lg:px-4">
          <Link href={`/hisse/${g.sembol}`} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/70 bg-white/70 font-mono text-[11px] font-semibold text-ink">{g.sembol.slice(0, 2)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">{g.sembol}</span>
              <span className="block font-mono text-[11px] font-medium text-t3 lg:hidden">{fmtTL(g.totalLot, 0)} lot · ort. {fmtTL(g.avgCost)}</span>
              <span className="hidden truncate text-[11px] font-medium text-t3 lg:block">{g.sektor}</span>
            </span>
            {/* Masaüstü tablo sütunları */}
            <span className="hidden w-[70px] text-right font-mono text-[13px] font-semibold text-t2 lg:block">{fmtTL(g.totalLot, 0)}</span>
            <span className="hidden w-[90px] text-right font-mono text-[13px] font-semibold text-t2 lg:block">{fmtTL(g.avgCost)}</span>
            <span className="hidden w-[110px] text-right font-mono text-[13px] font-semibold text-ink lg:block">{fmtTL(g.deger, 0)} ₺</span>
            <span className="w-[92px] text-right">
              <span className="block font-mono text-[13px] font-semibold text-ink lg:hidden">{fmtTL(g.deger, 0)} ₺</span>
              <span className="block font-mono text-[13px] font-semibold" style={{ color: pnlColor(g.karPct) }}>{fmtPct(g.karPct)}</span>
            </span>
          </Link>
          <button
            onClick={() => setExpanded(open ? null : g.sembol)}
            className="shrink-0 rounded-[8px] px-2 py-1 text-[16px] leading-none text-t3 hover:bg-white/60"
            aria-label="Yönet"
            aria-expanded={open}
          >
            ⋯
          </button>
        </div>
        {open && (
          <div className="border-t border-white/50 bg-white/30 px-4 py-2">
            {g.positions.map((p) => {
              const kalan = p.hedef_fiyat && g.price ? ((p.hedef_fiyat - g.price) / g.price) * 100 : null;
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                  <span className="min-w-0">
                    <span className="font-mono text-t2">{fmtTL(p.miktar, 0)} lot × {fmtTL(p.alis_fiyati)} ₺ · {p.alis_tarihi}</span>
                    {p.hedef_fiyat && (
                      <span className="ml-2 font-mono text-[11px] text-ai">
                        🎯 {fmtTL(p.hedef_fiyat)} ₺{kalan != null ? ` (${kalan >= 0 ? '+' : ''}${kalan.toFixed(1)}%)` : ''}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button onClick={() => { setErr(null); setModal({ edit: p }); }} className="font-semibold text-ai hover:underline">Düzenle</button>
                    <button onClick={() => remove(p.id)} className="font-semibold text-down hover:underline">Sil</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[50px] -top-[50px] h-[250px] w-[280px] blur-[24px]" style={{ background: 'radial-gradient(circle,rgba(22,163,91,0.18),rgba(22,163,91,0) 68%)' }} />
        <div className="absolute -right-[60px] -top-[30px] h-[230px] w-[280px] blur-[26px]" style={{ background: 'radial-gradient(circle,rgba(107,111,245,0.18),rgba(107,111,245,0) 66%)' }} />
        <div className="absolute left-[30%] top-[40%] h-[280px] w-[280px] blur-[32px]" style={{ background: 'radial-gradient(circle,rgba(255,183,120,0.12),rgba(255,183,120,0) 70%)' }} />
      </div>

      <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
        {/* Başlık + aksiyonlar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[22px]">Portföyüm</h1>
            {groups.length > 0 && <p className="text-[12px] font-medium text-t3 lg:hidden">{groups.length} pozisyon</p>}
          </div>
          <div className="flex items-center gap-2">
            {groups.length > 0 && (
              <button onClick={downloadCSV} className="ie-glass-flat rounded-[12px] px-3 py-2.5 text-[13px] font-bold text-ink hover:opacity-90" title="CSV indir">↓ CSV</button>
            )}
            <button onClick={() => { setErr(null); setModal('add'); }} className="rounded-[12px] bg-up px-4 py-2.5 text-[13px] font-bold text-white hover:opacity-95">+ Ekle</button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3.5 lg:mt-5 lg:flex-row lg:gap-6">
          {/* Sol: özet + varlıklar */}
          <div className="flex min-w-0 flex-col gap-3.5 lg:flex-[1.7] lg:gap-4">
            {/* Mobil: değer kartı → donut → AI (masaüstünde sağ rayda) */}
            <div className="lg:hidden">
              {loading ? <div className="ie-glass h-[200px] animate-pulse rounded-[22px]" /> : valueCard}
            </div>
            <div className="lg:hidden">{allocCard}</div>
            <div className="lg:hidden">{aiCard}</div>

            {/* Masaüstü: 3 özet kutu */}
            <div className="hidden gap-3 lg:flex">
              <div className="ie-glass-flat flex-1 rounded-[14px] px-4 py-3">
                <div className="text-[11px] font-medium text-t3">Toplam K/Z</div>
                <div className="mt-0.5 font-mono text-[18px] font-bold" style={{ color: pnlColor(totalKar) }}>{totalKar >= 0 ? '+' : ''}{fmtTL(totalKar, 0)} ₺</div>
              </div>
              <div className="ie-glass-flat flex-1 rounded-[14px] px-4 py-3">
                <div className="text-[11px] font-medium text-t3">Getiri</div>
                <div className="mt-0.5 font-mono text-[18px] font-bold" style={{ color: pnlColor(totalKarPct) }}>{fmtPct(totalKarPct)}</div>
              </div>
              <div className="ie-glass-flat flex-1 rounded-[14px] px-4 py-3">
                <div className="text-[11px] font-medium text-t3">Maliyet</div>
                <div className="mt-0.5 font-mono text-[18px] font-bold text-ink">{fmtTL(totalMaliyet, 0)} ₺</div>
              </div>
            </div>

            {/* Varlıklar başlığı */}
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-extrabold tracking-[-0.02em] text-ink lg:text-[17px]">Varlıklarım</span>
              <span className="text-[11px] font-semibold text-t3">K/Z&apos;ye göre</span>
            </div>

            {/* Masaüstü tablo başlığı */}
            {groups.length > 0 && (
              <div className="hidden items-center px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3 lg:flex">
                <span className="flex-1 pl-[52px]">Sembol</span>
                <span className="w-[70px] text-right">Lot</span>
                <span className="w-[90px] text-right">Maliyet</span>
                <span className="w-[110px] text-right">Değer</span>
                <span className="w-[92px] text-right">K/Z</span>
                <span className="w-8" />
              </div>
            )}

            <div className="flex flex-col gap-2.5 lg:gap-1.5">
              {loading ? (
                [...Array(4)].map((_, i) => <div key={i} className="ie-glass h-[64px] animate-pulse rounded-[16px]" />)
              ) : groups.length === 0 ? (
                <div className="ie-glass rounded-[16px] px-4 py-10 text-center text-[13px] font-medium text-t2">
                  Henüz pozisyon yok. &quot;+ Ekle&quot; ile ilk hisseni ekle.
                </div>
              ) : (
                groups.map((g) => <HoldingCard key={g.sembol} g={g} />)
              )}
            </div>
          </div>

          {/* Sağ ray (masaüstü): değer kartı + donut + AI */}
          <div className="hidden w-[320px] shrink-0 flex-col gap-3.5 lg:flex">
            {loading ? <div className="ie-glass h-[220px] animate-pulse rounded-[20px]" /> : valueCard}
            {allocCard}
            {aiCard}
          </div>
        </div>
      </div>

      {/* ── Modal: ekle / düzenle ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !busy && setModal(null)}>
          <div className="w-full max-w-[420px] rounded-[20px] bg-panel p-5 shadow-[0_20px_60px_-12px_rgba(15,20,30,0.4)]" onClick={(e) => e.stopPropagation()}>
            <div className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
              {modal === 'add' ? 'Pozisyon ekle' : `${modal.edit.sembol} · düzenle`}
            </div>
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(e) => { e.preventDefault(); modal === 'add' ? submitAdd(e.currentTarget) : submitEdit(e.currentTarget, modal.edit.id); }}
            >
              {modal === 'add' ? (
                <>
                  <Field name="sembol" label="Sembol" placeholder="THYAO" required defaultValue="" />
                  <div className="flex gap-3">
                    <Field name="miktar" label="Lot" type="number" placeholder="100" required defaultValue="" />
                    <Field name="alis_fiyati" label="Alış fiyatı ₺" type="number" step="0.01" placeholder="245.30" required defaultValue="" />
                  </div>
                  <Field name="alis_tarihi" label="Alış tarihi" type="date" required defaultValue={todayISO()} />
                  <Field name="hedef_fiyat" label="Hedef fiyat ₺ (ops.)" type="number" step="0.01" defaultValue="" />
                  <Field name="notlar" label="Not (ops.)" defaultValue="" />
                </>
              ) : (
                <>
                  <Field name="miktar" label="Lot" type="number" required defaultValue={String(modal.edit.miktar)} />
                  <Field name="hedef_fiyat" label="Hedef fiyat ₺ (ops.)" type="number" step="0.01" defaultValue={modal.edit.hedef_fiyat ? String(modal.edit.hedef_fiyat) : ''} />
                  <Field name="notlar" label="Not (ops.)" defaultValue={modal.edit.notlar ?? ''} />
                </>
              )}
              {err && <p className="text-[12px] font-medium text-down">{err}</p>}
              <div className="mt-1 flex gap-2">
                <button type="button" disabled={busy} onClick={() => setModal(null)} className="flex-1 rounded-[12px] bg-fill px-4 py-2.5 text-[14px] font-bold text-ink disabled:opacity-50">Vazgeç</button>
                <button type="submit" disabled={busy} className="flex-1 rounded-[12px] bg-ink px-4 py-2.5 text-[14px] font-bold text-onink disabled:opacity-50">{busy ? '...' : 'Kaydet'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ name, label, defaultValue, type = 'text', placeholder, required, step }: {
  name: string; label: string; defaultValue: string; type?: string; placeholder?: string; required?: boolean; step?: string;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[11px] font-semibold text-t3">{label}</span>
      <input
        name={name} type={type} placeholder={placeholder} required={required} step={step} defaultValue={defaultValue}
        className="rounded-[11px] border border-hairline bg-fill px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink"
      />
    </label>
  );
}
