'use client';

/**
 * Fon detay ekranı (FON-FAZ6-PLAN 6C).
 *
 * ÜRÜN DİLİ: fon dünyası hisse dünyasından AYRI — **AL/SAT, stop, R/R YOK.**
 * Dil karşılaştırma ve uygunluk üzerine.
 *
 * ⭐ SAYFANIN ÇEKİRDEĞİ: fiyat ile yatırımcı sayısının ÇİFT EKSENLİ grafiği.
 * 6A-0 ölçümü "yatırımcı kaçışı çöküşü haber verir" iddiasını ÇÜRÜTTÜ, bu yüzden
 * ayrışma bir UYARI olarak yayınlanmıyor. Ama olgunun kendisi gerçek ve veri
 * bizde: grafik onu gösterir, yorumu kullanıcıya bırakır — **iddia yok, veri var.**
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import YasalFeragat from '@/components/new/YasalFeragat';
import type { FundEntry } from '@/lib/fund-runner';

type Universe = 'TEFAS' | 'BES';
type Fund = FundEntry;
type FundFlag = FundEntry['flags'][number];

interface Nokta { d: string; p: number; y: number | null }

interface Resp {
  available: boolean;
  universe?: Universe;
  scannedAt?: string;
  policyRate?: number | null;
  inflation?: number | null;
  fund?: Fund;
  series?: Nokta[];
  message?: string;
}

const TONE: Record<FundFlag['tone'], string> = {
  pos: 'border-up/25 bg-up/[0.10] text-up',
  warn: 'border-warn/30 bg-warn/[0.12] text-warn',
  neutral: 'border-hairline bg-fill text-t2',
};

const pct = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;

/**
 * Büyük değişimleri KAT olarak yazar.
 *
 * Yeni fonlarda yatırımcı sayısı 402'den 162.385'e çıkabiliyor; bunu
 * "+%14.619,7" diye yazmak teknik olarak doğru ama okunmuyor — canlı PHE
 * verisinde görüldü. %1.000 üstü artışlar "×41" biçiminde daha dürüst okunur.
 */
const degisim = (v: number | null | undefined) => {
  if (v == null) return '—';
  if (v >= 1000) return `×${(1 + v / 100).toFixed(v >= 10_000 ? 0 : 1)}`;
  return pct(v);
};
const renk = (v: number | null | undefined) =>
  v == null ? 'text-t3' : v >= 0 ? 'text-up' : 'text-down';
const tl = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1e9 ? `${(v / 1e9).toFixed(1)} mlr ₺` : `${Math.round(v / 1e6)} mn ₺`;
const sayi = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('tr-TR'));
const gun = (d: string) => {
  const [y, a, g] = d.split('-');
  return `${g}.${a}.${y!.slice(2)}`;
};

/**
 * Çift eksenli grafik — sol eksen fiyat, sağ eksen yatırımcı sayısı.
 *
 * Kütüphane KULLANILMIYOR: iki farklı ölçekli seriyi tek panelde, tema
 * değişkenleriyle ve SSR uyumlu çizmek için satır içi SVG en az sürprizli yol
 * (`lightweight-charts` mum/tek-eksen için kurulu; ikinci eksen zorlama olurdu).
 *
 * ⚠️ İki seri AYRI normalize edilir — ortak eksende çizmek yatırımcı sayısını
 * (yüz binler) fiyatın (birkaç lira) yanında düz çizgiye çevirirdi.
 */
function CiftEksenGrafik({ seri }: { seri: Nokta[] }) {
  const W = 760, H = 240, PAD_X = 8, PAD_Y = 14;

  const yol = useMemo(() => {
    const noktalar = seri.filter((x) => Number.isFinite(x.p) && x.p > 0);
    if (noktalar.length < 2) return null;

    const yatirimcili = noktalar.filter((x) => x.y != null && Number.isFinite(x.y!));
    const x = (i: number, n: number) => PAD_X + (i / (n - 1)) * (W - PAD_X * 2);

    const olcek = (vals: number[]) => {
      const min = Math.min(...vals), max = Math.max(...vals);
      const aralik = max - min || 1;
      return (v: number) => H - PAD_Y - ((v - min) / aralik) * (H - PAD_Y * 2);
    };

    const fy = olcek(noktalar.map((p) => p.p));
    const fiyatYol = noktalar
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i, noktalar.length).toFixed(1)},${fy(p.p).toFixed(1)}`)
      .join(' ');

    let yatirimciYol: string | null = null;
    if (yatirimcili.length >= 2) {
      const yy = olcek(yatirimcili.map((p) => p.y!));
      // Yatırımcı serisi kendi indeksinde değil, ANA seri üzerindeki konumunda
      // çizilir — yoksa boş günler zaman eksenini kaydırır ve iki eğri kayar.
      yatirimciYol = yatirimcili
        .map((p, k) => {
          const i = noktalar.findIndex((n) => n.d === p.d);
          return `${k === 0 ? 'M' : 'L'}${x(i, noktalar.length).toFixed(1)},${yy(p.y!).toFixed(1)}`;
        })
        .join(' ');
    }

    return {
      fiyatYol, yatirimciYol,
      ilk: noktalar[0]!, son: noktalar[noktalar.length - 1]!,
      fiyatMin: Math.min(...noktalar.map((p) => p.p)),
      fiyatMax: Math.max(...noktalar.map((p) => p.p)),
      yatMin: yatirimcili.length ? Math.min(...yatirimcili.map((p) => p.y!)) : null,
      yatMax: yatirimcili.length ? Math.max(...yatirimcili.map((p) => p.y!)) : null,
    };
  }, [seri]);

  if (!yol) {
    return (
      <div className="rounded-[14px] border border-hairline px-4 py-8 text-center text-[12px] font-medium text-t3">
        Grafik için yeterli geçmiş yok.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold">
        <span className="flex items-center gap-1.5 text-ink">
          <span className="inline-block h-[2px] w-4 rounded bg-ink" /> Birim pay fiyatı
        </span>
        <span className="flex items-center gap-1.5 text-ai">
          <span className="inline-block h-[2px] w-4 rounded bg-ai" style={{ opacity: 0.9 }} /> Yatırımcı sayısı
        </span>
        <span className="ml-auto font-medium text-t3">{gun(yol.ilk.d)} → {gun(yol.son.d)}</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full min-w-[520px]" role="img"
          aria-label="Fiyat ve yatırımcı sayısının zaman içindeki seyri">
          <path d={yol.fiyatYol} fill="none" stroke="currentColor" strokeWidth={1.8}
            className="text-ink" strokeLinejoin="round" strokeLinecap="round" />
          {yol.yatirimciYol && (
            <path d={yol.yatirimciYol} fill="none" stroke="currentColor" strokeWidth={1.6}
              className="text-ai" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
          )}
        </svg>
      </div>

      <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[10.5px] text-t3">
        <span>Fiyat {yol.fiyatMin.toFixed(4)} – {yol.fiyatMax.toFixed(4)} ₺</span>
        {yol.yatMin != null && (
          <span className="text-ai">Yatırımcı {sayi(yol.yatMin)} – {sayi(yol.yatMax)}</span>
        )}
      </div>
      <p className="mt-2 text-[11px] font-medium leading-[1.5] text-t3">
        İki eğri <strong className="font-semibold">ayrı ölçeklerde</strong> çizilir; amaç
        seviyeleri değil, <strong className="font-semibold">birlikte hareket edip etmediklerini</strong> göstermektir.
        Fiyat yatayken yatırımcı sayısının düşmesi dikkat çekicidir — ancak geçmiş veriyle
        ölçtüğümüzde bu desenin sonraki dönemi öngörmediğini gördük, o yüzden uyarıya çevirmiyoruz.
      </p>
    </div>
  );
}

export function FonDetayScreen({ kod, universe: baslangic }: { kod: string; universe?: Universe }) {
  const [universe, setUniverse] = useState<Universe>(baslangic ?? 'TEFAS');
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [denenenBes, setDenenenBes] = useState(false);

  useEffect(() => {
    let iptal = false;
    setLoading(true);
    fetch(`/api/fonlar/${encodeURIComponent(kod)}?universe=${universe}`)
      .then((r) => r.json())
      .then((d: Resp) => {
        if (iptal) return;
        // Kod hangi evrende olduğunu söylemiyor; TEFAS'ta yoksa BES'te bir kez dener.
        if (!d.available && universe === 'TEFAS' && !denenenBes) {
          setDenenenBes(true);
          setUniverse('BES');
          return;
        }
        setData(d);
        setLoading(false);
      })
      .catch(() => { if (!iptal) { setData(null); setLoading(false); } });
    return () => { iptal = true; };
  }, [kod, universe, denenenBes]);

  const f = data?.fund;

  const donemler = useMemo(() => (f?.periods ?? []).filter((p) => p.key !== '6a'), [f]);
  // "Yıllık" yalnız ≥1 yıl dönemlerde dolar; elde 240 gün varken sütunun tamamı
  // boş kalıyor ve tabloyu gürültüyle şişiriyordu. Değeri olmayan sütun gösterilmez.
  const yillikVar = useMemo(() => donemler.some((p) => p.annualizedPct != null), [donemler]);

  if (loading) {
    return (
      <div className="ie-ambient relative min-h-full px-6 py-6 lg:px-7">
        <div className="ie-glass h-[120px] animate-pulse rounded-[16px]" />
        <div className="ie-glass mt-3 h-[300px] animate-pulse rounded-[16px]" />
      </div>
    );
  }

  if (!data?.available || !f) {
    return (
      <div className="ie-ambient relative min-h-full px-6 py-6 lg:px-7">
        <Link href="/fonlar" className="text-[12px] font-semibold text-t2 hover:text-ink">← Fonlar</Link>
        <div className="ie-glass mt-4 rounded-[16px] px-5 py-10 text-center">
          <div className="font-mono text-[16px] font-extrabold text-ink">{kod}</div>
          <p className="mx-auto mt-2 max-w-[420px] text-[12.5px] font-medium leading-[1.55] text-t2">
            {data?.message ?? 'Bu fon bulunamadı.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
        <Link href="/fonlar" className="text-[12px] font-semibold text-t2 transition-colors hover:text-ink">
          ← Fonlar
        </Link>

        {/* Başlık */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-[24px] font-extrabold tracking-[-0.02em] text-ink">{f.code}</h1>
              <span className="rounded-[8px] bg-fill px-2 py-0.5 text-[11px] font-bold text-t2">
                {data.universe === 'BES' ? 'BES / Emeklilik' : 'TEFAS'}
              </span>
              {f.categoryLabel && (
                <span className="rounded-[8px] border border-hairline px-2 py-0.5 text-[11px] font-bold text-t2"
                  title={f.categoryName ? 'Kaynağın kendi kategorisi' : 'Fon adından tahmin edildi'}>
                  {f.categoryLabel}{!f.categoryName && ' ?'}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-[640px] text-[12.5px] font-medium leading-[1.45] text-t2">{f.name}</p>
          </div>

          <div className="flex shrink-0 gap-5">
            <div className="text-right">
              <div className={`font-mono text-[20px] font-bold ${renk(f.nominal)}`}>{pct(f.nominal)}</div>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-t3">dönem getirisi</div>
            </div>
            <div className="text-right">
              <div className={`font-mono text-[20px] font-bold ${f.score == null ? 'text-t3' : 'text-ai'}`}>
                {f.score ?? '—'}
              </div>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-t3">risk-ayarlı skor</div>
            </div>
          </div>
        </div>

        {/* Rozetler */}
        {f.flags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {f.flags.map((fl) => (
              <span key={fl.id} title={fl.detail ?? fl.text}
                className={`rounded-[8px] border px-2 py-[3px] text-[10.5px] font-semibold ${TONE[fl.tone]}`}>
                {fl.text}
              </span>
            ))}
          </div>
        )}

        {/* 1. Üç katmanlı getiri */}
        <section className="ie-glass mt-4 rounded-[16px] px-4 py-3.5">
          <h2 className="text-[13px] font-bold text-ink">Getiri gerçekte ne kadardı?</h2>
          <p className="mt-0.5 text-[11.5px] font-medium text-t3">
            Nominal getiri tek başına yanıltır; parayı riske atmadan da kazanabileceğin bir
            oran ve enflasyon var.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {([
              ['Nominal', f.nominal, 'Ham getiri'],
              ['Risksize göre', f.excess, `Politika faizi %${data.policyRate ?? '—'} düşülmüş`],
              ['Enflasyona göre', f.real, `TÜFE %${data.inflation ?? '—'} arındırılmış`],
            ] as const).map(([ad, v, alt]) => (
              <div key={ad} className="rounded-[12px] border border-hairline px-3 py-2.5">
                <div className="text-[10.5px] font-semibold text-t3">{ad}</div>
                <div className={`mt-0.5 font-mono text-[17px] font-bold ${renk(v)}`}>{pct(v)}</div>
                <div className="mt-0.5 text-[10px] font-medium leading-[1.35] text-t4">{alt}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. Dönemsel tablo — getiri + yatırımcı YAN YANA (6B) */}
        <section className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
          <h2 className="text-[13px] font-bold text-ink">Dönem dönem</h2>
          <p className="mt-0.5 text-[11.5px] font-medium text-t3">
            Getirinin yanında <strong className="font-semibold">yatırımcı sayısının</strong> ne
            yaptığı duruyor — para giriyor mu, çıkıyor mu?
          </p>
          <div className="mt-3 overflow-x-auto">
            {/* "Yıllık" gizlenince tablo 3 sütuna düşüyor; 375px'te yatay
                kaydırma gerekmesin diye alt sınır dar tutuldu. */}
            <table className="w-full min-w-[292px] text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-t3">
                  <th className="pb-1.5 font-semibold">Dönem</th>
                  <th className="pb-1.5 text-right font-semibold">Getiri</th>
                  {yillikVar && <th className="pb-1.5 text-right font-semibold">Yıllık</th>}
                  <th className="pb-1.5 text-right font-semibold">Yatırımcı</th>
                </tr>
              </thead>
              <tbody>
                {donemler.map((p) => (
                  <tr key={p.key} className="border-t border-hairline">
                    <td className="py-1.5 font-medium text-t2">{p.label}</td>
                    <td className={`py-1.5 text-right font-mono font-bold ${renk(p.returnPct)}`}>
                      {p.returnPct == null
                        ? <span className="text-[10.5px] font-medium text-t4">yeterli geçmiş yok</span>
                        : pct(p.returnPct)}
                    </td>
                    {yillikVar && (
                      <td className="py-1.5 text-right font-mono text-t2">
                        {p.annualizedPct == null ? '—' : pct(p.annualizedPct)}
                      </td>
                    )}
                    <td className={`py-1.5 text-right font-mono font-bold ${renk(p.investorChangePct)}`}
                      title={p.investorChangePct == null ? undefined : `%${p.investorChangePct.toFixed(1)}`}>
                      {degisim(p.investorChangePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10.5px] font-medium text-t4">
            Boş hücreler sıfır değil, <strong className="font-semibold">ölçemediğimiz</strong> anlamına gelir —
            geçmiş verimiz o dönemi kapsamıyor.
          </p>
        </section>

        {/* 3. ⭐ Çift eksenli grafik */}
        <section className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
          <h2 className="text-[13px] font-bold text-ink">Fiyat ve yatırımcı birlikte</h2>
          <div className="mt-3">
            <CiftEksenGrafik seri={data.series ?? []} />
          </div>
        </section>

        {/* 4. Risk */}
        <section className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
          <h2 className="text-[13px] font-bold text-ink">Bu getiri ne kadar riskle alındı?</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['Dalgalanma', f.volatility == null ? null : `%${f.volatility.toFixed(1)}`, 'Yıllık oynaklık'],
              ['Sharpe', f.sharpe == null ? null : f.sharpe.toFixed(2), 'Risk başına getiri'],
              ['En sert düşüş', f.maxDrawdown == null ? null : `%${f.maxDrawdown.toFixed(1)}`, 'Zirveden dibe'],
              ['Gözlem', String(f.observations), 'İşlem günü'],
            ] as const).map(([ad, v, alt]) => (
              <div key={ad} className="rounded-[12px] border border-hairline px-3 py-2.5">
                <div className="text-[10.5px] font-semibold text-t3">{ad}</div>
                <div className="mt-0.5 font-mono text-[15px] font-bold text-ink">{v ?? '—'}</div>
                <div className="mt-0.5 text-[10px] font-medium text-t4">{alt}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Kategori içi konum — çifte sıra */}
        <section className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
          <h2 className="text-[13px] font-bold text-ink">Kategorisinde nerede?</h2>
          {f.rankByReturn != null || f.rankByScore != null ? (
            <div className="mt-2.5 flex flex-wrap gap-3">
              <div className="rounded-[12px] border border-hairline px-3.5 py-2.5">
                <div className="text-[10.5px] font-semibold text-t3">Getiriye göre</div>
                <div className="mt-0.5 font-mono text-[17px] font-bold text-ink">
                  {f.rankByReturn ?? '—'}<span className="text-[12px] text-t3">.</span>
                </div>
              </div>
              <div className="rounded-[12px] border border-hairline px-3.5 py-2.5">
                <div className="text-[10.5px] font-semibold text-t3">Risk-ayarlıya göre</div>
                <div className="mt-0.5 font-mono text-[17px] font-bold text-ai">
                  {f.rankByScore ?? '—'}<span className="text-[12px] text-t3">.</span>
                </div>
              </div>
              {f.categorySize != null && (
                <div className="rounded-[12px] border border-hairline px-3.5 py-2.5">
                  <div className="text-[10.5px] font-semibold text-t3">Emsal sayısı</div>
                  <div className="mt-0.5 font-mono text-[17px] font-bold text-t2">{f.categorySize}</div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-[12px] font-medium text-t2">Kategori sırası hesaplanamadı.</p>
          )}
          {f.peerScope === 'semsiye' && (
            <p className="mt-2 text-[11.5px] font-medium text-t2">
              Bu fonun kendi kategorisinde ({f.categoryLabel}) 5'ten az fon var, bu yüzden
              kıyas <strong className="font-semibold">daha geniş bir gruba</strong> göre yapıldı.
              Sıralama yine anlamlı ama kıyas kabalaşıyor.
            </p>
          )}
          {!f.peerReliable && (
            <p className="mt-2 text-[11.5px] font-medium text-warn">
              Bu kategoride yeterli emsal yok — kıyaslama zayıf, sıralamayı tek başına okuma.
            </p>
          )}
          {f.categoryRank != null && (
            <p className="mt-2 text-[10.5px] font-medium text-t4">
              TEFAS kendi listesinde bu fona {f.categoryRank}. sırayı veriyor. Bizim
              sıralamamız farklı bir hesaba dayanır; ikisi aynı şeyi ölçmez.
            </p>
          )}
        </section>

        {/* 6. Künye */}
        <section className="ie-glass mt-3 rounded-[16px] px-4 py-3.5">
          <h2 className="text-[13px] font-bold text-ink">Künye</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-2 text-[12px] sm:grid-cols-4">
            {([
              ['Büyüklük', tl(f.size)],
              ['Yatırımcı', sayi(f.investors)],
              ['Son veri', f.asOf ? gun(f.asOf) : '—'],
              ['Erişim', f.accessibility],
            ] as const).map(([ad, v]) => (
              <div key={ad}>
                <div className="text-[10.5px] font-semibold text-t3">{ad}</div>
                <div className="mt-0.5 font-mono text-[13px] font-bold text-ink">{v}</div>
              </div>
            ))}
          </div>
          {f.accessibility !== 'herkes' && (
            <p className="mt-2.5 text-[11.5px] font-medium leading-[1.5] text-warn">
              Erişim etiketi <strong className="font-semibold">fon adından tahmin edilmiştir</strong>,
              kesin bilgi değildir — alım şartını kurucudan doğrula.
            </p>
          )}
        </section>

        <YasalFeragat className="mt-5" />
      </div>
    </div>
  );
}

export default FonDetayScreen;
