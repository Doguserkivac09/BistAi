/**
 * Yahoo Finance Temel Analiz Veri Çekici
 *
 * yahoo-finance2 paketi üzerinden BIST hisselerine ait
 * P/E, EPS, piyasa değeri, bilanço gibi verileri çeker.
 *
 * AlphaVantage'ın BIST'i desteklememesi nedeniyle birincil kaynak olarak kullanılır.
 * Cache: 24 saat in-memory
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require('yahoo-finance2').default;
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Tipler ────────────────────────────────────────────────────────────────

export interface YahooFundamentals {
  symbol: string;
  shortName: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  profitMargin: number | null;
  dividendYield: number | null;
  week52High: number | null;
  week52Low: number | null;
  movingAverage50: number | null;
  movingAverage200: number | null;
  // Bilanço
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  totalAssets: number | null;
  totalStockholdersEquity: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;
  reportedDate: string;
  source: 'yahoo';
}

// ── Yardımcı ──────────────────────────────────────────────────────────────

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isFinite(n) ? n : null;
}

function toBistTicker(symbol: string): string {
  const clean = symbol.replace(/\.IS$/i, '').toUpperCase();
  return `${clean}.IS`;
}

// ── Ana Fonksiyon ──────────────────────────────────────────────────────────

export async function fetchYahooFundamentals(symbol: string): Promise<YahooFundamentals> {
  const ticker = toBistTicker(symbol);
  const cacheKey = `yf:fundamentals:${ticker}`;

  const cached = getCached<YahooFundamentals>(cacheKey);
  if (cached) return cached;

  const result = await yahooFinance.quoteSummary(ticker, {
    modules: [
      'summaryDetail',
      'defaultKeyStatistics',
      'financialData',
      'price',
      'balanceSheetHistoryQuarterly',
    ],
    // yahoo-finance2 hata fırlatmasın diye validation kapalı
    fetchType: 'ajax',
  }) as Record<string, unknown>;

  const sd  = (result.summaryDetail         as Record<string, unknown>) ?? {};
  const ks  = (result.defaultKeyStatistics  as Record<string, unknown>) ?? {};
  const fd  = (result.financialData         as Record<string, unknown>) ?? {};
  const pr  = (result.price                 as Record<string, unknown>) ?? {};

  // Bilanço — en son çeyrek
  let totalCurrentAssets: number | null      = null;
  let totalCurrentLiabilities: number | null = null;
  let totalAssets: number | null             = null;
  let totalStockholdersEquity: number | null = null;
  let shortTermDebt: number | null           = null;
  let longTermDebt: number | null            = null;
  let reportedDate                           = '';

  const bsHistory = result.balanceSheetHistoryQuarterly as {
    balanceSheetStatements?: Array<Record<string, unknown>>;
  } | null;
  const statements = bsHistory?.balanceSheetStatements;
  if (statements && statements.length > 0) {
    const q = statements[0]!;
    totalCurrentAssets      = safeNum(q.totalCurrentAssets);
    totalCurrentLiabilities = safeNum(q.totalCurrentLiabilities);
    totalAssets             = safeNum(q.totalAssets);
    totalStockholdersEquity = safeNum(q.totalStockholderEquity);
    shortTermDebt           = safeNum(q.shortTermDebt);
    longTermDebt            = safeNum(q.longTermDebt);
    const endDate = q.endDate as { raw?: number } | string | null;
    if (endDate) {
      const ts = typeof endDate === 'object' ? endDate.raw : undefined;
      reportedDate = ts
        ? new Date(ts * 1000).toISOString().slice(0, 10)
        : String(endDate).slice(0, 10);
    }
  }

  const fundamentals: YahooFundamentals = {
    symbol:      ticker,
    shortName:   String(pr.shortName ?? pr.longName ?? symbol),
    sector:      String((pr as Record<string, unknown>).sector ?? (ks as Record<string, unknown>).sector ?? ''),
    industry:    String((pr as Record<string, unknown>).industry ?? ''),
    marketCap:   safeNum((pr as Record<string, unknown>).marketCap ?? sd.marketCap),
    peRatio:     safeNum(sd.trailingPE ?? ks.trailingPE),
    eps:         safeNum(ks.trailingEps),
    bookValue:   safeNum(ks.bookValue),
    priceToBook: safeNum(ks.priceToBook),
    profitMargin:  safeNum(fd.profitMargins ?? ks.profitMargins),
    dividendYield: safeNum(sd.dividendYield ?? sd.trailingAnnualDividendYield),
    week52High:  safeNum(sd.fiftyTwoWeekHigh),
    week52Low:   safeNum(sd.fiftyTwoWeekLow),
    movingAverage50:  safeNum(sd.fiftyDayAverage),
    movingAverage200: safeNum(sd.twoHundredDayAverage),
    totalCurrentAssets,
    totalCurrentLiabilities,
    totalAssets,
    totalStockholdersEquity,
    shortTermDebt,
    longTermDebt,
    reportedDate,
    source: 'yahoo',
  };

  setCached(cacheKey, fundamentals);
  return fundamentals;
}
