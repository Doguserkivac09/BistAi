/**
 * İş Yatırım BANKA mali tablo katmanı (BANKA-MOTORU-PLAN FAZ K2).
 *
 * `lib/isyatirim-financials.ts` sanayi (XI_29) şablonunu çözer; bankalar için
 * `financialGroup=UFRS_K` ayrı bir şablon döndürür (BDDK formatı, 192 satır).
 * K0 spike'ında 8 banka ölçüldü: GARAN/AKBNK/ISCTR/YKBNK/HALKB/VAKBN/SKBNK/TSKB
 * birebir aynı kod setini kullanıyor; katılım bankası (ALBRK) PARALEL ama KAYMIŞ
 * bir set kullanıyor (kâr payı esaslı) → iki harita, otomatik tespit.
 *
 * ⚠️ KÜMÜLATİF NÜANS sanayi ile aynı: gelir tablosu YTD kümülatif (period 3/6/9/12),
 * bilanço snapshot. Standalone çeyrek için yıl-içi ardışık fark alınır.
 *
 * ⚠️ ŞABLONDA OLMAYAN (uydurulmaz, "ölçülemedi" denir):
 *   NPL (`1AFD`) ve özel karşılıklar (`1AFE`) IFRS-9 sonrası **hep 0** geliyor →
 *   NPL oranı / coverage / Stage 2 HESAPLANAMAZ. SYR/CET1 ve TÜFEX portföy ağırlığı
 *   mali tabloda ayrı kalem değil → yok. Bunlar BDDK bülteni gerektirir (ayrı iş).
 *
 * ⚠️ LİSANS: ham tablo REDISTRİBÜTE EDİLMEZ — türetilmiş oran/skor servis edilir.
 */

import { fetchBatch, type IsyPeriodRef } from './isyatirim-financials';

/** Banka analizinde kullandığımız alanlar (ham tablonun küçük bir alt kümesi). */
export interface BankFields {
  interestIncome: number | null;      // faiz / kâr payı geliri
  interestExpense: number | null;     // faiz / kâr payı gideri
  netInterestIncome: number | null;   // NII — çekirdek motor
  netFeeIncome: number | null;        // net ücret & komisyon — en kaliteli gelir
  tradingProfit: number | null;       // ticari kâr/zarar (kambiyo+türev) — volatil
  otherOperatingIncome: number | null;
  totalOperatingIncome: number | null;
  provisions: number | null;          // kredi değer düşüş karşılığı (CoR payı)
  operatingExpense: number | null;    // faaliyet gideri (maliyet/gelir payı)
  netIncome: number | null;
  loans: number | null;               // snapshot
  deposits: number | null;            // snapshot (katılım: toplanan fonlar)
  totalAssets: number | null;         // snapshot
  equity: number | null;              // snapshot
}

type BankFieldKey = keyof BankFields;

/** Geleneksel banka (BDDK UFRS_K) kod haritası — 8 bankada doğrulandı. */
const CONVENTIONAL: Record<BankFieldKey, string> = {
  interestIncome: '3A', interestExpense: '3B', netInterestIncome: '3C',
  netFeeIncome: '3CA', tradingProfit: '3CC', otherOperatingIncome: '3CD',
  totalOperatingIncome: '3CE', provisions: '3CF', operatingExpense: '3CG',
  netIncome: '3Z', loans: '1AF', deposits: '2A', totalAssets: '1Z', equity: '2O',
};

/** Katılım bankası (kâr payı esaslı) — ALBRK'de doğrulandı. Kodlar KAYMIŞ. */
const PARTICIPATION: Record<BankFieldKey, string> = {
  interestIncome: '3A', interestExpense: '3AAK', netInterestIncome: '3AAR',
  netFeeIncome: '3AAS', tradingProfit: '3ABC', otherOperatingIncome: '3ABG',
  totalOperatingIncome: '3ABH', provisions: '3ABI', operatingExpense: '3ABJ',
  netIncome: '3Z', loans: '1ABF', deposits: '2A', totalAssets: '1Z', equity: '2O',
};

/** Akış (kümülatif → fark alınır) vs snapshot (dönem sonu) ayrımı. */
const SNAPSHOT: ReadonlySet<BankFieldKey> = new Set(['loans', 'deposits', 'totalAssets', 'equity']);

export type BankTemplate = 'conventional' | 'participation';

export interface BankPeriodData extends IsyPeriodRef {
  fields: BankFields;
}

export interface BankQuarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  label: string;
  fields: BankFields;
}

const emptyFields = (): BankFields => ({
  interestIncome: null, interestExpense: null, netInterestIncome: null, netFeeIncome: null,
  tradingProfit: null, otherOperatingIncome: null, totalOperatingIncome: null, provisions: null,
  operatingExpense: null, netIncome: null, loans: null, deposits: null, totalAssets: null, equity: null,
});

/**
 * Şablon tespiti: geleneksel bankada `3C` (Net Faiz Geliri) DOLU, katılım bankasında
 * o kod yok/boş ama `3AAR` (Net Kâr Payı Geliri) dolu. Sıfır ile null ayrımı önemli —
 * bazı kalemler gerçekten 0 raporlanır, o yüzden "var mı" testi map.has() ile yapılır.
 */
function detectTemplate(m: Map<string, number | null>): BankTemplate {
  const conv = m.get(CONVENTIONAL.netInterestIncome);
  if (conv != null && conv !== 0) return 'conventional';
  const part = m.get(PARTICIPATION.netInterestIncome);
  if (part != null && part !== 0) return 'participation';
  return 'conventional';
}

/**
 * Banka mali tablolarını çeker. Dönemler 4'erli batch'lerde PARALEL istenir
 * (sanayi katmanıyla aynı desen). Veri yoksa `periods: []` döner — uydurulmaz.
 */
export async function fetchBankFinancials(
  code: string,
  refs: IsyPeriodRef[],
): Promise<{ template: BankTemplate; periods: BankPeriodData[] }> {
  const chunks: IsyPeriodRef[][] = [];
  for (let i = 0; i < refs.length; i += 4) chunks.push(refs.slice(i, i + 4));
  const results = await Promise.all(
    chunks.map((c) =>
      fetchBatch(code, c, 'UFRS_K').catch(() => c.map(() => new Map<string, number | null>())),
    ),
  );
  const batches = results.flat();
  const nonEmpty = batches.find((m) => m.size > 0);
  if (!nonEmpty) return { template: 'conventional', periods: [] };

  const template = detectTemplate(nonEmpty);
  const codes = template === 'participation' ? PARTICIPATION : CONVENTIONAL;

  const periods: BankPeriodData[] = refs.map((ref, idx) => {
    const m = batches[idx] ?? new Map<string, number | null>();
    const fields = emptyFields();
    for (const key of Object.keys(codes) as BankFieldKey[]) {
      fields[key] = m.get(codes[key]) ?? null;
    }
    return { ...ref, fields };
  });
  return { template, periods };
}

/**
 * Kümülatif YTD dönemleri tek-çeyrek serisine çevirir (sanayi `toStandaloneQuarters`
 * ile AYNI kural): akış kalemleri yıl-içi ardışık fark, bilanço snapshot.
 * Önceki dönem pencerede yoksa kümülatifi standalone SAYMAZ → null.
 */
export function toBankQuarters(periods: BankPeriodData[]): BankQuarter[] {
  const byYear = new Map<number, Map<number, BankPeriodData>>();
  for (const p of periods) {
    if (!byYear.has(p.year)) byYear.set(p.year, new Map());
    byYear.get(p.year)!.set(p.period, p);
  }
  const order: Array<{ period: 3 | 6 | 9 | 12; q: 1 | 2 | 3 | 4; prev: number | null }> = [
    { period: 3, q: 1, prev: null }, { period: 6, q: 2, prev: 3 },
    { period: 9, q: 3, prev: 6 }, { period: 12, q: 4, prev: 9 },
  ];
  const out: BankQuarter[] = [];
  for (const [year, pm] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    for (const { period, q, prev } of order) {
      const cur = pm.get(period);
      if (!cur) continue;
      const prevP = prev != null ? pm.get(prev) : undefined;
      const fields = emptyFields();
      for (const key of Object.keys(fields) as BankFieldKey[]) {
        const cv = cur.fields[key];
        if (SNAPSHOT.has(key) || prev == null) fields[key] = cv;
        else if (!prevP) fields[key] = null;
        else {
          const pv = prevP.fields[key];
          fields[key] = cv != null && pv != null ? cv - pv : null;
        }
      }
      out.push({ year, quarter: q, label: `${year}Q${q}`, fields });
    }
  }
  return out;
}

/** Son 4 standalone çeyreğin toplamı (akış) + son çeyrek snapshot (bilanço). */
export function bankTTM(quarters: BankQuarter[]): BankFields | null {
  const last4 = quarters.slice(-4);
  if (last4.length < 4) return null;
  const ttm = emptyFields();
  for (const key of Object.keys(ttm) as BankFieldKey[]) {
    if (SNAPSHOT.has(key)) { ttm[key] = last4[last4.length - 1]!.fields[key]; continue; }
    let sum = 0, ok = true;
    for (const q of last4) {
      const v = q.fields[key];
      if (v == null) { ok = false; break; }
      sum += v;
    }
    ttm[key] = ok ? sum : null;
  }
  return ttm;
}
