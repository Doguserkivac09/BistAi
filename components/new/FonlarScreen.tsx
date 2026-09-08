'use client';

/**
 * Fonlar ekranı (FON-ANALIZ-PLAN F6-1) — TEFAS ve BES AYRI bölümler.
 *
 * ÜRÜN DİLİ (plan gereği hisse dünyasından AYRI): "AL/SAT", stop-loss, R/R YOK.
 * Dil karşılaştırma ve uygunluk üzerine: "hangisi daha mantıklı", "maliyet", "uyum".
 *
 * ⭐ ÇİFTE SIRALAMA (F5-2): varsayılan sıra risk-ayarlı skordur, ama "Getiriye göre"
 * birinci sınıf bir seçenektir ve HER SATIRDA İKİ SIRA BİRDEN görünür
 * ("Getiride 3. · Risk-ayarlıda 47."). Kullanıcı ayrışmayı kendi gözüyle görür —
 * canlı veride kanıtlandı: bir hisse fonu getiride 1., risk-ayarlıda 7. çıkabiliyor.
 */

import { useEffect, useMemo, useState } from 'react';
import YasalFeragat from '@/components/new/YasalFeragat';
import type { FundEntry } from '@/lib/fund-runner';
import { MIN_OBS } from '@/lib/fund-metrics';

type Universe = 'TEFAS' | 'BES';
type SortKey = 'risk' | 'getiri';

// Tip tek kaynaktan (motor) — ekran ile motor şeması ayrışamaz
type Fund = FundEntry;
type FundFlag = FundEntry['flags'][number];

interface Resp {
  available: boolean; universe?: Universe; scannedAt?: string;
  policyRate?: number | null; inflation?: number | null;
  minInvestors?: number; count?: number; funds?: Fund[]; message?: string; note?: string;
}

const TONE: Record<FundFlag['tone'], string> = {
  pos: 'border-up/25 bg-up/[0.10] text-up',
  warn: 'border-warn/30 bg-warn/[0.12] text-warn',
  neutral: 'border-hairline bg-fill text-t2',
};

const pct = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
const pctColor = (v: number | null | undefined) =>
  v == null ? 'text-t3' : v >= 0 ? 'text-up' : 'text-down';
const tl = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1e9 ? `${(v / 1e9).toFixed(1)} mlr ₺` : `${Math.round(v / 1e6)} mn ₺`;

function FundRow({ f, sort }: { f: Fund; sort: SortKey }) {
  // Rozetler: maks 4, UYARI mutlaka görünür (FIRSATLAR-SUNUM-PLAN ilkesi birebir)
  const secili = useMemo(() => {
    const s = f.flags.slice(0, 4);
    const warn = f.flags.find((x) => x.tone === 'warn');
    if (warn && !s.some((x) => x.tone === 'warn')) { s[Math.max(0, s.length - 1)] = warn; }
    return s;
  }, [f.flags]);

  return (
    <div className="ie-glass rounded-[16px] px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-extrabold text-ink">{f.code}</span>
            {f.categoryLabel && (
              <span className="rounded-[7px] bg-fill px-1.5 py-px text-[10px] font-bold text-t2">{f.categoryLabel}</span>
            )}
            {f.accessibility !== 'herkes' && (
              <span
                title={`Erişilebilirlik ${f.accessibilitySource} ile belirlendi — kesin bilgi değildir`}
                className="rounded-[7px] border border-warn/30 bg-warn/[0.10] px-1.5 py-px text-[10px] font-bold text-warn"
              >
                {f.accessibility === 'nitelikli' ? 'nitelikli yatırımcı?' : 'kurucuya özel?'}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] font-medium text-t3" title={f.name}>{f.name}</div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className={`font-mono text-[15px] font-bold ${pctColor(f.nominal)}`}>{pct(f.nominal)}</div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-t3">getiri</div>
          </div>
          <div className="text-right">
            <div className={`font-mono text-[15px] font-bold ${f.score == null ? 'text-t3' : 'text-ai'}`}>{f.score ?? '—'}</div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-t3">skor</div>
          </div>
        </div>
      </div>

      {/* Üç katmanlı getiri — ürünün kalbi, HER ZAMAN birlikte */}
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 rounded-[12px] border border-hairline px-3 py-2">
        {([
          ['Nominal', f.nominal],
          ['Risksize göre', f.excess],
          ['Enflasyona göre', f.real],
        ] as const).map(([label, v]) => (
          <div key={label}>
            <div className="text-[10px] font-medium text-t3">{label}</div>
            <div className={`font-mono text-[12.5px] font-bold ${pctColor(v)}`}>{pct(v)}</div>
          </div>
        ))}
        <div className="ml-auto flex gap-x-4">
          <div>
            <div className="text-[10px] font-medium text-t3">Dalgalanma</div>
            <div className="font-mono text-[12.5px] font-bold text-ink">{f.volatility == null ? '—' : `%${f.volatility.toFixed(1)}`}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-t3">Sharpe</div>
            <div className="font-mono text-[12.5px] font-bold text-ink">{f.sharpe ?? '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-t3">En sert düşüş</div>
            <div className="font-mono text-[12.5px] font-bold text-down">{f.maxDrawdown == null ? '—' : `%${f.maxDrawdown.toFixed(1)}`}</div>
          </div>
        </div>
      </div>

      {secili.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {secili.map((fl) => (
            <span key={fl.id} title={fl.detail ?? fl.text}
              className={`rounded-[8px] border px-2 py-[3px] text-[10.5px] font-semibold ${TONE[fl.tone]}`}>
              {fl.text}
            </span>
          ))}
        </div>
      )}

      {/* ⭐ ÇİFTE SIRA — iki sıralama birden, kullanıcı ayrışmayı görsün */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-t3">
        {f.score == null ? (
          <span className="text-warn">
            Risk ölçümü için en az {MIN_OBS.risk} işlem günü gerekiyor — şu an {f.observations}.
            Risk-ayarlı skor ve sırası bu yüzden yok.
          </span>
        ) : f.rankByReturn != null && f.rankByScore != null ? (
          <span>
            Kategorisinde <strong className={`font-bold ${sort === 'getiri' ? 'text-ink' : 'text-t2'}`}>getiride {f.rankByReturn}.</strong>
            {' · '}
            <strong className={`font-bold ${sort === 'risk' ? 'text-ink' : 'text-t2'}`}>risk-ayarlıda {f.rankByScore}.</strong>
          </span>
        ) : (
          <span>Kategori sırası hesaplanamadı</span>
        )}
        {!f.peerReliable && <span className="text-warn">emsal az — kategori kıyası zayıf</span>}
        <span className="ml-auto">{tl(f.size)} · {f.investors?.toLocaleString('tr-TR') ?? '—'} yatırımcı · {f.observations} gözlem</span>
      </div>
    </div>
  );
}

export function FonlarScreen() {
  const [universe, setUniverse] = useState<Universe>('TEFAS');
  const [sort, setSort] = useState<SortKey>('risk');
  const [kategori, setKategori] = useState<number | 'hepsi'>('hepsi');
  const [yalnizErisilebilir, setYalnizErisilebilir] = useState(true);
  const [data, setData] = useState<Record<Universe, Resp | null>>({ TEFAS: null, BES: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let iptal = false;
    setLoading(true);
    fetch(`/api/fonlar?universe=${universe}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Resp | null) => { if (!iptal) setData((p) => ({ ...p, [universe]: d })); })
      .catch(() => {})
      .finally(() => { if (!iptal) setLoading(false); });
    return () => { iptal = true; };
  }, [universe]);

  const resp = data[universe];
  const funds = resp?.funds ?? [];

  const kategoriler = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of funds) if (f.category != null && f.categoryLabel) m.set(f.category, f.categoryLabel);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  }, [funds]);

  // Risk-ayarlı skor üretilebilmiş fon sayısı. Sıfırsa varsayılan sıralamanın adı
  // yalan olur → getiriye düşülür ve NEDENİ yazılır (sessizce düşmek yanıltıcı).
  const skorlu = useMemo(() => funds.filter((f) => f.score != null).length, [funds]);
  const riskYok = resp?.available === true && funds.length > 0 && skorlu === 0;
  const etkinSort: SortKey = riskYok ? 'getiri' : sort;

  const gosterilen = useMemo(() => {
    let x = funds;
    if (yalnizErisilebilir) x = x.filter((f) => f.accessibility === 'herkes');
    if (kategori !== 'hepsi') x = x.filter((f) => f.category === kategori);
    return [...x].sort((a, b) =>
      etkinSort === 'risk' ? (b.score ?? -1) - (a.score ?? -1) : (b.nominal ?? -999) - (a.nominal ?? -999),
    );
  }, [funds, etkinSort, kategori, yalnizErisilebilir]);

  const chip = (aktif: boolean) =>
    `rounded-[11px] px-3.5 py-2 text-[12px] font-semibold transition-colors ${aktif ? 'bg-ink text-onink' : 'ie-glass-flat text-t2 hover:text-ink'}`;

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[22px]">
          Fonlar <span className="hidden text-[13px] font-semibold text-t3 lg:inline">· karşılaştırma</span>
        </h1>
        <p className="mt-0.5 text-[12px] font-medium text-t3">
          {resp?.available
            ? `${resp.count} fon · risksiz getiri %${resp.policyRate ?? '—'} · enflasyon %${resp.inflation ?? '—'}`
            : 'Getiriyi tek başına değil; riskiyle, enflasyonla ve emsaliyle birlikte gösterir.'}
        </p>

        {/* TEFAS ↔ BES — plan gereği AYRI bölümler */}
        <div className="mt-4 flex gap-2">
          {(['TEFAS', 'BES'] as const).map((u) => (
            <button key={u} onClick={() => setUniverse(u)} className={chip(universe === u)}>
              {u === 'TEFAS' ? 'TEFAS Fonları' : 'BES / Emeklilik'}
            </button>
          ))}
        </div>

        {/* Sıralama anahtarı — getiri birinci sınıf seçenek, gizlenmiş değil */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-t3">Sırala:</span>
          <button
            onClick={() => setSort('risk')}
            disabled={riskYok}
            title={riskYok ? `Risk ölçümü için en az ${MIN_OBS.risk} işlem günü gerekiyor` : undefined}
            className={`${chip(etkinSort === 'risk')} ${riskYok ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            Risk-ayarlı
          </button>
          <button onClick={() => setSort('getiri')} className={chip(etkinSort === 'getiri')}>Getiriye göre</button>
          <label className="ml-2 flex cursor-pointer items-center gap-2 text-[11.5px] font-semibold text-t2">
            <input type="checkbox" checked={yalnizErisilebilir} onChange={(e) => setYalnizErisilebilir(e.target.checked)} />
            Yalnız alabileceklerim
          </label>
        </div>

        {kategoriler.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button onClick={() => setKategori('hepsi')} className={chip(kategori === 'hepsi')}>Tüm kategoriler</button>
            {kategoriler.map(([kod, ad]) => (
              <button key={kod} onClick={() => setKategori(kod)} className={chip(kategori === kod)}>{ad}</button>
            ))}
          </div>
        )}

        {riskYok && (
          <p className="mt-3 rounded-[12px] border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[11.5px] font-medium leading-[1.5] text-t2">
            <strong className="font-semibold text-ink">Risk-ayarlı sıralama henüz açık değil.</strong>{' '}
            Dalgalanma ve Sharpe için en az {MIN_OBS.risk} işlem günlük fiyat geçmişi gerekiyor;
            veri penceresi hâlâ birikiyor. Şu an liste <strong className="font-semibold">getiriye göre</strong> sıralanıyor —
            yani en çok kazandıranı görüyorsunuz, en mantıklısını değil. Üç katmanlı getiri
            (nominal / risksize göre / enflasyona göre) şimdiden doğru.
          </p>
        )}

        {!riskYok && sort === 'getiri' && (
          <p className="mt-3 rounded-[12px] border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[11.5px] font-medium leading-[1.5] text-t2">
            Getiri sıralaması en çok kazandıranı gösterir, <strong className="font-semibold">en mantıklısını değil</strong> —
            yüksek getiri genelde yüksek dalgalanmayla gelir. Her satırda risk bağlamı ve iki sıralama birden duruyor.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2.5">
          {loading ? (
            [...Array(5)].map((_, i) => <div key={i} className="ie-glass h-[132px] animate-pulse rounded-[16px]" />)
          ) : !resp?.available ? (
            <div className="ie-glass rounded-[16px] px-5 py-9 text-center">
              <div className="text-[14px] font-bold text-ink">Fon verisi henüz hazırlanmadı</div>
              <p className="mx-auto mt-1.5 max-w-[420px] text-[12px] font-medium leading-[1.55] text-t2">
                {resp?.message ?? 'Günlük fon taraması ilk koşusunu bekliyor.'} Veri birikince
                nominal, risksize göre ve enflasyona göre getiri birlikte gösterilecek.
              </p>
            </div>
          ) : gosterilen.length === 0 ? (
            <div className="ie-glass rounded-[16px] px-5 py-9 text-center text-[13px] font-medium text-t2">
              Bu filtrede fon yok. {yalnizErisilebilir && 'Erişilebilirlik filtresini kapatmayı deneyebilirsin.'}
            </div>
          ) : (
            gosterilen.map((f) => <FundRow key={f.code} f={f} sort={etkinSort} />)
          )}
        </div>

        {resp?.available && (
          <p className="mt-4 text-[10.5px] font-medium leading-[1.5] text-t3">
            Getiriler dönem içi, komisyon/vergi hariçtir. Erişilebilirlik etiketi fon adından
            <strong className="font-semibold"> tahmin edilmiştir</strong>, kesin bilgi değildir —
            alım şartını kurucudan doğrulayın. Emsal karşılaştırması yalnız kendi kategorisi içinde
            yapılır. Geçmiş performans gelecek getiriyi garanti etmez.
          </p>
        )}

        <YasalFeragat className="mt-5" />
      </div>
    </div>
  );
}

export default FonlarScreen;
