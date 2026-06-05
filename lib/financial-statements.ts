/**
 * Çok-yıllı finansal tablolar — Yahoo `fundamentalsTimeSeries` (modern API).
 *
 * Eski quoteSummary statement modülleri Kasım 2024'ten beri bilanço döndürmüyor;
 * fundamentalsTimeSeries hem BIST (.IS) hem US için 5 yıllık gelir/bilanço/nakit
 * akış kalemlerini verir. Piotroski F-Score + Altman Z + trend bunun üstüne kurulur.
 *
 * Banka/finansal şirketler grossProfit/currentAssets/EBIT raporlamaz → bunu
 * tespit edip (isFinancialSector) Piotroski/Altman'ı "uygulanmaz" işaretleriz.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require('yahoo-finance2').default;

interface YfTimeSeriesInstance {
  fundamentalsTimeSeries(
    symbol: string,
    opts: { period1: string; period2: string; type: string; module: string },
  ): Promise<Array<Record<string, unknown>>>;
}
const yfTS = new YahooFinanceClass({
  suppressNotices: ['yahooSurvey'],
  validation: { logErrors: false, logOptionsErrors: false },
}) as YfTimeSeriesInstance;

export interface FinancialYear {
  year: number;
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  ebit: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  equity: number | null;
  retainedEarnings: number | null;
  longTermDebt: number | null;
  totalDebt: number | null;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  shares: number | null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'object') {
    const raw = (v as { raw?: unknown }).raw;
    return typeof raw === 'number' && isFinite(raw) ? raw : null;
  }
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const p = parseFloat(String(v));
  return isFinite(p) ? p : null;
}

function pick(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const n = num(o[k]);
    if (n !== null) return n;
  }
  return null;
}

const cache = new Map<string, { data: FinancialYear[]; exp: number }>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 saat (yıllık tablolar nadir değişir)

function toTicker(symbol: string, bist: boolean): string {
  const clean = symbol.replace(/\.IS$/i, '').toUpperCase();
  return bist ? `${clean}.IS` : symbol.trim().toUpperCase();
}

/**
 * Son 5 yıllık finansalları döndürür (eskiden yeniye sıralı).
 */
export async function fetchFinancialStatements(
  symbol: string,
  opts: { bist?: boolean } = {},
): Promise<FinancialYear[]> {
  const ticker = toTicker(symbol, opts.bist ?? false);
  const cacheKey = `fs:${ticker}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.exp) return cached.data;

  try {
    const rows = await yfTS.fundamentalsTimeSeries(ticker, {
      period1: '2019-01-01',
      period2: new Date().toISOString().slice(0, 10),
      type: 'annual',
      module: 'all',
    });

    const years: FinancialYear[] = (rows ?? [])
      .map((r): FinancialYear => {
        const d = r.date instanceof Date ? r.date : r.date ? new Date(r.date as string) : null;
        return {
          year: d ? d.getFullYear() : 0,
          revenue: pick(r, ['totalRevenue', 'operatingRevenue']),
          costOfRevenue: pick(r, ['costOfRevenue', 'reconciledCostOfRevenue']),
          grossProfit: pick(r, ['grossProfit']),
          ebit: pick(r, ['EBIT', 'operatingIncome']),
          netIncome: pick(r, ['netIncome', 'netIncomeCommonStockholders', 'netIncomeFromContinuingOperations']),
          totalAssets: pick(r, ['totalAssets']),
          totalLiabilities: pick(r, ['totalLiabilitiesNetMinorityInterest', 'totalLiabilities']),
          currentAssets: pick(r, ['currentAssets']),
          currentLiabilities: pick(r, ['currentLiabilities']),
          equity: pick(r, ['stockholdersEquity', 'commonStockEquity', 'totalEquityGrossMinorityInterest']),
          retainedEarnings: pick(r, ['retainedEarnings']),
          longTermDebt: pick(r, ['longTermDebt']),
          totalDebt: pick(r, ['totalDebt']),
          operatingCashFlow: pick(r, ['operatingCashFlow', 'cashFlowFromContinuingOperatingActivities']),
          freeCashFlow: pick(r, ['freeCashFlow']),
          shares: pick(r, ['dilutedAverageShares', 'basicAverageShares', 'ordinarySharesNumber']),
        };
      })
      .filter((y) => y.year > 0 && (y.revenue !== null || y.netIncome !== null || y.totalAssets !== null))
      .sort((a, b) => a.year - b.year);

    const last5 = years.slice(-5);
    cache.set(cacheKey, { data: last5, exp: Date.now() + TTL_MS });
    return last5;
  } catch (e) {
    console.error(`[financial-statements] ${ticker}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/**
 * Banka/finansal sektör tespiti. Bankalar grossProfit + currentAssets/Liabilities
 * raporlamaz → Piotroski (brüt marj, cari oran) ve Altman (işletme sermayesi)
 * bunlara uygulanamaz.
 */
export function isFinancialSector(years: FinancialYear[]): boolean {
  if (years.length === 0) return false;
  const latest = years[years.length - 1];
  return latest.currentLiabilities === null && latest.grossProfit === null;
}
