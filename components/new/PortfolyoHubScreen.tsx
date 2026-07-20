'use client';

/**
 * "Portföyüm" hub kabuğu (design_handoff_portfoyum_hub, liquid glass) — hi-fi.
 * Mevcut pozisyon/K-Z sayfası (`PortfoyumScreen`) DEĞİŞMEDEN "Özet" sekmesi
 * olarak korunur; handoff'un istediği 3 yeni sekme (Takip Listem / Alarmlar /
 * Sinyal Takip) buraya eklendi. Handoff'un kendi notu: bu hub "takip/alarm/
 * sinyal odaklı", pozisyon/allokasyon ayrı `PortfoyumScreen`'de kalıyor.
 *
 * Veri: /api/watchlist + /api/smart-signal + /api/ohlcv (Takip Listem) ·
 * /api/price-alerts (Alarmlar — CRUD) · /api/smart-signal (Sinyal Takip,
 * Bugün ekranındaki sinyal akışıyla AYNI türetim mantığı — tüm BIST'te
 * bugün öne çıkan akıllı para/teknik/verdict/akış sinyalleri).
 *
 * Dürüstlük notu: `price_alerts` şemasında yalnızca FİYAT alarmı var
 * (verdict/hacim/haber alarmı YOK) ve aktif/pasif TOGGLE endpoint'i yok
 * (yalnızca oluştur/sil). Handoff'un 4-türlü + toggle'lı alarm listesi bu
 * yüzden uygulanmadı — mevcut gerçek şema dürüstçe yansıtıldı.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSector } from '@/lib/sectors';
import type { SmartSignalResult } from '@/lib/smart-signal/types';
import { PortfoyumScreen } from '@/components/new/PortfoyumScreen';
import { toast } from 'sonner';

const fmtPrice = (v: number | null) => (v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const pctColor = (v: number | null) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');

const VERDICT: Record<string, { label: string; color: string; bg: string }> = {
  'Strong Watch': { label: 'Güçlü İzle', color: '#16a35b', bg: 'rgba(22,163,91,0.12)' },
  Consider: { label: 'Değerlendir', color: '#4aa84a', bg: 'rgba(74,168,74,0.12)' },
  Watch: { label: 'İzle', color: '#c98a00', bg: 'rgba(201,138,0,0.12)' },
  Avoid: { label: 'Uzak Dur', color: '#8a909b', bg: 'rgba(138,144,155,0.14)' },
};

type FeedType = 'smart' | 'brk' | 'vd' | 'vol';
const FEED_META: Record<FeedType, { label: string; color: string; bg: string }> = {
  smart: { label: 'Akıllı para', color: '#6b6ff5', bg: 'rgba(107,111,245,0.14)' },
  brk: { label: 'Teknik', color: '#0e9f6e', bg: 'rgba(14,159,110,0.14)' },
  vd: { label: 'Verdict', color: '#0e8fb7', bg: 'rgba(14,143,183,0.14)' },
  vol: { label: 'Hacim', color: '#c98a00', bg: 'rgba(201,138,0,0.14)' },
};
const FEED_FILTERS: Array<{ key: 'all' | FeedType; label: string }> = [
  { key: 'all', label: 'Tümü' },
  { key: 'smart', label: 'Akıllı para' },
  { key: 'brk', label: 'Teknik' },
  { key: 'vd', label: 'Verdict' },
  { key: 'vol', label: 'Hacim' },
];
function feedTypeOf(r: SmartSignalResult): FeedType | null {
  if (r.flags.includes('smart_money_entered')) return 'smart';
  if (r.technical_score >= 6) return 'brk';
  if (r.status === 'STRONG') return 'vd';
  if (r.flags.includes('accumulation') || r.flags.includes('distribution')) return 'vol';
  return null;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-[28px] w-[80px]" />;
  const w = 80, h = 28;
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / rng) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Takip Listem ─────────────────────────────────────────────────────────
function TakipListemTab() {
  const [rows, setRows] = useState<Array<{ sembol: string }>>([]);
  const [signals, setSignals] = useState<SmartSignalResult[]>([]);
  const [sparks, setSparks] = useState<Map<string, number[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch('/api/watchlist').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/smart-signal').then((r) => (r.ok ? r.json() : { results: [] })),
    ]).then(async ([w, s]) => {
      if (cancelled) return;
      const watch: Array<{ sembol: string }> = w.status === 'fulfilled' ? (w.value ?? []) : [];
      const sig: SmartSignalResult[] = s.status === 'fulfilled' ? (s.value?.results ?? []) : [];
      setRows(watch);
      setSignals(sig);
      setLoading(false);

      const entries = await Promise.allSettled(
        watch.slice(0, 15).map(async (w2) => {
          const j = await fetch(`/api/ohlcv?symbol=${w2.sembol}&days=20`).then((r) => r.json());
          const c: Array<{ close: number }> = j?.candles ?? [];
          return [w2.sembol, c.map((x) => x.close)] as const;
        })
      );
      if (cancelled) return;
      const map = new Map<string, number[]>();
      for (const e of entries) if (e.status === 'fulfilled') map.set(e.value[0], e.value[1]);
      setSparks(map);
    });
    return () => { cancelled = true; };
  }, []);

  const sigMap = useMemo(() => new Map(signals.map((r) => [r.symbol, r])), [signals]);
  // Fiyat/değişim smart-signal'e BAĞIMLI DEĞİL: tarama gecikse/boş olsa da (hafta başı,
  // cron öncesi) zaten sparkline için çekilen OHLCV kapanışlarından türetilir.
  const list = useMemo(
    () =>
      rows.map((w) => {
        const r = sigMap.get(w.sembol) ?? null;
        const c = sparks.get(w.sembol) ?? [];
        const last = c.length > 0 ? c[c.length - 1]! : null;
        const prev = c.length > 1 ? c[c.length - 2]! : null;
        const price = r?.price ?? last;
        const change =
          r?.changePercent ?? (last != null && prev != null && prev !== 0 ? ((last - prev) / prev) * 100 : null);
        return { sembol: w.sembol, r, price, change };
      }),
    [rows, sigMap, sparks],
  );
  // Veri gelmemiş sembol ne yükselen ne düşen sayılır (eskiden null → "yükselen" oluyordu)
  const rising = list.filter((x) => x.change != null && x.change >= 0).length;
  const falling = list.filter((x) => x.change != null && x.change < 0).length;
  const verdictCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { r } of list) if (r) c[r.action] = (c[r.action] ?? 0) + 1;
    return c;
  }, [list]);

  return (
    <div className="flex flex-col gap-3.5 lg:flex-row lg:gap-6">
      <div className="min-w-0 lg:flex-[1.7]">
        <div className="ie-glass overflow-hidden rounded-[18px]">
          <div className="hidden grid-cols-[1fr_100px_90px_140px] gap-2 border-b border-hairline px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.05em] text-t3 lg:grid">
            <span>Sembol</span><span className="text-right">Fiyat</span><span className="text-right">Değişim</span><span className="text-right">Verdict</span>
          </div>
          {loading ? (
            <div className="flex flex-col gap-2 p-4">{[...Array(6)].map((_, i) => <div key={i} className="h-[52px] animate-pulse rounded-[12px] bg-fill" />)}</div>
          ) : list.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] font-medium text-t3">
              Takip listen boş. Hisse detayında ★ ile ekleyebilirsin.
            </div>
          ) : (
            list.map(({ sembol, r, price, change }) => {
              const v = r ? VERDICT[r.action] ?? VERDICT.Avoid : null;
              return (
                <Link key={sembol} href={`/hisse/${sembol}`} className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0 hover:bg-fill lg:grid lg:grid-cols-[1fr_100px_90px_140px] lg:gap-2">
                  <div className="min-w-0 flex-1 lg:flex-none">
                    <div className="text-[13px] font-bold text-ink">{sembol}</div>
                    <div className="truncate text-[11px] font-medium text-t3">{getSector(sembol).name}</div>
                  </div>
                  <div className="hidden lg:flex lg:justify-end">
                    <Sparkline values={sparks.get(sembol) ?? []} color={change != null && change < 0 ? '#e5484d' : '#16a35b'} />
                  </div>
                  <span className="hidden text-right font-mono text-[13px] font-semibold text-ink lg:block">{price != null ? `${fmtPrice(price)} ₺` : '—'}</span>
                  <span className="shrink-0 text-right font-mono text-[13px] font-semibold lg:block" style={{ color: change != null ? pctColor(change) : '#9aa0ad' }}>{change != null ? fmtPct(change) : '—'}</span>
                  <span className="shrink-0 text-right">
                    {v ? <span className="rounded-[8px] px-2.5 py-1 text-[11px] font-extrabold" style={{ background: v.bg, color: v.color }}>{v.label}</span> : <span className="text-[11px] text-t3" title="Günlük tarama henüz koşmadı">Bekliyor</span>}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-3.5 lg:mt-0 lg:w-[300px] lg:shrink-0">
        <div className="ie-glass rounded-[16px] px-[17px] py-[15px]">
          <div className="mb-2 text-[14px] font-extrabold text-ink">Takip özeti</div>
          <div className="flex gap-4">
            <div><div className="text-[11px] font-medium text-t3">Yükselen</div><div className="font-mono text-[18px] font-bold text-up">{rising}</div></div>
            <div><div className="text-[11px] font-medium text-t3">Düşen</div><div className="font-mono text-[18px] font-bold text-down">{falling}</div></div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {Object.entries(VERDICT).map(([k, v]) => (
              verdictCounts[k] ? (
                <div key={k} className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold" style={{ color: v.color }}>{v.label}</span>
                  <span className="font-mono font-bold text-ink">{verdictCounts[k]}</span>
                </div>
              ) : null
            ))}
          </div>
        </div>
        <div className="ie-glass-flat rounded-[16px] px-[17px] py-[15px]">
          <p className="text-[12px] font-medium leading-[1.5] text-t2">
            {list.length === 0 ? 'Takip listeni oluşturunca burada özet göreceksin.' : `${list.length} sembol takipte · ${rising} yükseliyor, ${falling} düşüyor.`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Alarmlar ──────────────────────────────────────────────────────────────
interface PriceAlert { id: string; sembol: string; target_price: number; direction: 'above' | 'below'; note: string | null; triggered: boolean; triggered_at: string | null; created_at: string }

function AlarmlarTab() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sembol, setSembol] = useState('');
  const [price, setPrice] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch('/api/price-alerts')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { alerts?: PriceAlert[] } | null) => setAlerts(d?.alerts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!sembol || !price) return;
    setBusy(true);
    try {
      const r = await fetch('/api/price-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sembol: sembol.toUpperCase(), target_price: Number(price), direction, note: note || undefined }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j?.error ?? 'Alarm oluşturulamadı'); return; }
      toast.success(`${sembol.toUpperCase()} için alarm kuruldu`);
      setSembol(''); setPrice(''); setNote('');
      load();
    } catch { toast.error('Alarm oluşturulamadı'); }
    finally { setBusy(false); }
  }

  async function removeAlert(id: string) {
    try {
      await fetch(`/api/price-alerts?id=${id}`, { method: 'DELETE' });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch { toast.error('Silinemedi'); }
  }

  const active = alerts.filter((a) => !a.triggered);
  const todayTriggered = alerts.filter((a) => a.triggered && a.triggered_at && new Date(a.triggered_at).toDateString() === new Date().toDateString());

  return (
    <div className="flex flex-col gap-3.5 lg:flex-row lg:gap-6">
      <div className="min-w-0 lg:flex-[1.7]">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="ie-glass-flat rounded-[14px] px-3 py-3 text-center"><div className="font-mono text-[19px] font-bold text-ink">{active.length}</div><div className="text-[11px] font-medium text-t3">Aktif alarm</div></div>
          <div className="ie-glass-flat rounded-[14px] px-3 py-3 text-center"><div className="font-mono text-[19px] font-bold text-up">{todayTriggered.length}</div><div className="text-[11px] font-medium text-t3">Bugün tetiklenen</div></div>
          <div className="ie-glass-flat rounded-[14px] px-3 py-3 text-center"><div className="font-mono text-[19px] font-bold text-ink">{alerts.length}</div><div className="text-[11px] font-medium text-t3">Toplam</div></div>
        </div>

        <div className="ie-glass mt-3.5 rounded-[18px] p-2">
          {loading ? (
            <div className="flex flex-col gap-2 p-3">{[...Array(4)].map((_, i) => <div key={i} className="h-[52px] animate-pulse rounded-[12px] bg-fill" />)}</div>
          ) : alerts.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] font-medium text-t3">Henüz alarm kurmadın.</div>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-b border-hairline px-3 py-3 last:border-0">
                <span className="shrink-0 text-[16px]">🔔</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-ink">{a.sembol}</div>
                  <div className="text-[11px] font-medium text-t3">{a.direction === 'above' ? 'Üzerine çıkınca' : 'Altına düşünce'} {fmtPrice(a.target_price)} ₺{a.note ? ` · ${a.note}` : ''}</div>
                </div>
                <span className="shrink-0 rounded-[7px] px-2 py-1 text-[11px] font-bold" style={{ background: a.triggered ? 'rgba(22,163,91,0.14)' : 'rgba(107,111,245,0.14)', color: a.triggered ? '#16a35b' : '#6b6ff5' }}>
                  {a.triggered ? 'Tetiklendi' : 'Aktif'}
                </span>
                <button onClick={() => removeAlert(a.id)} className="shrink-0 text-[12px] font-semibold text-t3 hover:text-down">Sil</button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-1 lg:mt-0 lg:w-[300px] lg:shrink-0">
        <form onSubmit={createAlert} className="ie-glass flex flex-col gap-2.5 rounded-[16px] px-[17px] py-[15px]">
          <div className="text-[14px] font-extrabold text-ink">Yeni alarm</div>
          <input value={sembol} onChange={(e) => setSembol(e.target.value.toUpperCase())} placeholder="Sembol (örn. THYAO)" required
            className="rounded-[10px] border border-hairline bg-fill px-3 py-2 text-[13px] font-semibold text-ink outline-none focus:border-ink" />
          <input type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Hedef fiyat ₺" required
            className="rounded-[10px] border border-hairline bg-fill px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-ink" />
          <div className="flex gap-2">
            {(['above', 'below'] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDirection(d)}
                className={`flex-1 rounded-[10px] px-2 py-2 text-[12px] font-bold transition-colors ${direction === d ? 'bg-ink text-onink' : 'bg-fill text-t3'}`}>
                {d === 'above' ? '↑ Üzerine' : '↓ Altına'}
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder="Not (opsiyonel)"
            className="rounded-[10px] border border-hairline bg-fill px-3 py-2 text-[13px] text-ink outline-none focus:border-ink" />
          <button type="submit" disabled={busy} className="rounded-[10px] bg-up px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">{busy ? '…' : 'Alarm kur'}</button>
          <p className="text-[10px] font-medium leading-[1.4] text-t4">Şu an yalnızca fiyat alarmı destekleniyor; tetiklenen alarmlar için email gönderilir.</p>
        </form>
      </div>
    </div>
  );
}

// ── Sinyal Takip ──────────────────────────────────────────────────────────
// KULLANICININ KENDİ EVRENİ: portföy + takip listesi. Tüm BIST taranırsa bu sekme
// Fırsatlar sayfasının kopyası olur (kullanıcı geri bildirimi) — burası "senin
// hisselerinde bugün ne oluyor?" sorusunu yanıtlar. Sinyali olmayan sembol de
// listede kalır ("Sinyal yok"), böylece takip gerçekten takip olur, liste boşalmaz.
function SinyalTakipTab() {
  const [signals, setSignals] = useState<SmartSignalResult[]>([]);
  const [scoredAt, setScoredAt] = useState<string | null>(null);
  const [held, setHeld] = useState<string[]>([]);
  const [watched, setWatched] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | FeedType>('all');

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch('/api/smart-signal').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/portfolyo').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/watchlist').then((r) => (r.ok ? r.json() : [])),
    ]).then(([s, p, w]) => {
      if (cancelled) return;
      const sd: { results?: SmartSignalResult[]; scoredAt?: string } | null = s.status === 'fulfilled' ? s.value : null;
      setSignals(sd?.results ?? []);
      setScoredAt(sd?.scoredAt ?? null);
      const pos: Array<{ sembol: string }> = p.status === 'fulfilled' ? (p.value ?? []) : [];
      const wl: Array<{ sembol: string }> = w.status === 'fulfilled' ? (w.value ?? []) : [];
      setHeld([...new Set(pos.map((x) => x.sembol))]);
      setWatched(wl.map((x) => x.sembol));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const sigMap = useMemo(() => new Map(signals.map((r) => [r.symbol, r])), [signals]);
  const rows = useMemo(() => {
    const heldSet = new Set(held);
    return [...new Set([...held, ...watched])]
      .map((sym) => {
        const r = sigMap.get(sym) ?? null;
        return { sym, held: heldSet.has(sym), r, type: r ? feedTypeOf(r) : null };
      })
      .sort((a, b) => {
        if (!!a.type !== !!b.type) return a.type ? -1 : 1; // sinyali olan önce
        return (b.r?.total_score ?? -1) - (a.r?.total_score ?? -1);
      });
  }, [held, watched, sigMap]);

  const withSignal = rows.filter((x) => x.type !== null);
  const filtered = filter === 'all' ? rows : rows.filter((x) => x.type === filter);
  const typeCounts = useMemo(() => {
    const c: Record<FeedType, number> = { smart: 0, brk: 0, vd: 0, vol: 0 };
    for (const { type } of withSignal) if (type) c[type]++;
    return c;
  }, [withSignal]);

  return (
    <div className="flex flex-col gap-3.5 lg:flex-row lg:gap-6">
      <div className="min-w-0 lg:flex-[1.7]">
        <div className="flex flex-wrap gap-1.5">
          {FEED_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${filter === f.key ? 'bg-ink text-onink' : 'bg-fill text-t3 hover:text-ink'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {loading ? (
            [...Array(5)].map((_, i) => <div key={i} className="ie-glass h-[68px] animate-pulse rounded-[16px]" />)
          ) : rows.length === 0 ? (
            <div className="ie-glass rounded-[16px] px-4 py-8 text-center text-[13px] font-medium text-t3">
              Portföyün ve takip listen boş. Hisse ekle ya da hisse detayında ★ ile takibe al — sinyalleri burada izleyeyim.
            </div>
          ) : filtered.length === 0 ? (
            <div className="ie-glass rounded-[16px] px-4 py-8 text-center text-[13px] font-medium text-t3">
              Senin hisselerinde bu türde bugün sinyal yok.
            </div>
          ) : (
            filtered.map(({ sym, held: isHeld, r, type }) => {
              const m = type ? FEED_META[type] : null;
              const v = r ? VERDICT[r.action] ?? VERDICT.Avoid : null;
              return (
                <Link key={sym} href={`/hisse/${sym}`} className="ie-glass flex items-center gap-3 rounded-[16px] px-4 py-3 hover:border-white">
                  {m ? (
                    <span className="w-[76px] shrink-0 rounded-[7px] px-2 py-1 text-center text-[10px] font-extrabold uppercase" style={{ background: m.bg, color: m.color }}>{m.label}</span>
                  ) : (
                    <span className="w-[76px] shrink-0 rounded-[7px] bg-fill px-2 py-1 text-center text-[10px] font-bold uppercase text-t4">Sinyal yok</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-ink">{sym}</span>
                      <span
                        className="shrink-0 rounded-[5px] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.03em]"
                        style={isHeld ? { background: 'rgba(107,111,245,0.14)', color: '#6b6ff5' } : { background: 'rgba(14,143,183,0.12)', color: '#0e8fb7' }}
                      >
                        {isHeld ? 'Portföy' : 'Takip'}
                      </span>
                    </div>
                    <div className="truncate text-[11px] font-medium text-t3">{r?.summary ?? 'Bugün dikkat çeken bir hareket yok.'}</div>
                  </div>
                  {v && <span className="shrink-0 rounded-[8px] px-2.5 py-1 text-[11px] font-extrabold" style={{ background: v.bg, color: v.color }}>{v.label}</span>}
                  <span className="shrink-0 font-mono text-[12px] font-semibold" style={{ color: pctColor(r?.changePercent ?? null) }}>{fmtPct(r?.changePercent ?? null)}</span>
                </Link>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-3.5 lg:mt-0 lg:w-[300px] lg:shrink-0">
        <div className="ie-glass-ai rounded-[16px] px-[17px] py-[15px]">
          <div className="flex items-center gap-2"><span className="font-mono text-[11px] font-bold text-ai">✦</span><span className="text-[13px] font-bold text-ink">Sinyal özeti</span></div>
          <p className="mt-2 text-[13px] font-medium leading-[1.5] text-t2">
            {rows.length === 0
              ? 'Henüz izlediğin hisse yok — portföyüne ekle ya da ★ ile takibe al.'
              : withSignal.length === 0
                ? `İzlediğin ${rows.length} hissenin hiçbirinde bugün dikkat çeken sinyal yok — sakin gün.`
                : `İzlediğin ${rows.length} hisseden ${withSignal.length} tanesinde bugün sinyal var: ${typeCounts.smart} akıllı para, ${typeCounts.brk} teknik, ${typeCounts.vd} verdict, ${typeCounts.vol} akış.`}
          </p>
          <p className="mt-1.5 text-[11px] font-medium text-t4">
            Bu sekme yalnızca <strong className="font-bold text-t3">portföyün + takip listendeki</strong> hisseleri
            izler. Tüm BIST taraması için Fırsatlar sayfasına bak.
          </p>
          {scoredAt && <p className="mt-2 text-[10px] font-medium text-t4">Son tarama: {new Date(scoredAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
        </div>
        <div className="ie-glass rounded-[16px] px-[17px] py-[15px]">
          <div className="mb-2 text-[14px] font-extrabold text-ink">Sinyal tür dağılımı</div>
          <div className="flex flex-col gap-1.5">
            {(Object.entries(FEED_META) as Array<[FeedType, typeof FEED_META[FeedType]]>).map(([k, m]) => (
              <div key={k} className="flex items-center justify-between text-[12px]">
                <span className="font-semibold" style={{ color: m.color }}>{m.label}</span>
                <span className="font-mono font-bold text-ink">{typeCounts[k]}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] font-medium leading-[1.5] text-t4">Kararlar kural-tabanlı; yatırım tavsiyesi değildir.</p>
      </div>
    </div>
  );
}

// ── Hub kabuğu ──────────────────────────────────────────────────────────────
type HubTab = 'ozet' | 'takip' | 'alarmlar' | 'sinyal';
const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'takip', label: 'Takip Listem' },
  { key: 'alarmlar', label: 'Alarmlar' },
  { key: 'sinyal', label: 'Sinyal Takip' },
];

export function PortfolyoHubScreen() {
  const [tab, setTab] = useState<HubTab>('ozet');

  return (
    <div className="min-h-full">
      <div className="flex gap-1 overflow-x-auto border-b border-hairline bg-page px-6 lg:px-7">
        {HUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-4 py-3 text-[14px] font-bold transition-colors ${tab === t.key ? 'border-up text-ink' : 'border-transparent text-t3 hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'ozet' ? (
        <PortfoyumScreen />
      ) : (
        <div className="ie-ambient relative min-h-full overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-[50px] -top-[50px] h-[250px] w-[280px] blur-[24px]" style={{ background: 'radial-gradient(circle,rgba(107,111,245,0.18),rgba(107,111,245,0) 68%)' }} />
            <div className="absolute -right-[60px] -top-[30px] h-[230px] w-[280px] blur-[26px]" style={{ background: 'radial-gradient(circle,rgba(22,163,91,0.18),rgba(22,163,91,0) 66%)' }} />
          </div>
          <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
            {tab === 'takip' && <TakipListemTab />}
            {tab === 'alarmlar' && <AlarmlarTab />}
            {tab === 'sinyal' && <SinyalTakipTab />}
          </div>
        </div>
      )}
    </div>
  );
}
