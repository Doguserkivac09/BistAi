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
  quoteSummary(
    ticker: string,
    options: { modules: string[]; validateResult?: boolean },
  ): Promise<Record<string, Record<string, unknown> | undefined>>;
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

// ── US + BIST: Fundamentals Tipi (future-scores için) ────────────────────
//
// computeFutureScore() bu tipi tüketir. revenueGrowth PERCENT cinsindendir
// (15 = %15) — hem US hem BIST yolu Yahoo'nun 0-1 oranını ×100 ile dönüştürür.

export type Fundamentals = {
  revenueGrowth: number | null;        // percent (15 = %15)
  avgTargetPrice: number | null;
  currentPrice: number | null;
  targetUpside: number | null;         // percent
  recommendation: string | null;       // 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell'
  recommendationMean: number | null;   // 1=strongBuy ... 5=strongSell (analist konsensüsü)
  cash: number | null;                 // milyon
  debt: number | null;                 // milyon
  runway: number | null;               // yıl
  institutionalPct: number | null;     // percent
  insiderBuySellRatio: number | null;  // -1 (tüm satış) .. +1 (tüm alış)
  marketCapMillions: number | null;
  peRatio: number | null;
  epsDiluted: number | null;           // trailing EPS (son 12 ay)
  epsForward: number | null;           // forward EPS (yıllık analist tahmini)
  pegRatio: number | null;             // Yahoo native PEG (kazanç bazlı)
  returnOnEquity: number | null;       // ratio (0.18 = %18)
  freeCashFlow: number | null;         // milyon
  revenuePerShare: number | null;
} & Record<string, unknown>

function emptyFundamentals(): Fundamentals {
  return {
    revenueGrowth: null,
    avgTargetPrice: null,
    currentPrice: null,
    targetUpside: null,
    recommendation: null,
    recommendationMean: null,
    cash: null,
    debt: null,
    runway: null,
    institutionalPct: null,
    insiderBuySellRatio: null,
    marketCapMillions: null,
    peRatio: null,
    epsDiluted: null,
    epsForward: null,
    pegRatio: null,
    returnOnEquity: null,
    freeCashFlow: null,
    revenuePerShare: null,
  };
}

/**
 * yahoo-finance2 quoteSummary üzerinden temel veri çeker.
 * Ham v10 fetch yerine kütüphaneyi kullanır → crumb/cookie 401 sorunu yok,
 * değerler {raw,fmt} değil düz sayı olarak parse edilir.
 * `bist:true` ise sembole `.IS` eklenir.
 */
async function fetchFundamentalsViaYf(
  symbol: string,
  opts: { bist?: boolean } = {},
): Promise<Fundamentals> {
  const result = emptyFundamentals();
  const ticker = opts.bist ? toBistTicker(symbol) : symbol.trim().toUpperCase();

  try {
    const qs = await yahooFinance.quoteSummary(ticker, {
      modules: [
        'financialData',
        'defaultKeyStatistics',
        'summaryDetail',
        'insiderTransactions',
        'majorHoldersBreakdown',
        'price',
      ],
      validateResult: false,
    });

    const fd = qs.financialData         ?? {};
    const ks = qs.defaultKeyStatistics  ?? {};
    const sd = qs.summaryDetail         ?? {};
    const mh = qs.majorHoldersBreakdown ?? {};
    const it = qs.insiderTransactions   ?? {};
    const pr = qs.price                 ?? {};

    // Fiyat + analist
    result.currentPrice = n(fd.currentPrice) ?? n(pr.regularMarketPrice);
    const rg = n(fd.revenueGrowth);
    result.revenueGrowth = rg !== null ? rg * 100 : null;          // ratio → percent
    result.recommendation = fd.recommendationKey != null ? String(fd.recommendationKey) : null;
    result.recommendationMean = n(fd.recommendationMean);
    result.avgTargetPrice = n(fd.targetMeanPrice);
    if (
      result.avgTargetPrice !== null &&
      result.currentPrice !== null &&
      result.currentPrice > 0
    ) {
      result.targetUpside =
        ((result.avgTargetPrice - result.currentPrice) / result.currentPrice) * 100;
    }

    // Bilanço
    const cash = n(fd.totalCash);
    const debt = n(fd.totalDebt);
    result.cash = cash !== null ? cash / 1e6 : null;
    result.debt = debt !== null ? debt / 1e6 : null;
    result.returnOnEquity = n(fd.returnOnEquity);
    const fcf = n(fd.freeCashflow);
    result.freeCashFlow = fcf !== null ? fcf / 1e6 : null;
    result.revenuePerShare = n(fd.revenuePerShare);

    // Değerleme + kazanç
    const mc = n(pr.marketCap) ?? n(ks.marketCap);
    result.marketCapMillions = mc !== null ? mc / 1e6 : null;
    result.epsDiluted = n(ks.trailingEps) ?? n(ks.epsTrailingTwelveMonths);
    result.epsForward = n(ks.forwardEps);
    result.pegRatio = n(ks.pegRatio) ?? n(ks.trailingPegRatio);
    result.peRatio = n(sd.trailingPE) ?? n(ks.trailingPE);
    if (
      result.peRatio === null &&
      result.currentPrice !== null &&
      result.epsDiluted !== null &&
      result.epsDiluted > 0
    ) {
      result.peRatio = result.currentPrice / result.epsDiluted;
    }

    // Sahiplik
    const inst = n(mh.institutionsPercentHeld) ?? n(ks.heldPercentInstitutions);
    result.institutionalPct = inst !== null ? inst * 100 : null;

    // Insider işlemleri (son 180 gün — veri seyrek geldiği için pencere geniş)
    const txs = (it as Record<string, unknown>).transactions;
    if (Array.isArray(txs)) {
      let buy = 0;
      let sell = 0;
      const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
      for (const raw of txs as Array<Record<string, unknown>>) {
        const d = raw.startDate;
        const t =
          d instanceof Date ? d.getTime() : typeof d === 'number' ? d * 1000 : null;
        if (t === null || t < cutoff) continue;
        const text = String(raw.transactionText ?? '').toLowerCase();
        if (text.includes('purchase') || text.includes('buy')) buy++;
        else if (text.includes('sale') || text.includes('sell')) sell++;
      }
      if (buy + sell > 0) result.insiderBuySellRatio = (buy - sell) / (buy + sell);
    }

    // Runway (kaba tahmin: pazar değerinin %2.5'i çeyreklik nakit yakımı varsayımı)
    if (result.cash && result.marketCapMillions) {
      const quarterlyBurn = (result.marketCapMillions * 0.025) / 1e6;
      if (quarterlyBurn > 0) result.runway = result.cash / quarterlyBurn / 4;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[yahoo-fundamentals] ${ticker} çekilemedi: ${msg}`);
  }

  return result;
}

/** US hissesi için temel veri (future-scores cron). */
export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  return fetchFundamentalsViaYf(symbol, { bist: false });
}

/** BIST hissesi için temel veri — `.IS` suffix ile (future-scores-bist cron). */
export async function fetchFundamentalsBist(symbol: string): Promise<Fundamentals> {
  return fetchFundamentalsViaYf(symbol, { bist: true });
}

async function fetchBatchGeneric(
  symbols: string[],
  fetcher: (s: string) => Promise<Fundamentals>,
  batchSize: number,
  delayMs: number,
): Promise<Map<string, Fundamentals>> {
  const results = new Map<string, Fundamentals>();
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (sym) => {
        results.set(sym, await fetcher(sym));
      }),
    );
    if (i + batchSize < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return results;
}

export async function fetchFundamentalsBatch(
  symbols: string[],
  batchSize = 6,
  delayMs = 600,
): Promise<Map<string, Fundamentals>> {
  return fetchBatchGeneric(symbols, fetchFundamentals, batchSize, delayMs);
}

export async function fetchFundamentalsBistBatch(
  symbols: string[],
  batchSize = 6,
  delayMs = 700,
): Promise<Map<string, Fundamentals>> {
  return fetchBatchGeneric(symbols, fetchFundamentalsBist, batchSize, delayMs);
}
