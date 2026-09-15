'use client';

/**
 * "Bugün v3" ekranı (design_handoff_bugun_v3) — açık liquid-glass.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  v2 → v3 ÖZÜ: "Bugün ne yapmalıyım?" KALDIRILDI → "Bugün öne çıkanlar —
 *  hüküm değil, gözlem". Verdict listesi, verdict ölçeği kartı, fırsat skorları
 *  ve AI kartındaki Makro rüzgar / Rejim / Risk üçlüsü handoff gereği yok.
 *  Her satır yalnız NE OLDUĞUNU söyler. Buraya al/sat/değerlendir dili girmez.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mobil blok sırası (handoff): başlık → borsa durumu → arama → BIST 100 grafiği
 * (BIST 30 ile) → döviz/altın → portföy → günün özeti → bugün öne çıkanlar →
 * ivme kazananlar → en çok işlem görenler → sektör performansı → takip listem →
 * gündem → yaklaşan bilançolar.
 * Masaüstü: başlık → ortalanmış cam arama → bilgi şeridi → sol sütun (özet +
 * gözlemler + hareket tabloları) + sağ ray (endeks, portföy, takip, döviz,
 * gündem, bilançolar).
 *
 * ⚠️ HANDOFF'TAN BİLİNÇLİ SAPMALAR (her biri gerçek veri yokluğundan):
 *  1. **Yabancı takas bloğu YOK.** Ücretsiz, makine-okunur takas verisi yok
 *     (2026-09-12 ölçüldü). Mock sayıyla doldurmak = uydurma veri.
 *  2. **Özet kartı "✦ AI" demiyor.** Metin bir dil modelinden değil, ölçülen
 *     olgulardan kural-tabanlı kuruluyor; "AI" etiketi yanıltırdı.
 *  3. **"Haftanın öne çıkanları" → "Gündemden".** Elimizdeki kaynak küratörlü
 *     haftalık seçki değil, son haber akışı; başlık bunu olduğundan fazla
 *     göstermesin.
 *  4. **Hacim katı 20 değil 5 günlük ortalamaya göre** (scan_cache `rel_vol5`).
 *     Handoff örneği "20 günlük ortalamanın 2,8 katı" diyor; ölçmediğimiz
 *     pencereyi yazmıyoruz.
 *  5. **Masaüstü "Günün fırsatları" rafı YOK** — Fırsatlar bakımda
 *     (lib/maintenance.ts). Yerine ivme kazananlar + en çok işlem görenler.
 *
 * Veri: /api/bugun (kamuya açık bloklar, tek istek) · /api/portfolyo + /api/ohlcv
 * · /api/watchlist + /api/smart-signal (fiyat + renk noktası) · /api/haber
 * · /api/weekly-picks · /api/ai-portfolio · /api/apex-portfolio · /api/profile.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SmartSignalResult } from '@/lib/smart-signal/types';
import type { Gozlem, SatirHacim, SatirIslem, SektorGunluk, YaklasanBilanco } from '@/lib/bugun-ozet';
import { borsaDurumu } from '@/lib/bugun-ozet';
import type { HaberItem } from '@/app/api/haber/route';
import { SymbolSearch } from '@/components/new/SymbolSearch';
import YasalFeragat from '@/components/new/YasalFeragat';

interface BugunResp {
  asOf: string | null;
  index: {
    bist100: { val: number | null; chg: number | null; date: string | null; series: number[] } | null;
    bist30: { val: number | null; chg: number | null; date: string | null } | null;
  };
  fx: Array<{ label: string; val: number; chg: number | null; digits: number; derived?: boolean }>;
  highlights: Gozlem[];
  movers: SatirHacim[];
  traded: SatirIslem[];
  sectors: SektorGunluk[];
  breadth: { up: number; down: number; flat: number; total: number };
  summary: string | null;
  earnings: YaklasanBilanco[];
  /** Taramanın ait olduğu işlem günü (YYYY-MM-DD, İstanbul) */
  taramaGunu: string | null;
}

interface Portfoy {
  value: number;
  dayTL: number | null;
  dayPct: number | null;
  best: { sym: string; pct: number } | null;
  worst: { sym: string; pct: number } | null;
}

// ── Biçim ───────────────────────────────────────────────────────────────────
const fmt = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${fmt(v)}%`);
const renk = (v: number | null | undefined) => (v == null ? 'text-t3' : v >= 0 ? 'text-up' : 'text-down');
const fmtTL = (v: number) =>
  v >= 1e9 ? `${fmt(v / 1e9, 1)} mlr ₺` : v >= 1e6 ? `${fmt(v / 1e6, 0)} mn ₺` : `${fmt(v, 0)} ₺`;
const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const GUN_ADI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const AY_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function selam(h: number): string {
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/** Verdict → yalnız RENK noktası (handoff: "metin hüküm yok"). */
function noktaRengi(r: SmartSignalResult | null | undefined): string {
  if (!r) return '#d4d7dc';
  if (r.status === 'STRONG') return '#16a35b';
  if (r.status === 'POSITIVE') return '#4aa84a';
  if (r.status === 'NEGATIVE') return '#9aa0ad';
  return '#c98a00';
}

// ── Küçük yapı taşları ──────────────────────────────────────────────────────
function Kart({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`ie-glass rounded-[20px] ${className}`}>{children}</div>;
}

function Baslik({ children, sag }: { children: React.ReactNode; sag?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-0.5 pb-[9px]">
      <span className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">{children}</span>
      {sag}
    </div>
  );
}

function Baglanti({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[11px] font-semibold text-up transition-colors hover:text-ink">
      {children}
    </Link>
  );
}

function Iskelet({ h = 120 }: { h?: number }) {
  return <div className="ie-glass animate-pulse rounded-[20px]" style={{ height: h }} />;
}

function EndeksGrafik({ series, up }: { series: number[]; up: boolean }) {
  if (series.length < 2) return null;
  const W = 290, H = 58;
  const min = Math.min(...series), max = Math.max(...series), rng = max - min || 1;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * W, H - 3 - ((v - min) / rng) * (H - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const c = up ? '#16a35b' : '#e5484d';
  const id = `bugun-endeks-${up ? 'u' : 'd'}`;
  return (
    <svg width="100%" height="62" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2.5" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.18" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BugunScreen() {
  const [ozet, setOzet] = useState<BugunResp | null>(null);
  const [ozetHata, setOzetHata] = useState(false);
  const [portfoy, setPortfoy] = useState<Portfoy | null>(null);
  const [sinyaller, setSinyaller] = useState<SmartSignalResult[]>([]);
  const [takip, setTakip] = useState<string[]>([]);
  const [takipGenis, setTakipGenis] = useState(false);
  const [haberler, setHaberler] = useState<HaberItem[]>([]);
  const [haftalik, setHaftalik] = useState<{ avg: number | null; beatRate: number | null } | null>(null);
  const [aiRet, setAiRet] = useState<{ aegis: number | null; apex: number | null }>({ aegis: null, apex: null });
  const [ad, setAd] = useState<string | null>(null);
  // Saat/tarih yalnız istemcide — sunucu saatiyle hydration uyuşmazlığı olmasın.
  const [simdi, setSimdi] = useState<Date | null>(null);

  useEffect(() => {
    setSimdi(new Date());
    const t = setInterval(() => setSimdi(new Date()), 60_000);

    fetch('/api/bugun')
      .then((r) => (r.ok ? (r.json() as Promise<BugunResp>) : Promise.reject()))
      .then(setOzet)
      .catch(() => setOzetHata(true));

    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { display_name?: string | null } | null) => {
        const ilk = p?.display_name?.trim().split(/\s+/)[0];
        if (ilk && !ilk.includes('@')) setAd(ilk);
      })
      .catch(() => {});

    // Portföy — oturum/pozisyon yoksa blok gizli kalır.
    fetch('/api/portfolyo')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (positions: Array<{ sembol: string; miktar: number }> | null) => {
        if (!Array.isArray(positions) || positions.length === 0) return;
        const lots = new Map<string, number>();
        for (const p of positions) lots.set(p.sembol, (lots.get(p.sembol) ?? 0) + p.miktar);
        let value = 0, prevValue = 0;
        const gunluk: Array<{ sym: string; pct: number }> = [];
        await Promise.all(
          [...lots.entries()].map(async ([sym, lot]) => {
            try {
              const j = await fetch(`/api/ohlcv?symbol=${sym}&days=5`).then((r) => r.json());
              const c: Array<{ close: number }> = j?.candles ?? [];
              const last = c[c.length - 1]?.close, prev = c[c.length - 2]?.close;
              if (typeof last === 'number') value += lot * last;
              if (typeof prev === 'number') prevValue += lot * prev;
              if (typeof last === 'number' && typeof prev === 'number' && prev > 0) {
                gunluk.push({ sym, pct: ((last - prev) / prev) * 100 });
              }
            } catch { /* fiyat yoksa atla */ }
          }),
        );
        if (value <= 0) return;
        const sirali = [...gunluk].sort((a, b) => b.pct - a.pct);
        setPortfoy({
          value,
          dayTL: prevValue > 0 ? value - prevValue : null,
          dayPct: prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : null,
          // Tek pozisyonda "en çok katkı" ile "en çok kayıp" aynı hisse olur — gösterme.
          best: sirali.length >= 2 && sirali[0]!.pct > 0 ? sirali[0]! : null,
          worst: sirali.length >= 2 && sirali.at(-1)!.pct < 0 ? sirali.at(-1)! : null,
        });
      })
      .catch(() => {});

    // Takip listesi fiyatları smart-signal'dan (evrenin tamamı tek istekte).
    fetch('/api/watchlist')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Array<{ sembol: string }> | null) => {
        const syms = (d ?? []).map((x) => x.sembol);
        setTakip(syms);
        if (syms.length === 0) return;
        fetch('/api/smart-signal')
          .then((r) => r.json() as Promise<{ results?: SmartSignalResult[] }>)
          .then((j) => setSinyaller(j.results ?? []))
          .catch(() => {});
      })
      .catch(() => {});

    fetch('/api/haber')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { haberler?: HaberItem[] } | null) => {
        const hafta = Date.now() - 7 * 86_400_000;
        setHaberler((d?.haberler ?? []).filter((h) => Date.parse(h.tarih) >= hafta).slice(0, 4));
      })
      .catch(() => {});

    fetch('/api/weekly-picks')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stats?: { avgReturn?: number; outperformedRate?: number } } | null) => {
        const rate = d?.stats?.outperformedRate;
        setHaftalik({
          avg: d?.stats?.avgReturn ?? null,
          beatRate: rate != null ? Math.round(rate <= 1 ? rate * 100 : rate) : null,
        });
      })
      .catch(() => {});
    fetch('/api/ai-portfolio')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { summary?: { totalReturn?: number } } | null) =>
        setAiRet((p) => ({ ...p, aegis: d?.summary?.totalReturn ?? null })))
      .catch(() => {});
    fetch('/api/apex-portfolio')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { summary?: { totalReturn?: number } } | null) =>
        setAiRet((p) => ({ ...p, apex: d?.summary?.totalReturn ?? null })))
      .catch(() => {});

    return () => clearInterval(t);
  }, []);

  const durum = simdi ? borsaDurumu(simdi) : null;
  // "Çarşamba, 16 Eylül" — `toLocaleDateString` bazı ortamlarda "16 Eylül Çarşamba" diye
  // ters sırada döndü (canlıda görüldü); ad/ay tabloyla elle kuruluyor.
  const tarihBas = simdi ? `${GUN_ADI[simdi.getDay()]}, ${simdi.getDate()} ${AY_ADI[simdi.getMonth()]}` : '';
  const bugunTR = simdi?.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }) ?? null;

  const sinyalMap = useMemo(() => new Map(sinyaller.map((s) => [s.symbol, s])), [sinyaller]);
  const takipSatir = useMemo(
    () => takip.map((sym) => ({ sym, r: sinyalMap.get(sym) ?? null })),
    [takip, sinyalMap],
  );
  const takipGoster = takipGenis ? takipSatir : takipSatir.slice(0, 5);

  const b100 = ozet?.index.bist100 ?? null;
  const b30 = ozet?.index.bist30 ?? null;
  const sektorGuclu = ozet?.sectors[0] ?? null;
  const sektorZayif = ozet && ozet.sectors.length > 1 ? ozet.sectors[ozet.sectors.length - 1]! : null;
  const sektorMax = Math.max(0.1, ...(ozet?.sectors ?? []).map((s) => Math.abs(s.chg)));

  const guncellik = ozet?.asOf
    ? new Date(ozet.asOf).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    : null;
  // ⚠️ Seans açılmadan / tatilde "Bugün" başlıkları ÖNCEKİ günün taramasını gösterir.
  // Bunu başlıkta açıkça söyle — canlıda sabah 07:00'de 15 Eylül verisi "bugün" diye
  // okunuyordu.
  const eskiVeri = ozet?.taramaGunu != null && bugunTR != null && ozet.taramaGunu !== bugunTR;

  // ── Bloklar ─────────────────────────────────────────────────────────────────
  const aramaMobil = (
    <SymbolSearch glass className="w-full" placeholder="Hisse ara — THY, SEL…" />
  );

  const endeksKart = !ozet ? <Iskelet h={132} /> : b100?.val == null ? null : (
    <Kart className="px-4 py-[15px]">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-semibold text-t3">BIST 100</div>
          <div className="mt-0.5 font-mono text-[24px] font-bold text-ink">{fmt(b100.val)}</div>
        </div>
        <div className="text-right">
          <div className={`font-mono text-[14px] font-bold ${renk(b100.chg)}`}>{fmtPct(b100.chg)}</div>
          {b30?.val != null && (
            <div className="mt-0.5 font-mono text-[11px] font-medium text-t3">BIST 30 · {fmtPct(b30.chg)}</div>
          )}
        </div>
      </div>
      <EndeksGrafik series={b100.series} up={(b100.chg ?? 0) >= 0} />
      <div className="mt-1 text-[10px] font-medium text-t4">
        Son 1 ay · günlük kapanış{b100.date ? ` · fiyat ${new Date(`${b100.date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}` : ''}
      </div>
    </Kart>
  );

  const dovizKartlari = (sutun: boolean) =>
    !ozet ? <Iskelet h={120} /> : ozet.fx.length === 0 ? null : (
      <div className={sutun ? 'grid grid-cols-2 gap-x-4 gap-y-3' : 'grid grid-cols-2 gap-2'}>
        {ozet.fx.map((k) => {
          const ic = (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-t3">
                {k.label}
                {k.derived && <span title="Ons fiyatı × Dolar/TL ÷ 31,1035 ile hesaplandı" className="ml-1 normal-case text-t4">≈</span>}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="font-mono text-[15px] font-bold text-ink">{fmt(k.val, k.digits)}</span>
                <span className={`font-mono text-[11px] font-semibold ${renk(k.chg)}`}>{fmtPct(k.chg)}</span>
              </div>
            </>
          );
          return sutun ? <div key={k.label}>{ic}</div> : <Kart key={k.label} className="px-[13px] py-[11px]">{ic}</Kart>;
        })}
      </div>
    );

  const portfoyKart = portfoy && (
    <Kart className="px-4 py-[15px]">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">Portföyüm</span>
        <Baglanti href="/portfolyo">Detay →</Baglanti>
      </div>
      <div className="mt-[9px] flex items-end justify-between">
        <div className="font-mono text-[21px] font-bold text-ink">{fmt(portfoy.value, 0)} ₺</div>
        <div className="text-right">
          <div className={`font-mono text-[14px] font-bold ${renk(portfoy.dayPct)}`}>{fmtPct(portfoy.dayPct)}</div>
          {portfoy.dayTL != null && (
            <div className="mt-px font-mono text-[11px] font-medium text-t3">
              {portfoy.dayTL >= 0 ? '+' : ''}{fmt(portfoy.dayTL, 0)} ₺ bugün
            </div>
          )}
        </div>
      </div>
      {(portfoy.best || portfoy.worst) && (
        <div className="mt-3 flex gap-4 border-t border-hairline pt-[11px]">
          {portfoy.best && (
            <div>
              <div className="text-[10px] font-medium text-t3">En çok katkı</div>
              <div className="mt-0.5 text-[12px] font-bold text-ink">
                {portfoy.best.sym} <span className="font-mono text-up">{fmtPct(portfoy.best.pct)}</span>
              </div>
            </div>
          )}
          {portfoy.worst && (
            <div>
              <div className="text-[10px] font-medium text-t3">En çok kayıp</div>
              <div className="mt-0.5 text-[12px] font-bold text-ink">
                {portfoy.worst.sym} <span className="font-mono text-down">{fmtPct(portfoy.worst.pct)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Kart>
  );

  const ozetKart = !ozet ? <Iskelet h={96} /> : ozet.summary && (
    <div className="ie-glass-dark rounded-[20px] px-4 py-[15px] lg:px-5 lg:py-[18px]">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold tracking-[0.06em] text-ai-on-dark">◆</span>
        <span className="text-[11px] font-semibold text-[#9aa0ad]">Günün özeti</span>
      </div>
      <p className="mt-2 text-[14px] font-semibold leading-[1.55] text-[#f4f5f6] lg:text-[15px]">{ozet.summary}</p>
      <p className="mt-2 text-[10px] font-medium text-[#7b818c]">
        Ölçülen verilerden otomatik oluşturulur{guncellik ? ` · ${guncellik}` : ''}
      </p>
    </div>
  );

  const oneCikanlar = (
    <div>
      <Baslik sag={<span className="text-[10px] font-medium text-t3">Hüküm değil, gözlem</span>}>Bugün öne çıkanlar</Baslik>
      {!ozet ? <Iskelet h={300} /> : ozet.highlights.length === 0 ? (
        <Kart className="px-4 py-6 text-center text-[12px] font-medium text-t2">
          Bugün olağan dışı bir hareket görünmüyor.
        </Kart>
      ) : (
        <div className="flex flex-col gap-2">
          {ozet.highlights.map((h) => (
            <Link key={h.sym} href={`/hisse/${h.sym}`} className="ie-glass flex items-center gap-3 rounded-[20px] px-3.5 py-3 transition-colors">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-fill font-mono text-[11px] font-semibold text-ink">
                {h.sym.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-[7px]">
                  <span className="text-[13px] font-bold text-ink">{h.sym}</span>
                  <span className="rounded-[6px] bg-fill px-[7px] py-0.5 text-[9px] font-bold uppercase tracking-[0.03em] text-t2">{h.what}</span>
                </span>
                <span className="mt-[3px] block text-[11px] font-medium leading-[1.4] text-t2">{h.note}</span>
              </span>
              <span className={`shrink-0 font-mono text-[13px] font-bold ${renk(h.chg)}`}>{fmtPct(h.chg)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  const satirListesi = <T extends { sym: string; chg: number }>(
    rows: T[], orta: (r: T) => string, ortaMono = false,
  ) => (
    <Kart className="px-3.5 py-1">
      {rows.map((r) => (
        <Link key={r.sym} href={`/hisse/${r.sym}`} className="flex items-center gap-2.5 border-b border-hairline py-[11px] last:border-0">
          <span className="w-[62px] shrink-0 text-[13px] font-bold text-ink">{r.sym}</span>
          <span className={`flex-1 text-[11px] text-t3 ${ortaMono ? 'font-mono font-semibold' : 'font-medium'}`}>{orta(r)}</span>
          <span className={`font-mono text-[13px] font-bold ${renk(r.chg)}`}>{fmtPct(r.chg)}</span>
        </Link>
      ))}
    </Kart>
  );

  const ivme = (
    <div>
      <Baslik sag={<Baglanti href="/makro">Sektörler →</Baglanti>}>Bugün ivme kazananlar</Baslik>
      {!ozet ? <Iskelet h={230} /> : ozet.movers.length === 0 ? (
        <Kart className="px-4 py-5 text-[12px] font-medium text-t2">Bugün yükselen likit hisse yok.</Kart>
      ) : satirListesi(ozet.movers, (m) => (m.relVol5 != null ? `${fmt(m.relVol5, 1)}x hacim` : '—'))}
    </div>
  );

  const islemGorenler = (
    <div>
      <Baslik>En çok işlem görenler</Baslik>
      {!ozet ? <Iskelet h={230} /> : satirListesi(ozet.traded, (t) => fmtTL(t.tlHacim), true)}
    </div>
  );

  const sektorler = (
    <div>
      <Baslik sag={<Baglanti href="/makro">Sektör analizi →</Baglanti>}>Sektör performansı</Baslik>
      {!ozet ? <Iskelet h={240} /> : ozet.sectors.length === 0 ? null : (
        <Kart className="flex flex-col gap-[11px] px-4 py-3.5">
          {ozet.sectors.map((s) => (
            <div key={s.id}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-ink">{s.name}</span>
                <span className={`font-mono text-[12px] font-bold ${renk(s.chg)}`}>{fmtPct(s.chg)}</span>
              </div>
              <div className="mt-[5px] h-[5px] overflow-hidden rounded-[3px] bg-fill">
                <div
                  className={`h-full rounded-[3px] ${s.chg >= 0 ? 'bg-up/50' : 'bg-down/45'}`}
                  style={{ width: `${Math.round((Math.abs(s.chg) / sektorMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="text-[10px] font-medium text-t4">Günlük · sektördeki likit hisselerin ortanca değişimi</p>
        </Kart>
      )}
    </div>
  );

  const takipKart = takip.length > 0 && (
    <div>
      <Baslik sag={<span className="text-[11px] font-semibold text-t3">{takip.length} hisse</span>}>Takip listem</Baslik>
      <Kart className="px-3.5 py-1">
        {takipGoster.map(({ sym, r }) => (
          <Link key={sym} href={`/hisse/${sym}`} className="flex items-center gap-2.5 border-b border-hairline py-[11px] last:border-0">
            <span
              className="h-2 w-2 shrink-0 rounded-[3px]"
              style={{ background: noktaRengi(r) }}
              title="Renk: akıllı para sinyal durumu"
            />
            <span className="flex-1 text-[13px] font-bold text-ink">{sym}</span>
            <span className="font-mono text-[12px] font-semibold text-ink">{fmt(r?.price ?? null)}</span>
            <span className={`w-[58px] text-right font-mono text-[12px] font-bold ${renk(r?.changePercent)}`}>
              {fmtPct(r?.changePercent)}
            </span>
          </Link>
        ))}
        {takipSatir.length > 5 && (
          <button
            onClick={() => setTakipGenis((v) => !v)}
            className="w-full py-[11px] text-left text-[12px] font-bold text-up"
          >
            {takipGenis ? 'Daha az göster' : `Tümünü göster (${takipSatir.length})`}
          </button>
        )}
      </Kart>
    </div>
  );

  const gundem = haberler.length > 0 && (
    <div>
      <Baslik sag={<Baglanti href="/makro?tab=gundem">Haberler →</Baglanti>}>Gündemden</Baslik>
      <div className="flex flex-col gap-2">
        {haberler.map((n) => (
          <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer" className="ie-glass flex gap-[11px] rounded-[20px] px-3.5 py-3">
            <span className="w-[34px] shrink-0 pt-0.5 text-[11px] font-bold text-t3">{GUNLER[new Date(n.tarih).getDay()]}</span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-3 block text-[13px] font-semibold leading-[1.45] text-ink">{n.baslik}</span>
              <span className="mt-[5px] block text-[10px] font-semibold uppercase tracking-[0.04em] text-t3">{n.kaynak}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );

  const bilancolar = ozet && ozet.earnings.length > 0 && (
    <div>
      <Baslik sag={<span className="text-[10px] font-medium text-t3">Tarihler tahmini</span>}>Yaklaşan bilançolar</Baslik>
      <div className="grid grid-cols-3 gap-2">
        {ozet.earnings.slice(0, 3).map((e) => (
          <Link key={e.sym} href={`/hisse/${e.sym}`} className="ie-glass rounded-[20px] px-[13px] py-3">
            <div className="text-[13px] font-bold text-ink">{e.sym}</div>
            <div className="mt-1 font-mono text-[12px] font-bold text-ai">{e.date}</div>
            <div className="mt-0.5 text-[10px] font-medium text-t3">{e.note}</div>
          </Link>
        ))}
      </div>
    </div>
  );

  const altBilgi = (
    <p className="px-4 pt-1 text-center text-[10px] font-medium leading-[1.5] text-t4">
      Veriler bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.
    </p>
  );

  // ── Masaüstü bilgi şeridi ───────────────────────────────────────────────────
  const bilgiSeridi = (
    <div className="ie-glass-flat flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[16px] px-5 py-3 text-[12px]">
      {sektorGuclu && (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-t3">Sektör</span>
          <span className="font-bold text-up">▲ {sektorGuclu.name}</span>
          <span className={`font-mono font-semibold ${renk(sektorGuclu.chg)}`}>{fmtPct(sektorGuclu.chg)}</span>
          {sektorZayif && sektorZayif.chg < 0 && (
            <>
              <span className="font-bold text-down">▼ {sektorZayif.name}</span>
              <span className="font-mono font-semibold text-down">{fmtPct(sektorZayif.chg)}</span>
            </>
          )}
        </div>
      )}
      {ozet && ozet.breadth.total > 0 && (
        <div className="flex items-center gap-2 border-l border-hairline pl-5">
          <span className="font-semibold text-t3">Genişlik</span>
          <span className="font-mono font-semibold text-up">{ozet.breadth.up} ↑</span>
          <span className="font-mono font-semibold text-down">{ozet.breadth.down} ↓</span>
        </div>
      )}
      {haftalik?.avg != null && (
        <div className="flex items-center gap-2 border-l border-hairline pl-5">
          <span className="font-semibold text-t3">Haftanın seçimleri</span>
          <span className={`font-mono font-semibold ${renk(haftalik.avg)}`}>{fmtPct(haftalik.avg)}</span>
          {haftalik.beatRate != null && <span className="font-medium text-t3">%{haftalik.beatRate} BIST'i geçti</span>}
        </div>
      )}
      {(aiRet.aegis != null || aiRet.apex != null) && (
        <div className="flex items-center gap-2 border-l border-hairline pl-5">
          <span className="font-mono text-[11px] font-bold text-ai">✦</span>
          <span className="font-semibold text-t3">AI Portföyleri</span>
          {aiRet.aegis != null && <><span className="font-medium text-t2">Aegis</span><span className={`font-mono font-semibold ${renk(aiRet.aegis)}`}>{fmtPct(aiRet.aegis)}</span></>}
          {aiRet.apex != null && <><span className="font-medium text-t2">APEX</span><span className={`font-mono font-semibold ${renk(aiRet.apex)}`}>{fmtPct(aiRet.apex)}</span></>}
        </div>
      )}
      <Link href="/ai-portfoyler" className="ml-auto text-[12px] font-semibold text-t3 transition-colors hover:text-ink">Detay →</Link>
    </div>
  );

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      {/* ════════════ MOBİL ════════════ */}
      <div className="flex flex-col gap-3.5 px-3.5 pb-6 pt-4 lg:hidden">
        <div className="flex items-start justify-between px-1">
          <div>
            <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-ink">
              {simdi ? selam(simdi.getHours()) : ' '}{ad ? `, ${ad}` : ''}
            </h1>
            <div className="mt-[3px] text-[12px] font-medium text-t3">{tarihBas}</div>
            {eskiVeri && guncellik && (
              <div className="mt-1 text-[11px] font-semibold text-warn">Veriler son işlem gününe ait · {guncellik}</div>
            )}
          </div>
          <Link href="/profil" aria-label="Profil" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-bold text-onink">
            {ad ? ad.charAt(0).toLocaleUpperCase('tr-TR') : '◐'}
          </Link>
        </div>

        {durum && (
          <div className="flex items-center gap-2 px-0.5">
            <div className={`flex items-center gap-1.5 rounded-[9px] px-[11px] py-1.5 ${durum.acik ? 'bg-up-badge' : 'bg-fill'}`}>
              <span className={`h-[7px] w-[7px] rounded-full ${durum.acik ? 'bg-up' : 'bg-t4'}`} />
              <span className={`text-[11px] font-bold ${durum.acik ? 'text-up' : 'text-t2'}`}>{durum.etiket}</span>
            </div>
            {durum.detay && <span className="text-[11px] font-medium text-t3">{durum.detay}</span>}
          </div>
        )}

        {aramaMobil}
        {ozetHata && (
          <Kart className="px-4 py-3 text-[12px] font-medium text-t2">Piyasa verileri şu an alınamadı. Birazdan tekrar dene.</Kart>
        )}
        {endeksKart}
        {dovizKartlari(false)}
        {portfoyKart}
        {ozetKart}
        {oneCikanlar}
        {ivme}
        {islemGorenler}
        {sektorler}
        {takipKart}
        {gundem}
        {bilancolar}
        {altBilgi}
      </div>

      {/* ════════════ MASAÜSTÜ ════════════ */}
      <div className="mx-auto hidden max-w-[1180px] flex-col gap-5 px-7 py-6 lg:flex">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-ink">
              {simdi ? selam(simdi.getHours()) : ' '}{ad ? `, ${ad}` : ''}
            </h1>
            <div className="mt-1 text-[13px] font-medium text-t3">
              {tarihBas}
              {guncellik && (
                <span className={eskiVeri ? 'font-semibold text-warn' : ''}>
                  {eskiVeri ? ` · veriler son işlem gününe ait (${guncellik})` : ` · veriler ${guncellik}`}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {durum && (
              <div className={`flex items-center gap-[7px] whitespace-nowrap rounded-[10px] px-3 py-[7px] ${durum.acik ? 'bg-up-badge' : 'bg-fill'}`}>
                <span className={`h-[7px] w-[7px] rounded-full ${durum.acik ? 'bg-up' : 'bg-t4'}`} />
                <span className={`text-[11px] font-bold ${durum.acik ? 'text-up' : 'text-t2'}`}>{durum.etiket}</span>
                {durum.detay && <span className="text-[11px] font-medium text-t3">· {durum.detay}</span>}
              </div>
            )}
            {b100?.val != null && (
              <div className="ie-glass-flat flex items-center gap-2 whitespace-nowrap rounded-[10px] px-3 py-[7px]">
                <span className="text-[11px] font-semibold text-t3">BIST 100</span>
                <span className="font-mono text-[12px] font-bold text-ink">{fmt(b100.val, 0)}</span>
                <span className={`font-mono text-[12px] font-bold ${renk(b100.chg)}`}>{fmtPct(b100.chg)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[560px]">
          <SymbolSearch glass className="w-full" placeholder="Hisse ara — THY, GARAN, SEL…" />
        </div>

        {bilgiSeridi}
        {ozetHata && (
          <Kart className="px-5 py-3 text-[12px] font-medium text-t2">Piyasa verileri şu an alınamadı. Birazdan tekrar dene.</Kart>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-5">
          <div className="flex min-w-0 flex-col gap-5">
            {ozetKart}
            {oneCikanlar}
            <div className="grid grid-cols-2 gap-4">
              {ivme}
              {islemGorenler}
            </div>
            {sektorler}
            <YasalFeragat />
          </div>

          <div className="flex flex-col gap-4">
            {endeksKart}
            {portfoyKart}
            {takipKart}
            {ozet && ozet.fx.length > 0 && (
              <Kart className="px-4 py-3.5">
                <div className="mb-3 text-[13px] font-extrabold text-ink">Döviz ve altın</div>
                {dovizKartlari(true)}
              </Kart>
            )}
            {gundem}
            {bilancolar}
            {altBilgi}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BugunScreen;
