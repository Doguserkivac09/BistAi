/**
 * Yahoo Finance Temel Analiz Veri Çekici
 *
 * İki ayrı fetch stratejisi:
 *  1. fetchYahooFundamentals(symbol) — BIST hisseleri için
 *     yahoo-finance2 (v3) kullanır, .IS suffix ekler, API key gerektirmez.
 *     computeInvestableScore() + uzun-vade-firsatlar route'u bu fonksiyonu kullanır.
 *
 *  2. fetchFundamentals(symbol) + fetchFundamentalsBatch(symbols) — US hisseleri için
 *     Yahoo quoteSummary v10 fetch, future-scores cron kullanır.
 *
 * Cache: 24 saat in-memory (BIST), cron'dan çağrıldığında cache'siz (US batch).
 */

// ── BIST: yahoo-finance2 (v3) ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require('yahoo-finance2').default;

interface YahooFinanceInstance {
  quoteSummary(ticker: string, options: { modules: string[] }): Promise<Record<string, Record<string, unknown>>>;
}
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] }) as YahooFinanceInstance;

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

// ── BIST Tipler ───────────────────────────────────────────────────────────

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
  shortRatio: number | null;               // açığa satış oranı
  // ── Investment Score için ek metrikler ────────────────────────────────
  // Valuation
  pegRatio: number | null;            // ks.pegRatio — büyümeye göre F/K
  enterpriseToEbitda: number | null;  // ks.enterpriseToEbitda — EV/FAVÖK
  // Growth (0-1 arası oranlar — ratio, NOT percent)
  revenueGrowth: number | null;       // fd.revenueGrowth — YoY gelir büyümesi
  earningsGrowth: number | null;      // fd.earningsGrowth — YoY kâr büyümesi
  // Profitability (0-1 arası oranlar — ratio, NOT percent)
  returnOnEquity: number | null;      // fd.returnOnEquity — ROE
  returnOnAssets: number | null;      // fd.returnOnAssets — ROA
  operatingMargins: number | null;    // fd.operatingMargins — Faaliyet marjı
  // Risk
  debtToEquity: number | null;        // fd.debtToEquity — Borç/Özsermaye
  beta: number | null;                // sd.beta — piyasaya göre volatilite
  freeCashflow: number | null;        // fd.freeCashflow — Serbest nakit akışı (TL)
  reportedDate: string;
  source: 'yahoo';
}

// ── Yardımcılar ───────────────────────────────────────────────────────────

function n(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isFinite(num) ? num : null;
}

function toBistTicker(symbol: string): string {
  const clean = symbol.replace(/\.IS$/i, '').toUpperCase();
  return `${clean}.IS`;
}

// ── BIST: Ana Fonksiyon ──────────────────────────────────────────────────

export async function fetchYahooFundamentals(symbol: string): Promise<YahooFundamentals> {
  const ticker   = toBistTicker(symbol);
  const cacheKey = `yf:fundamentals:${ticker}`;

  const cached = getCached<YahooFundamentals>(cacheKey);
  if (cached) return cached;

  const result = await yahooFinance.quoteSummary(ticker, {
    modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'price'],
  });

  const sd = result.summaryDetail        ?? {};
  const ks = result.defaultKeyStatistics ?? {};
  const fd = result.financialData        ?? {};
  const pr = result.price                ?? {};

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
    // Investment Score metrikleri (ratio olarak — 0.15 = %15)
    pegRatio:           n(ks.pegRatio),
    enterpriseToEbitda: n(ks.enterpriseToEbitda),
    revenueGrowth:      n(fd.revenueGrowth),   // ratio (0-1)
    earningsGrowth:     n(fd.earningsGrowth),  // ratio (0-1)
    returnOnEquity:     n(fd.returnOnEquity),  // ratio (0-1)
    returnOnAssets:     n(fd.returnOnAssets),  // ratio (0-1)
    operatingMargins:   n(fd.operatingMargins), // ratio (0-1)
    debtToEquity:       n(fd.debtToEquity),
    beta:               n(sd.beta),
    freeCashflow:       n(fd.freeCashflow),
    reportedDate: '',
    source: 'yahoo',
  };

  setCached(cacheKey, fundamentals);
  return fundamentals;
}

// ── US: Fundamentals Tipi (future-scores için) ───────────────────────────

export type Fundamentals = {
  revenueGrowth: number | null;        // percent (15 = %15) — US API formatı
  avgTargetPrice: number | null;
  currentPrice: number | null;
  targetUpside: number | null;
  recommendation: string | null;
  cash: number | null;
  debt: number | null;
  runway: number | null;
  institutionalPct: number | null;
  insiderBuySellRatio: number | null;
  marketCapMillions: number | null;
  peRatio: number | null;
  epsDiluted: number | null;
} & Record<string, unknown>

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const result: Fundamentals = {
    revenueGrowth: null,
    avgTargetPrice: null,
    currentPrice: null,
    targetUpside: null,
    recommendation: null,
    cash: null,
    debt: null,
    runway: null,
    institutionalPct: null,
    insiderBuySellRatio: null,
    marketCapMillions: null,
    peRatio: null,
    epsDiluted: null,
  }

  try {
    const modules = [
      'financialData',
      'defaultKeyStatistics',
      'earnings',
      'recommendationTrend',
      'insiderTransactions',
      'majorHoldersBreakdown',
    ]
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules.join(',')}`

    const response = await fetch(url).then((r) => r.json()) as {
      quoteSummary?: { result?: Array<Record<string, Record<string, unknown>>> }
    }
    const data = response?.quoteSummary?.result?.[0]
    if (!data) return result

    if (data.financialData?.currentPrice) {
      result.currentPrice = data.financialData.currentPrice as number
    }
    if (data.financialData?.revenueGrowth) {
      result.revenueGrowth = (data.financialData.revenueGrowth as number) * 100
    }
    if (data.recommendationTrend?.recommendation) {
      result.recommendation = data.recommendationTrend.recommendation as string
    }
    if (data.financialData?.targetMeanPrice) {
      result.avgTargetPrice = data.financialData.targetMeanPrice as number
      if (result.currentPrice && result.avgTargetPrice) {
        result.targetUpside = ((result.avgTargetPrice - result.currentPrice) / result.currentPrice) * 100
      }
    }
    if (data.financialData?.totalCash) {
      result.cash = (data.financialData.totalCash as number) / 1e6
    }
    if (data.financialData?.totalDebt) {
      result.debt = (data.financialData.totalDebt as number) / 1e6
    }
    if (data.defaultKeyStatistics?.marketCap) {
      result.marketCapMillions = (data.defaultKeyStatistics.marketCap as number) / 1e6
    }
    if (data.defaultKeyStatistics?.trailingPE) {
      result.peRatio = data.defaultKeyStatistics.trailingPE as number
    }
    if (data.defaultKeyStatistics?.epsTrailingTwelveMonths) {
      result.epsDiluted = data.defaultKeyStatistics.epsTrailingTwelveMonths as number
    }
    if (data.majorHoldersBreakdown?.institutionsPercent) {
      result.institutionalPct = (data.majorHoldersBreakdown.institutionsPercent as number) * 100
    }
    if (data.insiderTransactions?.transactions) {
      let buyCount = 0; let sellCount = 0
      const ninetyDaysAgo = Date.now() / 1000 - 90 * 24 * 60 * 60
      for (const tx of data.insiderTransactions.transactions as Array<Record<string, unknown>>) {
        if ((tx.startDate as number) > ninetyDaysAgo) {
          if ((tx.transactionText as string)?.includes('Buy')) buyCount++
          else if ((tx.transactionText as string)?.includes('Sell')) sellCount++
        }
      }
      if (buyCount + sellCount > 0) {
        result.insiderBuySellRatio = (buyCount - sellCount) / (buyCount + sellCount)
      }
    }
    if (result.cash && result.currentPrice && result.marketCapMillions) {
      const estimatedQuarterlyBurn = (result.marketCapMillions * 0.025) / 1e6
      if (estimatedQuarterlyBurn > 0) {
        result.runway = (result.cash / estimatedQuarterlyBurn) / 4
      }
    }
  } catch (error) {
    console.error(`[yahoo-fundamentals] Error fetching ${symbol}:`, error)
  }

  return result
}

export async function fetchFundamentalsBatch(
  symbols: string[],
  batchSize = 5,
  delayMs = 1000,
): Promise<Map<string, Fundamentals>> {
  const results = new Map<string, Fundamentals>()

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    await Promise.all(batch.map(async (sym) => {
      results.set(sym, await fetchFundamentals(sym))
    }))
    if (i + batchSize < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return results
}
