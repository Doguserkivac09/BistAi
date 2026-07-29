/**
 * İş Yatırım çeyreklik mali tablo katmanı (Bilanço Öngörü motoru B0-1 GO sonrası).
 *
 * KAP bloklu olduğu için Türk finans kütüphanelerinin standart çözümü olan İş Yatırım
 * MaliTablo endpoint'i kullanılır — standardize itemCode'lu çeyreklik tablolar.
 * Spike kapsamı: likit BIST evreninde ~%90 (mikro-cap/özel finansallar hariç).
 *
 * ⚠️ KÜMÜLATİF NÜANS: gelir tablosu (3x) ve nakit akış (4x) kalemleri YTD kümülatiftir
 * (period=3 → Q1, 6 → H1, 9 → 9ay, 12 → yıl). Tek çeyrek için yıl-içi ardışık farkları
 * alınır (`toStandaloneQuarters`). Bilanço (1x/2x) dönem-sonu SNAPSHOT'tır, fark alınmaz.
 *
 * ⚠️ LİSANS: ham tablo REDISTRİBÜTE EDİLMEZ (VIOP ilkesi) — türetilmiş skor/analiz
 * servis edilir, ham İş Yatırım tablosu UI'da yayınlanmaz / API'de dışa verilmez.
 */

// ── Endpoint ───────────────────────────────────────────────────────────
const BASE = 'https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/MaliTablo';

/** Sanayi/UFRS (XI_29) itemCode → alan. Banka (UFRS_K) ayrı format — bkz. isBank. */
const CODES = {
  // Gelir tablosu (kümülatif YTD)
  revenue:          '3C',
  cogs:             '3CA',
  grossProfit:      '3CAB',
  operatingProfit:  '3HACA',  // Finansman gideri öncesi faaliyet karı = EBIT
  financialIncome:  '3HB',
  financialExpense: '3HC',
  tax:              '3IA',
  netIncome:        '3L',
  amortization:     '4CAB',   // Amortisman & itfa (nakit akıştan)
  domesticSales:    '4BC',
  exportSales:      '4BD',
  // Nakit akış (kümülatif)
  operatingCashFlow:'4C',
  freeCashFlow:     '4CB',
  investingCashFlow:'4CAK',
  // Bilanço (snapshot)
  totalAssets:      '1BL',
  cash:             '1AA',
  shortFinInvest:   '1AB',
  tradeReceivables: '1AC',
  inventory:        '1AF',
  currentLiabilities:'2A',
  shortFinDebt:     '2AA',
  longFinDebt:      '2BA',
  tradePayablesShort:'2AAGAA',
  tradePayablesLong:'2BBA',
  equity:           '2N',
} as const;

type FieldKey = keyof typeof CODES;
/** Snapshot (fark alınmayan) bilanço alanları */
const SNAPSHOT_FIELDS: Set<FieldKey> = new Set([
  'totalAssets', 'cash', 'shortFinInvest', 'tradeReceivables', 'inventory',
  'currentLiabilities', 'shortFinDebt', 'longFinDebt', 'tradePayablesShort', 'tradePayablesLong', 'equity',
]);

export interface IsyPeriodRef { year: number; period: 3 | 6 | 9 | 12; }

/** Ham dönem (kümülatif gelir + snapshot bilanço, raporlandığı gibi) */
export interface IsyPeriodData extends IsyPeriodRef {
  fields: Partial<Record<FieldKey, number | null>>;
}

/** Tek çeyrek (gelir standalone farkla, bilanço snapshot) */
export interface IsyQuarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  label: string;              // "2025Q1"
  fields: Partial<Record<FieldKey, number | null>>;
  ebitda: number | null;      // türetilmiş: operatingProfit + amortization
}

// ── Fetch ───────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** İş Yatırım MaliTablo — tek çağrı en fazla 4 dönem (value1..value4). */
async function fetchBatch(code: string, refs: IsyPeriodRef[], group: string): Promise<Map<string, number | null>[]> {
  const p = refs.slice(0, 4);
  const qs = new URLSearchParams({ companyCode: code, exchange: 'TRY', financialGroup: group });
  p.forEach((r, i) => { qs.set(`year${i + 1}`, String(r.year)); qs.set(`period${i + 1}`, String(r.period)); });
  const res = await fetch(`${BASE}?${qs.toString()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Investable Edge/1.0)' },
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json() as { ok?: boolean; value?: Array<Record<string, string>> };
  const rows = json?.value ?? [];
  // Her dönem için itemCode → value{i}
  return p.map((_, i) => {
    const m = new Map<string, number | null>();
    for (const row of rows) m.set(row.itemCode, num(row[`value${i + 1}`]));
    return m;
  });
}

/**
 * Bir sembol için verilen dönemlerin ham verisini çeker (4'erli batch).
 * Banka/finans (XI_29 boş dönerse) → isBank:true, veri UFRS_K'dan ham map olarak döner
 * (banka ayrıştırması ayrı faz — bu katman sanayi/UFRS'yi tam çözer).
 */
export async function fetchIsyFinancials(
  code: string,
  refs: IsyPeriodRef[],
): Promise<{ isBank: boolean; periods: IsyPeriodData[] }> {
  // Önce sanayi (XI_29)
  const batches: Map<string, number | null>[] = [];
  for (let i = 0; i < refs.length; i += 4) {
    const b = await fetchBatch(code, refs.slice(i, i + 4), 'XI_29');
    batches.push(...b);
    if (i > 0) await new Promise((r) => setTimeout(r, 120));
  }
  // XI_29 tamamen boşsa → banka/finans
  const anyData = batches.some((m) => m.size > 0);
  if (!anyData) {
    return { isBank: true, periods: [] };
  }

  const periods: IsyPeriodData[] = refs.map((ref, idx) => {
    const m = batches[idx] ?? new Map();
    const fields: Partial<Record<FieldKey, number | null>> = {};
    for (const key of Object.keys(CODES) as FieldKey[]) fields[key] = m.get(CODES[key]) ?? null;
    return { ...ref, fields };
  });
  return { isBank: false, periods };
}

// ── Kümülatif → standalone çeyrek ────────────────────────────────────────

/**
 * Kümülatif YTD dönemleri tek-çeyrek serisine çevirir.
 * Gelir/nakit kalemleri: yıl-içi ardışık fark (Q1=P3, Q2=P6−P3, Q3=P9−P6, Q4=P12−P9).
 * Bilanço kalemleri: snapshot (fark yok).
 * Girdi herhangi sırada olabilir; içeride (year,period) sıralanır.
 */
export function toStandaloneQuarters(periods: IsyPeriodData[]): IsyQuarter[] {
  const byYear = new Map<number, Map<number, IsyPeriodData>>();
  for (const p of periods) {
    if (!byYear.has(p.year)) byYear.set(p.year, new Map());
    byYear.get(p.year)!.set(p.period, p);
  }
  const out: IsyQuarter[] = [];
  for (const [year, pm] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const order: Array<{ period: 3 | 6 | 9 | 12; q: 1 | 2 | 3 | 4; prev: number | null }> = [
      { period: 3, q: 1, prev: null }, { period: 6, q: 2, prev: 3 },
      { period: 9, q: 3, prev: 6 }, { period: 12, q: 4, prev: 9 },
    ];
    for (const { period, q, prev } of order) {
      const cur = pm.get(period);
      if (!cur) continue;
      const prevP = prev != null ? pm.get(prev) : undefined;
      const fields: Partial<Record<FieldKey, number | null>> = {};
      for (const key of Object.keys(CODES) as FieldKey[]) {
        const cv = cur.fields[key] ?? null;
        if (SNAPSHOT_FIELDS.has(key) || prev == null || !prevP) {
          fields[key] = cv; // snapshot ya da yılın ilk çeyreği → olduğu gibi
        } else {
          const pv = prevP.fields[key] ?? null;
          fields[key] = cv != null && pv != null ? cv - pv : cv;
        }
      }
      const op = fields.operatingProfit, am = fields.amortization;
      out.push({
        year, quarter: q, label: `${year}Q${q}`, fields,
        ebitda: op != null && am != null ? op + am : op ?? null,
      });
    }
  }
  return out;
}

/** Son 4 standalone çeyreğin toplamı (TTM) — akış kalemleri için. */
export function computeTTM(quarters: IsyQuarter[]): Partial<Record<FieldKey, number | null>> | null {
  const last4 = quarters.slice(-4);
  if (last4.length < 4) return null;
  const ttm: Partial<Record<FieldKey, number | null>> = {};
  for (const key of Object.keys(CODES) as FieldKey[]) {
    if (SNAPSHOT_FIELDS.has(key)) { ttm[key] = last4[last4.length - 1]!.fields[key] ?? null; continue; }
    let sum = 0, ok = true;
    for (const q of last4) { const v = q.fields[key]; if (v == null) { ok = false; break; } sum += v; }
    ttm[key] = ok ? sum : null;
  }
  return ttm;
}

/**
 * `now` çeyreğinden geriye N dönem referansı (varsayılan 8). Raporlama gecikmesi için
 * geniş pencere istenebilir (henüz açıklanmamış çeyrekler null döner, çağıran filtreler).
 */
export function recentQuarterRefs(nowYear: number, nowQuarter: 1 | 2 | 3 | 4, count = 8): IsyPeriodRef[] {
  const refs: IsyPeriodRef[] = [];
  const periodOf = (q: number) => (q * 3) as 3 | 6 | 9 | 12;
  let y = nowYear, q = nowQuarter;
  for (let i = 0; i < count; i++) {
    refs.push({ year: y, period: periodOf(q) });
    q -= 1; if (q < 1) { q = 4; y -= 1; }
  }
  return refs;
}
