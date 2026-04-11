/**
 * Yahoo Finance Temel Analiz Veri Çekici
 *
 * yahoo-finance2 (v3) ile BIST hisselerine ait temel verileri çeker.
 * API key gerektirmez.
 * Cache: 24 saat in-memory
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require('yahoo-finance2').default;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance: any = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

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

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
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
  // Finansal veri (financialData modülü)
  currentRatio: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  // Sahiplik yapısı (defaultKeyStatistics modülü)
  institutionsPercentHeld: number | null;  // 0-1 arası (örn: 0.45 = %45)
  insidersPercentHeld: number | null;      // 0-1 arası
  shortRatio: number | null;               // açığa satış oranı (float üzerinden)
  reportedDate: string;
  source: 'yahoo';
}

// ── Yardımcı ──────────────────────────────────────────────────────────────

function n(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isFinite(num) ? num : null;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yahooFinance.quoteSummary(ticker, {
    modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'price'],
  });

  const sd  = result.summaryDetail        ?? {};
  const ks  = result.defaultKeyStatistics ?? {};
  const fd  = result.financialData        ?? {};
  const pr  = result.price                ?? {};

  const fundamentals: YahooFundamentals = {
    symbol:    ticker,
    shortName: String(pr.shortName ?? pr.longName ?? symbol),
    sector:    String(pr.sector ?? ''),
    industry:  String(pr.industry ?? ''),
    marketCap:    n(pr.marketCap),
    peRatio:      n(sd.trailingPE),
    eps:          n(ks.trailingEps),
    bookValue:    n(ks.bookValue),
    priceToBook:  n(ks.priceToBook),
    profitMargin: n(ks.profitMargins),
    dividendYield:    n(sd.dividendYield),
    week52High:       n(sd.fiftyTwoWeekHigh),
    week52Low:        n(sd.fiftyTwoWeekLow),
    movingAverage50:  n(sd.fiftyDayAverage),
    movingAverage200: n(sd.twoHundredDayAverage),
    currentRatio: n(fd.currentRatio),
    totalDebt:    n(fd.totalDebt),
    totalCash:    n(fd.totalCash),
    institutionsPercentHeld: n(ks.heldPercentInstitutions),
    insidersPercentHeld:     n(ks.heldPercentInsiders),
    shortRatio:              n(ks.shortRatio),
    reportedDate: '',
    source: 'yahoo',
  };

  setCached(cacheKey, fundamentals);
  return fundamentals;
}
