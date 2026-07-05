'use client';

/**
 * "Portföyüm" ekranı (design_handoff_bistai/bistAI Sayfalar.dc.html) — hi-fi.
 * Açık tema; değer kartı (koyu) + varlıklar (gruplu) + dağılım + AI portföy notu.
 * Yönetim KORUNDU: ekle/düzenle/sil (mevcut /api/portfolyo POST/PATCH/DELETE).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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

const fmtTL = (v: number | null, d = 2) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const pnlColor = (v: number | null, onDark = false) =>
  v == null ? '#9aa0ad' : v >= 0 ? (onDark ? '#3fce8a' : '#16a35b') : (onDark ? '#ff5d62' : '#e5484d');
const todayISO = () => new Date().toISOString().slice(0, 10);

export function PortfoyumScreen() {
  const [positions, setPositions] = useState<Pozisyon[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // modal: add | edit | null
  const [modal, setModal] = useState<'add' | { edit: Pozisyon } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadPositions = useCallback(async () => {
    const r = await fetch('/api/portfolyo');
    if (r.status === 401) { setAuthNeeded(true); setLoading(false); return; }
    const data = (await r.json()) as Pozisyon[];
    setPositions(Array.isArray(data) ? data : []);
    setLoading(false);
    // fiyatları çek (benzersiz semboller)
    const syms = [...new Set((data ?? []).map((p) => p.sembol))];
    await Promise.all(
      syms.map(async (s) => {
        try {
          const res = await fetch(`/api/ohlcv?symbol=${s}&days=5`);
          const j = await res.json();
          const c = j?.candles?.[j.candles.length - 1]?.close;
          if (typeof c === 'number') setPrices((prev) => ({ ...prev, [s]: c }));
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
      const price = prices[sembol] ?? null;
      const deger = price != null ? totalLot * price : null;
      const kar = deger != null ? deger - maliyet : null;
      return {
        sembol, sektor: getSector(sembol).name, totalLot,
        avgCost: totalLot > 0 ? maliyet / totalLot : 0, maliyet, price, deger, kar,
        karPct: kar != null && maliyet > 0 ? (kar / maliyet) * 100 : null,
        positions: pos,
      };
    }).sort((a, b) => (b.deger ?? 0) - (a.deger ?? 0));
  }, [positions, prices]);

  const totalDeger = groups.reduce((s, g) => s + (g.deger ?? g.maliyet), 0);
  const totalMaliyet = groups.reduce((s, g) => s + g.maliyet, 0);
  const totalKar = totalDeger - totalMaliyet;
  const totalKarPct = totalMaliyet > 0 ? (totalKar / totalMaliyet) * 100 : 0;

  // sektör dağılımı
  const dagilim = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) m.set(g.sektor, (m.get(g.sektor) ?? 0) + (g.deger ?? g.maliyet));
    const tot = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].map(([name, v]) => ({ name, pct: (v / tot) * 100 })).sort((a, b) => b.pct - a.pct);
  }, [groups]);

  const aiNote = useMemo(() => {
    if (groups.length === 0) return null;
    const dur = totalKar >= 0 ? 'kârda' : 'zararda';
    const top = dagilim[0];
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
      <div className="px-6 py-16 text-center">
        <p className="text-[15px] font-semibold text-ink">Portföyünü görmek için giriş yap.</p>
        <a href="/giris?redirect=/portfolyo" className="mt-3 inline-block rounded-[12px] bg-ink px-5 py-2.5 text-[14px] font-bold text-onink">Giriş yap</a>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 lg:px-7 lg:py-[26px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[28px]">Portföyüm</h1>
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <button onClick={downloadCSV} className="rounded-[12px] bg-fill px-3 py-2.5 text-[13px] font-bold text-ink hover:opacity-90" title="CSV indir">
              ↓ CSV
            </button>
          )}
          <button onClick={() => { setErr(null); setModal('add'); }} className="rounded-[12px] bg-ink px-4 py-2.5 text-[13px] font-bold text-onink hover:opacity-90">
            + Ekle
          </button>
        </div>
      </div>

      <div className="mt-[22px] flex flex-col gap-6 lg:flex-row">
        {/* Sol: değer kartı + varlıklar */}
        <div className="flex min-w-0 flex-col gap-[18px] lg:flex-[1.7]">
          {/* Değer kartı (koyu — her iki temada koyu kalır) */}
          <div className="rounded-[22px] bg-surface-dark p-5 lg:p-[22px]">
            <div className="text-[12px] font-semibold text-t3">Toplam değer</div>
            <div className="mt-1 font-mono text-[30px] font-bold tracking-[-0.03em] text-white lg:text-[36px]">
              {fmtTL(totalDeger, 0)} <span className="text-[18px] text-t3">₺</span>
            </div>
            <div className="mt-2 flex items-center gap-2 font-mono text-[14px] font-semibold" style={{ color: pnlColor(totalKar, true) }}>
              <span>{totalKar >= 0 ? '+' : ''}{fmtTL(totalKar, 0)} ₺</span>
              <span>({fmtPct(totalKarPct)})</span>
              <span className="text-[11px] font-medium text-t3">tüm zamanlar</span>
            </div>
          </div>

          {/* Varlıklar */}
          <div>
            <div className="mb-3 text-[16px] font-extrabold tracking-[-0.02em] text-ink lg:text-[17px]">Varlıklarım</div>
            {loading ? (
              <div className="flex flex-col gap-[11px]">{[...Array(4)].map((_, i) => <div key={i} className="h-[68px] animate-pulse rounded-2xl border border-hairline bg-panel" />)}</div>
            ) : groups.length === 0 ? (
              <div className="rounded-2xl border border-hairline bg-panel px-4 py-10 text-center text-[13px] font-medium text-t2">
                Henüz pozisyon yok. &quot;+ Ekle&quot; ile ilk hisseni ekle.
              </div>
            ) : (
              <div className="flex flex-col gap-[11px]">
                {groups.map((g) => (
                  <div key={g.sembol} className="rounded-[18px] border border-hairline bg-panel">
                    <div className="flex items-center gap-3.5 px-4 py-[14px]">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-fill font-mono text-[12px] font-semibold text-ink">{g.sembol.slice(0, 2)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold text-ink">{g.sembol}</div>
                        <div className="text-[12px] font-medium text-t3">{fmtTL(g.totalLot, 0)} lot · ort. {fmtTL(g.avgCost)} ₺</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[14px] font-semibold text-ink">{fmtTL(g.deger, 0)} ₺</div>
                        <div className="font-mono text-[12px] font-semibold" style={{ color: pnlColor(g.kar) }}>{fmtPct(g.karPct)}</div>
                      </div>
                      <button onClick={() => setExpanded(expanded === g.sembol ? null : g.sembol)} className="ml-1 shrink-0 rounded-[8px] px-2 py-1 text-[16px] text-t3 hover:bg-fill" title="Yönet">⋯</button>
                    </div>
                    {expanded === g.sembol && (
                      <div className="border-t border-hairline px-4 py-2">
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
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sağ: dağılım + AI notu */}
        <div className="flex w-full flex-col gap-[18px] lg:w-[320px]">
          {dagilim.length > 0 && (
            <div className="rounded-[18px] border border-[#f0f1f3] p-[18px]">
              <div className="text-[15px] font-extrabold tracking-[-0.01em] text-ink">Dağılım</div>
              <div className="mt-4 flex flex-col gap-3">
                {dagilim.map((d) => (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-t2">{d.name}</span>
                      <span className="font-mono font-semibold text-ink">%{d.pct.toFixed(0)}</span>
                    </div>
                    <div className="mt-1 h-[6px] overflow-hidden rounded-full bg-fill">
                      <div className="h-full rounded-full bg-ink" style={{ width: `${d.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {aiNote && (
            <div className="rounded-[18px] border border-ai-panel-border bg-ai-panel p-[18px]">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-ai">✦ AI</span>
                <span className="text-[12px] font-semibold text-t2">Portföy notu</span>
              </div>
              <p className="mt-2 text-[13px] font-medium leading-[1.55] text-t2">{aiNote}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: ekle / düzenle ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !busy && setModal(null)}>
          <div className="w-full max-w-[420px] rounded-[20px] bg-panel p-5" onClick={(e) => e.stopPropagation()}>
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
