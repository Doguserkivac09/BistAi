'use client';

/**
 * Fon karşılaştırma ekranı (FON-ANALIZ-PLAN F6-3).
 *
 * ⚠️ EN ÖNEMLİ TASARIM KARARI — FARKLI KATEGORİ UYARISI:
 * Bir para piyasası fonuyla bir hisse fonunu yan yana koyup "hangisi daha iyi"
 * demek anlamsızdır; ikisi farklı iş yapar. Ekran kategori farkını sessizce
 * geçmez, açıkça söyler. Kıyas engellenmez (kullanıcı isteyebilir) ama
 * çerçevelenir.
 *
 * ÜRÜN DİLİ: fon dünyası hisse dünyasından AYRI — AL/SAT, stop, R/R YOK.
 * "Kazanan" ilan edilmez; ölçüler yan yana konur, karar kullanıcınındır.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import YasalFeragat from '@/components/new/YasalFeragat';
import { MAX_KARSILASTIRMA, type FundEntry } from '@/lib/fund-runner';

type Universe = 'TEFAS' | 'BES';
type Fund = FundEntry;

const MAX_FON = MAX_KARSILASTIRMA;

/** Seri renkleri — tasarım token'ları (tema ile birlikte döner). */
const RENKLER = ['text-ink', 'text-ai', 'text-up', 'text-warn'] as const;
const NOKTA = ['bg-ink', 'bg-ai', 'bg-up', 'bg-warn'] as const;

interface Resp {
  available: boolean;
  universe?: Universe;
  policyRate?: number | null;
  inflation?: number | null;
  funds?: Fund[];
  series?: Record<string, Array<{ d: string; p: number }>>;
  bulunamayan?: string[];
  message?: string;
}

const pct = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
const num = (v: number | null | undefined, d = 2) => (v == null ? '—' : v.toFixed(d));
const renk = (v: number | null | undefined) =>
  v == null ? 'text-t3' : v >= 0 ? 'text-up' : 'text-down';
const tl = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1e9 ? `${(v / 1e9).toFixed(1)} mlr ₺` : `${Math.round(v / 1e6)} mn ₺`;

/**
 * 100'e ENDEKSLİ getiri grafiği.
 *
 * ⚠️ Fiyatlar doğrudan çizilemez: bir fonun birim payı 3 ₺, diğerininki 140 ₺
 * olabilir ve grafik tamamen okunmaz hâle gelir. Her seri kendi başlangıcına
 * göre 100'e normalize edilir → "aynı parayı aynı gün koysaydım" karşılaştırması.
 *
 * ⚠️ ORTAK PENCERE: seriler farklı tarihlerde başlıyorsa EN GEÇ başlayanın
 * başlangıcı esas alınır. Aksi halde yeni fon, eski fonun tüm geçmişine karşı
 * haksız biçimde kısa bir dilimle kıyaslanırdı.
 */
function EndeksGrafik({
  funds, series,
}: {
  funds: Fund[];
  series: Record<string, Array<{ d: string; p: number }>>;
}) {
  const W = 780, H = 260, PAD_X = 8, PAD_Y = 16;

  const cizim = useMemo(() => {
    const dolu = funds.filter((f) => (series[f.code]?.length ?? 0) >= 2);
    if (dolu.length === 0) return null;

    // Ortak başlangıç: en geç başlayan serinin ilk günü.
    const baslangic = dolu
      .map((f) => series[f.code]![0]!.d)
      .sort()
      .at(-1)!;

    const kesitler = dolu.map((f) => ({
      code: f.code,
      pts: series[f.code]!.filter((p) => p.d >= baslangic),
    })).filter((x) => x.pts.length >= 2);
    if (kesitler.length === 0) return null;

    const endeksli = kesitler.map((k) => {
      const ilk = k.pts[0]!.p;
      return { code: k.code, vals: k.pts.map((p) => ({ d: p.d, v: (p.p / ilk) * 100 })) };
    });

    const hepsi = endeksli.flatMap((e) => e.vals.map((x) => x.v));
    const min = Math.min(...hepsi), max = Math.max(...hepsi);
    const aralik = max - min || 1;
    const enUzun = Math.max(...endeksli.map((e) => e.vals.length));

    const yollar = endeksli.map((e) => ({
      code: e.code,
      d: e.vals.map((x, i) => {
        const px = PAD_X + (i / (enUzun - 1)) * (W - PAD_X * 2);
        const py = H - PAD_Y - ((x.v - min) / aralik) * (H - PAD_Y * 2);
        return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
      }).join(' '),
      son: e.vals.at(-1)!.v,
    }));

    return { yollar, baslangic, bitis: endeksli[0]!.vals.at(-1)!.d, min, max };
  }, [funds, series]);

  if (!cizim) {
    return (
      <div className="rounded-[14px] border border-hairline px-4 py-8 text-center text-[12px] font-medium text-t3">
        Grafik için yeterli ortak geçmiş yok.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold">
        {cizim.yollar.map((y, i) => (
          <span key={y.code} className={`flex items-center gap-1.5 ${RENKLER[i % 4]}`}>
            <span className={`inline-block h-[2px] w-4 rounded ${NOKTA[i % 4]}`} />
            {y.code} <span className="font-mono opacity-70">{y.son.toFixed(0)}</span>
          </span>
        ))}
        <span className="ml-auto font-medium text-t3">100'e endeksli</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full min-w-[560px]" role="img"
          aria-label="Fonların 100'e endeksli getiri karşılaştırması">
          {cizim.yollar.map((y, i) => (
            <path key={y.code} d={y.d} fill="none" strokeWidth={1.8}
              stroke="currentColor" className={RENKLER[i % 4]}
              strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>
      </div>

      <p className="mt-1.5 text-[10.5px] font-medium text-t3">
        Her fon <strong className="font-semibold">kendi başlangıcına göre 100</strong> kabul edilir —
        yani &quot;aynı gün aynı parayı koysaydım&quot; karşılaştırması. Ortak pencere{' '}
        {cizim.baslangic} → {cizim.bitis}; en geç başlayan fon esas alındı.
      </p>
    </div>
  );
}

export function FonKarsilastirScreen() {
  const [universe, setUniverse] = useState<Universe>('TEFAS');
  const [secili, setSecili] = useState<string[]>([]);
  const [arama, setArama] = useState('');
  const [tumFonlar, setTumFonlar] = useState<Record<Universe, Fund[]>>({ TEFAS: [], BES: [] });
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  // Fon seçici için tüm liste (hafif kullanım: yalnız kod/ad/kategori)
  useEffect(() => {
    if (tumFonlar[universe].length > 0) return;
    fetch(`/api/fonlar?universe=${universe}`)
      .then((r) => r.json())
      .then((d) => setTumFonlar((p) => ({ ...p, [universe]: d.funds ?? [] })))
      .catch(() => {});
  }, [universe, tumFonlar]);

  // URL'den başlangıç seçimi (paylaşılabilir link)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const u = sp.get('universe');
    if (u === 'BES' || u === 'TEFAS') setUniverse(u);
    const k = sp.get('kod');
    if (k) setSecili(k.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, MAX_FON));
  }, []);

  useEffect(() => {
    if (secili.length === 0) { setData(null); return; }
    let iptal = false;
    setLoading(true);
    fetch(`/api/fonlar/karsilastir?universe=${universe}&kod=${secili.join(',')}`)
      .then((r) => r.json())
      .then((d: Resp) => { if (!iptal) setData(d); })
      .catch(() => {})
      .finally(() => { if (!iptal) setLoading(false); });
    // Adres çubuğu paylaşılabilir kalsın
    const url = `/fonlar/karsilastir?universe=${universe}&kod=${secili.join(',')}`;
    window.history.replaceState(null, '', url);
    return () => { iptal = true; };
  }, [secili, universe]);

  const ekle = useCallback((kod: string) => {
    setSecili((s) => (s.includes(kod) || s.length >= MAX_FON ? s : [...s, kod]));
    setArama('');
  }, []);
  const cikar = useCallback((kod: string) => setSecili((s) => s.filter((x) => x !== kod)), []);

  const oneriler = useMemo(() => {
    const q = arama.trim().toLocaleUpperCase('tr');
    if (q.length < 2) return [];
    return tumFonlar[universe]
      .filter((f) => !secili.includes(f.code))
      .filter((f) => f.code.includes(q) || f.name.toLocaleUpperCase('tr').includes(q))
      .slice(0, 8);
  }, [arama, tumFonlar, universe, secili]);

  const funds = data?.funds ?? [];

  // Farklı kategoriler kıyaslanıyor mu? (ekranın en önemli dürüstlük noktası)
  const kategoriler = useMemo(
    () => [...new Set(funds.map((f) => f.categoryLabel ?? '—'))],
    [funds],
  );
  const karisikKategori = kategoriler.length > 1;

  const chip = (aktif: boolean) =>
    `rounded-[11px] px-3.5 py-2 text-[12px] font-semibold transition-colors ${aktif ? 'bg-ink text-onink' : 'ie-glass-flat text-t2 hover:text-ink'}`;

  /** Bir metrik satırı — en iyi değeri vurgular (yalnız aynı kategorideyken). */
  const Satir = ({ ad, deger, aciklama, enIyi }: {
    ad: string;
    deger: (f: Fund) => { text: string; cls?: string; raw: number | null };
    aciklama?: string;
    enIyi?: 'buyuk' | 'kucuk';
  }) => {
    const degerler = funds.map((f) => deger(f));
    let vurguIdx = -1;
    // Vurgu YALNIZ aynı kategorideyken: farklı işler yapan fonlarda
    // "en iyi" işaretlemek yanıltıcı olur.
    if (enIyi && !karisikKategori) {
      const gecerli = degerler.map((d, i) => ({ v: d.raw, i })).filter((x) => x.v != null) as Array<{ v: number; i: number }>;
      if (gecerli.length > 1) {
        vurguIdx = gecerli.reduce((a, b) =>
          (enIyi === 'buyuk' ? b.v > a.v : b.v < a.v) ? b : a).i;
      }
    }
    return (
      <tr className="border-t border-hairline">
        <td className="py-2 pr-3 align-top">
          <div className="text-[11.5px] font-semibold text-t2">{ad}</div>
          {aciklama && <div className="text-[10px] font-medium leading-[1.3] text-t4">{aciklama}</div>}
        </td>
        {degerler.map((d, i) => (
          <td key={i} className="py-2 pl-3 text-right align-top">
            <span className={`font-mono text-[13px] font-bold ${d.cls ?? 'text-ink'} ${i === vurguIdx ? 'rounded-[6px] bg-up/[0.12] px-1.5 py-0.5' : ''}`}>
              {d.text}
            </span>
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
        <Link href="/fonlar" className="text-[12px] font-semibold text-t2 transition-colors hover:text-ink">
          ← Fonlar
        </Link>

        <h1 className="mt-3 text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[22px]">
          Fon karşılaştır
        </h1>
        <p className="mt-0.5 text-[12px] font-medium text-t3">
          En fazla {MAX_FON} fonu yan yana koy. &quot;Kazanan&quot; ilan etmiyoruz — ölçüleri
          gösteriyoruz, kararı sen veriyorsun.
        </p>

        <div className="mt-4 flex gap-2">
          {(['TEFAS', 'BES'] as const).map((u) => (
            <button key={u} onClick={() => { setUniverse(u); setSecili([]); }} className={chip(universe === u)}>
              {u === 'TEFAS' ? 'TEFAS Fonları' : 'BES / Emeklilik'}
            </button>
          ))}
        </div>

        {/* Seçim */}
        <div className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {secili.map((k, i) => (
              <span key={k} className={`flex items-center gap-1.5 rounded-[10px] border border-hairline px-2.5 py-1.5 text-[12px] font-bold ${RENKLER[i % 4]}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${NOKTA[i % 4]}`} />
                {k}
                <button onClick={() => cikar(k)} aria-label={`${k} fonunu çıkar`}
                  className="ml-0.5 text-t3 transition-colors hover:text-down">×</button>
              </span>
            ))}
            {secili.length < MAX_FON && (
              <div className="relative min-w-[220px] flex-1">
                <input
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  placeholder="Fon kodu veya adı yaz…"
                  className="w-full rounded-[10px] border border-hairline bg-transparent px-3 py-2 text-[12.5px] font-medium text-ink outline-none placeholder:text-t4 focus:border-ai/40"
                />
                {oneriler.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[280px] overflow-y-auto rounded-[12px] border border-hairline bg-panel shadow-lg">
                    {oneriler.map((f) => (
                      <button key={f.code} onClick={() => ekle(f.code)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-fill">
                        <span className="font-mono text-[12px] font-extrabold text-ink">{f.code}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium text-t2">{f.name}</span>
                          <span className="text-[10px] font-medium text-t4">{f.categoryLabel}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {secili.length >= MAX_FON && (
            <p className="mt-2 text-[11px] font-medium text-t3">
              En fazla {MAX_FON} fon karşılaştırılabilir — daha fazlası tabloyu okunmaz yapar.
            </p>
          )}
        </div>

        {/* ⚠️ Kategori uyarısı — ekranın en önemli dürüstlük noktası */}
        {karisikKategori && (
          <p className="mt-3 rounded-[12px] border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[11.5px] font-medium leading-[1.5] text-t2">
            <strong className="font-semibold text-ink">Farklı kategorilerden fonları karşılaştırıyorsun</strong>{' '}
            ({kategoriler.join(' · ')}). Bunlar farklı işler yapar; biri diğerinden &quot;daha iyi&quot;
            olmayabilir, sadece <strong className="font-semibold">farklıdır</strong>. Yüksek getirili
            olan genelde daha çok risk taşır. Bu yüzden en iyi değer vurgusu kapatıldı.
          </p>
        )}

        {data?.bulunamayan && data.bulunamayan.length > 0 && (
          <p className="mt-3 text-[11.5px] font-medium text-warn">
            Bulunamadı: {data.bulunamayan.join(', ')} — çok az yatırımcısı olduğu için taranmıyor olabilir.
          </p>
        )}

        {secili.length === 0 ? (
          <div className="ie-glass mt-4 rounded-[16px] px-5 py-10 text-center">
            <div className="text-[14px] font-bold text-ink">Karşılaştırmak için fon seç</div>
            <p className="mx-auto mt-1.5 max-w-[440px] text-[12px] font-medium leading-[1.55] text-t2">
              Yukarıdaki kutuya fon kodu ya da adı yazarak başla. İki fonu yan yana koyduğunda
              getirilerini, risklerini ve kategorilerindeki konumlarını birlikte görürsün.
            </p>
          </div>
        ) : loading ? (
          <div className="ie-glass mt-4 h-[420px] animate-pulse rounded-[16px]" />
        ) : funds.length === 0 ? (
          <div className="ie-glass mt-4 rounded-[16px] px-5 py-10 text-center text-[13px] font-medium text-t2">
            {data?.message ?? 'Seçilen fonlar bulunamadı.'}
          </div>
        ) : (
          <>
            {/* Endeksli getiri grafiği */}
            <section className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
              <h2 className="text-[13px] font-bold text-ink">Aynı parayı koysaydım</h2>
              <div className="mt-3">
                <EndeksGrafik funds={funds} series={data?.series ?? {}} />
              </div>
            </section>

            {/* Karşılaştırma tablosu */}
            <section className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-[12px]">
                  <thead>
                    <tr>
                      <th className="pb-2 pr-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-t3">
                        Ölçü
                      </th>
                      {funds.map((f, i) => (
                        <th key={f.code} className="pb-2 pl-3 text-right align-bottom">
                          <Link href={`/fonlar/${f.code}?universe=${universe}`}
                            className={`font-mono text-[14px] font-extrabold ${RENKLER[i % 4]} hover:underline`}>
                            {f.code}
                          </Link>
                          <div className="text-[10px] font-medium text-t4">{f.categoryLabel}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <Satir ad="Nominal getiri" aciklama="Ham getiri" enIyi="buyuk"
                      deger={(f) => ({ text: pct(f.nominal), cls: renk(f.nominal), raw: f.nominal })} />
                    <Satir ad="Risksize göre" aciklama={`Politika faizi %${data?.policyRate ?? '—'} düşülmüş`} enIyi="buyuk"
                      deger={(f) => ({ text: pct(f.excess), cls: renk(f.excess), raw: f.excess })} />
                    <Satir ad="Enflasyona göre" aciklama={`TÜFE %${data?.inflation ?? '—'} arındırılmış`} enIyi="buyuk"
                      deger={(f) => ({ text: pct(f.real), cls: renk(f.real), raw: f.real })} />

                    <Satir ad="Dalgalanma" aciklama="Yıllık oynaklık — düşük olması iyi" enIyi="kucuk"
                      deger={(f) => ({ text: f.volatility == null ? '—' : `%${f.volatility.toFixed(1)}`, raw: f.volatility })} />
                    <Satir ad="Sharpe" aciklama="Her birim risk için getiri" enIyi="buyuk"
                      deger={(f) => ({ text: num(f.sharpe), raw: f.sharpe })} />
                    <Satir ad="Sortino" aciklama="Yalnız düşüşü cezalandırır" enIyi="buyuk"
                      deger={(f) => ({ text: num(f.sortino), raw: f.sortino })} />
                    <Satir ad="Calmar" aciklama="Getiri ÷ en sert düşüş · düşüş %1'in altındaysa gösterilmez" enIyi="buyuk"
                      deger={(f) => ({ text: num(f.calmar), raw: f.calmar })} />
                    <Satir ad="En sert düşüş" aciklama="Zirveden dibe" enIyi="buyuk"
                      deger={(f) => ({ text: f.maxDrawdown == null ? '—' : `%${f.maxDrawdown.toFixed(1)}`, cls: 'text-down', raw: f.maxDrawdown })} />
                    <Satir ad="En kötü ay" aciklama="Tek ayda görülen en kötü" enIyi="buyuk"
                      deger={(f) => ({ text: f.worstMonth == null ? '—' : `%${f.worstMonth.toFixed(1)}`, cls: 'text-down', raw: f.worstMonth })} />

                    <Satir ad="Risk-ayarlı skor" aciklama="Kategorisine göre 0-100" enIyi="buyuk"
                      deger={(f) => ({ text: f.score == null ? '—' : String(f.score), cls: f.score == null ? 'text-t3' : 'text-ai', raw: f.score })} />
                    <Satir ad="Kategoride getiri sırası" enIyi="kucuk"
                      deger={(f) => ({ text: f.rankByReturn == null ? '—' : `${f.rankByReturn}.`, raw: f.rankByReturn })} />
                    <Satir ad="Kategoride risk-ayarlı sıra" enIyi="kucuk"
                      deger={(f) => ({ text: f.rankByScore == null ? '—' : `${f.rankByScore}.`, raw: f.rankByScore })} />

                    <Satir ad="Büyüklük"
                      deger={(f) => ({ text: tl(f.size), raw: f.size })} />
                    <Satir ad="Yatırımcı sayısı"
                      deger={(f) => ({ text: f.investors?.toLocaleString('tr-TR') ?? '—', raw: f.investors })} />
                    <Satir ad="Gözlem" aciklama="İşlem günü"
                      deger={(f) => ({ text: String(f.observations), raw: f.observations })} />
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[10.5px] font-medium leading-[1.5] text-t3">
                {karisikKategori
                  ? 'Fonlar farklı kategorilerde olduğu için hiçbir satırda "en iyi" vurgusu yapılmadı.'
                  : 'Yeşil vurgu o ölçüde en iyi değeri gösterir — tek başına bir karar değil, bir gözlemdir.'}{' '}
                Sıralamalar her fonun <strong className="font-semibold">kendi kategorisi</strong> içindedir;
                farklı kategorilerdeki sıralar birbiriyle kıyaslanamaz.
              </p>
            </section>

            {/* Dönemsel karşılaştırma */}
            <section className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
              <h2 className="text-[13px] font-bold text-ink">Dönem dönem getiri</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-[12px]">
                  <thead>
                    <tr>
                      <th className="pb-2 pr-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-t3">Dönem</th>
                      {funds.map((f, i) => (
                        <th key={f.code} className={`pb-2 pl-3 text-right font-mono text-[12px] font-extrabold ${RENKLER[i % 4]}`}>
                          {f.code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(funds[0]?.periods ?? []).filter((p) => p.key !== '6a').map((p) => (
                      <tr key={p.key} className="border-t border-hairline">
                        <td className="py-1.5 pr-3 font-medium text-t2">{p.label}</td>
                        {funds.map((f) => {
                          const d = f.periods.find((x) => x.key === p.key);
                          return (
                            <td key={f.code} className={`py-1.5 pl-3 text-right font-mono font-bold ${renk(d?.returnPct)}`}>
                              {d?.returnPct == null
                                ? <span className="text-[10px] font-medium text-t4">yok</span>
                                : pct(d.returnPct)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10.5px] font-medium text-t4">
                &quot;yok&quot; sıfır değil, <strong className="font-semibold">ölçemedik</strong> demektir —
                geçmiş verimiz o dönemi kapsamıyor.
              </p>
            </section>
          </>
        )}

        <YasalFeragat className="mt-5" />
      </div>
    </div>
  );
}

export default FonKarsilastirScreen;
