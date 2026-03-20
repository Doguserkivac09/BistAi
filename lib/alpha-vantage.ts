/**
 * Phase 13.1 — AlphaVantage Entegrasyonu
 *
 * Yahoo Finance'e alternatif/yedek veri kaynağı.
 * Free tier: 25 istek/gün → çok konservatif cache (24 saat)
 *
 * Kullanım alanları:
 * - BIST hisse OHLCV (Yahoo başarısız olunca yedek)
 * - Şirket fundamentals (P/E, EPS, revenue) — Yahoo'da yok
 * - Forex oranları
 *
 * Key: ALPHAVANTAGE_API_KEY → alphavantage.co/support/#api-key (ücretsiz)
 */

import type { OHLCVCandle } from '@/types';

const BASE_URL = 'https://www.alphavantage.co/query';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat (günlük limit koruması)

// ── Cache ─────────────────────────────────────────────────────────────

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

function setCached<T>(key: string, data: T, ttlMs: number = CACHE_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Yardımcı ─────────────────────────────────────────────────────────

function getApiKey(): string | null {
  return process.env.ALPHAVANTAGE_API_KEY ?? null;
}

/** BIST sembolünü AlphaVantage formatına çevirir: SISE → SISE.IS */
function toBistSymbol(symbol: string): string {
  const clean = symbol.replace(/\.IS$/i, '').toUpperCase();
  return `${clean}.IS`;
}

async function avFetch(params: Record<string, string>): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('ALPHAVANTAGE_API_KEY tanımlı değil.');

  const url = new URL(BASE_URL);
  Object.entries({ ...params, apikey: apiKey }).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`AlphaVantage HTTP ${res.status}`);

  const json = await res.json() as Record<string, unknown>;

  // Rate limit kontrolü
  if ('Note' in json || 'Information' in json) {
    throw new Error('AlphaVantage API limiti aşıldı. Yarın tekrar deneyin.');
  }

  return json;
}

// ── OHLCV ─────────────────────────────────────────────────────────────

export interface AVOHLCVResult {
  candles: OHLCVCandle[];
  source: 'alphavantage';
}

/**
 * Günlük OHLCV verisi çeker (yedek kaynak olarak kullanılır).
 * @param symbol BIST sembolü (örn: "SISE", "AKBNK")
 * @param outputSize "compact" = son 100 gün, "full" = 20 yıl
 */
export async function fetchDailyOHLCV(
  symbol: string,
  outputSize: 'compact' | 'full' = 'compact'
): Promise<AVOHLCVResult> {
  const avSymbol = toBistSymbol(symbol);
  const cacheKey = `av:ohlcv:${avSymbol}:${outputSize}`;

  const cached = getCached<AVOHLCVResult>(cacheKey);
  if (cached) return cached;

  const data = await avFetch({
    function: 'TIME_SERIES_DAILY',
    symbol: avSymbol,
    outputsize: outputSize,
    datatype: 'json',
  }) as Record<string, unknown>;

  const timeSeries = data['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
  if (!timeSeries) {
    throw new Error(`AlphaVantage: ${avSymbol} için veri bulunamadı.`);
  }

  const candles: OHLCVCandle[] = Object.entries(timeSeries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      open: parseFloat(values['1. open'] ?? '0'),
      high: parseFloat(values['2. high'] ?? '0'),
      low: parseFloat(values['3. low'] ?? '0'),
      close: parseFloat(values['4. close'] ?? '0'),
      volume: parseInt(values['5. volume'] ?? '0', 10),
    }));

  const result: AVOHLCVResult = { candles, source: 'alphavantage' };
  setCached(cacheKey, result);
  return result;
}

// ── Global Quote ──────────────────────────────────────────────────────

export interface AVQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  latestTradingDay: string;
  source: 'alphavantage';
}

/**
 * Güncel fiyat bilgisi çeker.
 */
export async function fetchQuote(symbol: string): Promise<AVQuote> {
  const avSymbol = toBistSymbol(symbol);
  const cacheKey = `av:quote:${avSymbol}`;

  const cached = getCached<AVQuote>(cacheKey);
  if (cached) return cached;

  const data = await avFetch({
    function: 'GLOBAL_QUOTE',
    symbol: avSymbol,
  }) as Record<string, unknown>;

  const q = data['Global Quote'] as Record<string, string> | undefined;
  if (!q || !q['05. price']) {
    throw new Error(`AlphaVantage: ${avSymbol} için quote bulunamadı.`);
  }

  const result: AVQuote = {
    symbol: q['01. symbol'] ?? avSymbol,
    price: parseFloat(q['05. price']),
    change: parseFloat(q['09. change'] ?? '0'),
    changePercent: parseFloat((q['10. change percent'] ?? '0').replace('%', '')),
    volume: parseInt(q['06. volume'] ?? '0', 10),
    latestTradingDay: q['07. latest trading day'] ?? '',
    source: 'alphavantage',
  };

  setCached(cacheKey, result, 15 * 60 * 1000); // 15 dk cache (quote için)
  return result;
}

// ── Şirket Fundamentals ───────────────────────────────────────────────

export interface AVFundamentals {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  peRatio: number | null;
  eps: number | null;
  revenuePerShareTTM: number | null;
  profitMargin: number | null;
  dividendYield: number | null;
  week52High: number;
  week52Low: number;
  movingAverage50: number | null;
  movingAverage200: number | null;
  source: 'alphavantage';
}

/**
 * Şirket temel verileri çeker (P/E, EPS, sektör vb.)
 * Bu veriler Yahoo Finance'de bulunmaz — AlphaVantage'ın en değerli katkısı.
 */
export async function fetchFundamentals(symbol: string): Promise<AVFundamentals> {
  const avSymbol = toBistSymbol(symbol);
  const cacheKey = `av:fundamentals:${avSymbol}`;

  const cached = getCached<AVFundamentals>(cacheKey);
  if (cached) return cached;

  const data = await avFetch({
    function: 'OVERVIEW',
    symbol: avSymbol,
  }) as Record<string, string>;

  if (!data.Symbol) {
    throw new Error(`AlphaVantage: ${avSymbol} için fundamental veri bulunamadı.`);
  }

  const parseNum = (val: string | undefined): number | null => {
    if (!val || val === 'None' || val === '-') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };

  const result: AVFundamentals = {
    symbol: data.Symbol,
    name: data.Name ?? symbol,
    sector: data.Sector ?? 'Bilinmiyor',
    industry: data.Industry ?? 'Bilinmiyor',
    marketCap: parseNum(data.MarketCapitalization) ?? 0,
    peRatio: parseNum(data.PERatio),
    eps: parseNum(data.EPS),
    revenuePerShareTTM: parseNum(data.RevenuePerShareTTM),
    profitMargin: parseNum(data.ProfitMargin),
    dividendYield: parseNum(data.DividendYield),
    week52High: parseNum(data['52WeekHigh']) ?? 0,
    week52Low: parseNum(data['52WeekLow']) ?? 0,
    movingAverage50: parseNum(data['50DayMovingAverage']),
    movingAverage200: parseNum(data['200DayMovingAverage']),
    source: 'alphavantage',
  };

  setCached(cacheKey, result); // 24 saat (fundamentals yavaş değişir)
  return result;
}

// ── Forex ─────────────────────────────────────────────────────────────

export interface AVForexRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  bidPrice: number;
  askPrice: number;
  fetchedAt: string;
  source: 'alphavantage';
}

/**
 * Döviz kuru çeker (USDTRY vb. yedek kaynak).
 */
export async function fetchForexRate(
  fromCurrency: string,
  toCurrency: string
): Promise<AVForexRate> {
  const cacheKey = `av:forex:${fromCurrency}${toCurrency}`;

  const cached = getCached<AVForexRate>(cacheKey);
  if (cached) return cached;

  const data = await avFetch({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: fromCurrency,
    to_currency: toCurrency,
  }) as Record<string, unknown>;

  const r = data['Realtime Currency Exchange Rate'] as Record<string, string> | undefined;
  if (!r || !r['5. Exchange Rate']) {
    throw new Error(`AlphaVantage: ${fromCurrency}/${toCurrency} kuru bulunamadı.`);
  }

  const result: AVForexRate = {
    fromCurrency,
    toCurrency,
    rate: parseFloat(r['5. Exchange Rate']),
    bidPrice: parseFloat(r['8. Bid Price'] ?? '0'),
    askPrice: parseFloat(r['9. Ask Price'] ?? '0'),
    fetchedAt: new Date().toISOString(),
    source: 'alphavantage',
  };

  setCached(cacheKey, result, 5 * 60 * 1000); // 5 dk cache
  return result;
}
