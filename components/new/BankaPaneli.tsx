'use client';

/**
 * Banka Sağlık Paneli (BANKA-MOTORU-PLAN FAZ K3).
 *
 * Bankalarda Piotroski/Altman/Beneish "uygulanmaz" döner — sanayi paneli boş kalırdı.
 * Bu panel onun yerine banka mantığını gösterir: gelir kırılımı (çekirdek vs ticari),
 * faiz marjı proxy'si, risk maliyeti, maliyet/gelir + bayraklar.
 *
 * Veri: /api/bank-health?symbol=X (haftalık cron precompute, fan-out YOK).
 * ÖLÇÜLEMEYEN metrik GÖSTERİLMEZ — "—" yazılır, sıfır/uydurma değer üretilmez.
 * NPL / karşılık oranı (coverage) / Stage 2 / SYR kaynakta YOK; panel bunu açıkça söyler.
 */

import { useEffect, useState } from 'react';

interface BankFlag { id: string; tone: 'pos' | 'warn'; text: string; detail?: string }

interface BankMetrics {
  coreIncomeRatio: number | null;
  tradingShare: number | null;
  nimProxy: number | null;
  corBps: number | null;
  costIncome: number | null;
  nimDeltaPp: number | null;
  corDeltaBps: number | null;
  netIncomeGrowthPct: number | null;
}

interface BankOutlook {
  available: boolean;
  targetPrice: number | null;
  currentPrice: number | null;
  upsidePct: number | null;
  consensusLabel: string | null;
  consensusMean: number | null;
  analystCount: number | null;
}

interface BankHealthResp {
  available: boolean;
  tier?: 1 | 2;
  institution?: 'banka' | 'finans';
  score?: number | null;
  verdict?: string;
  flags?: BankFlag[];
  dataQuality?: string;
  metrics?: BankMetrics | null;
  outlook?: BankOutlook | null;
  lastQuarter?: string | null;
  message?: string;
}

const VERDICT_META: Record<string, { label: string; color: string; bg: string }> = {
  saglikli: { label: 'Sağlıklı', color: '#16a35b', bg: 'rgba(22,163,91,0.12)' },
  notr: { label: 'Nötr', color: '#c98a00', bg: 'rgba(201,138,0,0.12)' },
  zayif: { label: 'Zayıf', color: '#e5484d', bg: 'rgba(229,72,77,0.12)' },
  olculemedi: { label: 'Ölçülemedi', color: '#8a909b', bg: 'rgba(138,144,155,0.14)' },
};

const pctText = (v: number | null, digits = 0) => (v == null ? '—' : `%${(v * 100).toFixed(digits)}`);
const numText = (v: number | null, suffix = '') => (v == null ? '—' : `${v}${suffix}`);

function Metric({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-t3" title={hint}>{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-[15px] font-bold text-ink">{value}</span>
        {delta && <span className="font-mono text-[10.5px] font-semibold text-t3">{delta}</span>}
      </div>
    </div>
  );
}

export function BankaPaneli({ sembol }: { sembol: string }) {
  const [data, setData] = useState<BankHealthResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/bank-health?symbol=${encodeURIComponent(sembol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BankHealthResp | null) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sembol]);

  if (loading) return <div className="ie-glass h-[190px] animate-pulse rounded-[16px]" />;
  if (!data?.available) {
    return (
      <div className="ie-glass rounded-[16px] px-[18px] py-[15px]">
        <div className="text-[14px] font-extrabold text-ink">Kurum değerlendirmesi</div>
        <p className="mt-1 text-[12px] font-medium leading-[1.5] text-t2">
          {data?.message ?? 'Bu şirket için değerlendirme verisi yok.'}
        </p>
      </div>
    );
  }

  const v = VERDICT_META[data.verdict ?? 'olculemedi'] ?? VERDICT_META.olculemedi!;
  const m = data.metrics ?? null;
  const tier2 = data.tier === 2;
  // Banka tablosu beyan etmeyen kuruluş (aracı kurum/leasing/faktoring) "banka" diye sunulmaz.
  const isBank = data.institution !== 'finans';
  const baslik = isBank ? 'Banka değerlendirmesi' : 'Finans kuruluşu değerlendirmesi';

  return (
    <div className="ie-glass rounded-[16px] px-[18px] py-[15px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-extrabold text-ink">{baslik}</span>
          <span
            className="rounded-[7px] border border-hairline bg-fill px-1.5 py-px text-[9.5px] font-bold text-t3"
            title="Skor GERÇEKLEŞMİŞ kârlılık, emsal çarpanları ve gelir kalitesini ölçer — ileriye dönük beklenti DEĞİLDİR (o aşağıda ayrı gösterilir)."
          >
            gerçekleşmiş kalite &amp; risk
          </span>
          <span className="rounded-[7px] border border-hairline bg-fill px-1.5 py-px text-[9.5px] font-bold text-t3">
            {tier2 ? 'Kademe 2 · geniş veri' : 'Kademe 1 · kısmi veri'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {data.score != null && <span className="font-mono text-[15px] font-bold text-ink">{data.score}<span className="text-[11px] font-semibold text-t3">/100</span></span>}
          <span className="rounded-[9px] px-2.5 py-1 text-[12px] font-extrabold" style={{ background: v.bg, color: v.color }}>{v.label}</span>
        </div>
      </div>

      {tier2 && m && (
        <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Metric
            label="Çekirdek gelir payı"
            value={pctText(m.coreIncomeRatio)}
            hint="Net faiz + net komisyon gelirinin toplam faaliyet geliri içindeki payı. Yüksek = kâr çekirdek işten."
          />
          <Metric
            label="Ticari gelir payı"
            value={pctText(m.tradingShare)}
            hint="Kambiyo/türev kaynaklı kâr-zararın payı. Volatil, tek seferlik olabilir; negatif = ticari zarar."
          />
          <Metric
            label="Faiz marjı (proxy)"
            value={m.nimProxy == null ? '—' : `%${m.nimProxy.toFixed(1)}`}
            delta={m.nimDeltaPp == null ? null : `${m.nimDeltaPp >= 0 ? '+' : ''}${m.nimDeltaPp.toFixed(1)} p`}
            hint="Net faiz geliri / ortalama aktif. Getirili aktif kırılımı tabloda olmadığı için AKTİF bazlı yaklaşıktır."
          />
          <Metric
            label="Karşılık oranı"
            value={numText(m.corBps, ' bp')}
            delta={m.corDeltaBps == null ? null : `${m.corDeltaBps >= 0 ? '+' : ''}${m.corDeltaBps} bp`}
            hint="Karşılık gideri / ortalama krediler (brüt). Piyasanın 'net CoR'u değildir — seviyeden çok TRENDİ anlamlıdır."
          />
          <Metric
            label="Maliyet / gelir"
            value={pctText(m.costIncome)}
            hint="Faaliyet gideri / toplam faaliyet geliri. Düşük = verimli."
          />
          <Metric
            label="Net kâr (yıllık)"
            value={m.netIncomeGrowthPct == null ? '—' : `${m.netIncomeGrowthPct >= 0 ? '+' : ''}${m.netIncomeGrowthPct.toFixed(0)}%`}
            hint="Son 12 ayın net kârı, bir önceki 12 aya göre (nominal)."
          />
        </div>
      )}

      {(data.flags?.length ?? 0) > 0 && (
        <div className="mt-3.5 flex flex-col gap-1.5">
          {data.flags!.map((f) => (
            <div
              key={f.id}
              className={`flex items-start gap-2 rounded-[10px] border px-2.5 py-1.5 ${
                f.tone === 'warn' ? 'border-warn/30 bg-warn/[0.08]' : 'border-up/25 bg-up/[0.07]'
              }`}
            >
              <span aria-hidden className="text-[12px] leading-[1.4]">{f.tone === 'warn' ? '⚠️' : '✓'}</span>
              <div className="min-w-0">
                <div className={`text-[12px] font-bold ${f.tone === 'warn' ? 'text-warn' : 'text-up'}`}>{f.text}</div>
                {f.detail && <div className="text-[11px] font-medium leading-[1.45] text-t3">{f.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* BEKLENTİ — skordan BAĞIMSIZ. Geçmiş kalite düşükken beklenti yüksek olabilir
          (dip kârla F/K şişer, skor düşer); ikisini karıştırmıyoruz. */}
      <div className="mt-3.5 rounded-[12px] border border-ai/25 bg-ai/[0.06] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-bold text-ink">Beklenti (analist konsensüsü)</span>
          {data.outlook?.available && data.outlook.analystCount != null && (
            <span className="text-[10px] font-semibold text-t3">{data.outlook.analystCount} kurum</span>
          )}
        </div>
        {data.outlook?.available ? (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {data.outlook.upsidePct != null && (
              <span className="font-mono text-[14px] font-bold" style={{ color: data.outlook.upsidePct >= 0 ? '#16a35b' : '#e5484d' }}>
                {data.outlook.upsidePct >= 0 ? '+' : ''}{data.outlook.upsidePct.toFixed(0)}%
                <span className="ml-1 font-sans text-[11px] font-medium text-t3">hedefe göre</span>
              </span>
            )}
            {data.outlook.targetPrice != null && (
              <span className="font-mono text-[11.5px] font-semibold text-t2">
                hedef {data.outlook.targetPrice.toFixed(2)} ₺
              </span>
            )}
            {data.outlook.consensusLabel && (
              <span className="text-[11.5px] font-semibold text-t2">
                tavsiye: <strong className="font-bold text-ink">{data.outlook.consensusLabel}</strong>
              </span>
            )}
          </div>
        ) : (
          <div className="mt-1 text-[11.5px] font-medium leading-[1.45] text-t3">
            Bu hisse için yeterli analist kapsamı yok (en az 3 kurum) — beklenti iddia edilmiyor.
          </div>
        )}
        <div className="mt-1.5 text-[10.5px] font-medium leading-[1.45] text-t3">
          Yukarıdaki skordan <strong className="font-semibold">bağımsızdır</strong>: skor geçmiş
          12 ayın kârlılığını ölçer, buradaki beklenti geleceğe bakar. Toparlanma hikâyelerinde
          ikisi zıt yönde olabilir. Kaynak kapsamı ağırlıkla yabancı kurumlardır; yerli aracı
          kurum hedefleri farklı olabilir.
        </div>
      </div>

      <p className="mt-3 text-[10.5px] font-medium leading-[1.5] text-t3">
        {!isBank && (
          <>
            Bu şirket banka sektöründe listeleniyor ama <strong className="font-semibold">BDDK banka
            mali tablosu beyan etmiyor</strong> (aracı kurum / faktoring / leasing / holding olabilir);
            değerlendirme yalnız emsal karşılaştırması ve reel getiriye dayanıyor.{' '}
          </>
        )}
        Bankalarda Piotroski/Altman/Beneish uygulanmaz (brüt marj, işletme sermayesi raporlanmaz);
        bunların yerine gelir kalitesi, marj ve risk maliyeti ölçülür.
        {' '}<strong className="font-semibold">Takipteki kredi (NPL), karşılık oranı, yakın izleme (Stage 2) ve
        sermaye yeterliliği (SYR) kaynak tabloda yer almadığı için ölçülmemiştir</strong> — tahmin edilmez.
        {data.lastQuarter && ` Son dönem: ${data.lastQuarter}.`}
      </p>
    </div>
  );
}

export default BankaPaneli;
