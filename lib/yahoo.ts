/**
 * Yahoo Finance veri çekme (query1.finance.yahoo.com v8 chart API).
 * BIST sembolleri otomatik olarak .IS soneki ile kullanılır.
 */

import type { OHLCVCandle } from '@/types';

const BIST_SUFFIX = '.IS';

// --- In-memory OHLCV cache (5 dakika TTL) ---
const CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry {
  data: OHLCVCandle[];
  expiry: number;
}
const ohlcvCache = new Map<string, CacheEntry>();

function getCached(key: string): OHLCVCandle[] | null {
  const entry = ohlcvCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    ohlcvCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: OHLCVCandle[]): void {
  // Bellek sızıntısını önle — max 500 entry
  if (ohlcvCache.size > 500) {
    const firstKey = ohlcvCache.keys().next().value;
    if (firstKey) ohlcvCache.delete(firstKey);
  }
  ohlcvCache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

function toYahooSymbol(sembol: string): string {
  const trimmed = sembol.trim().toUpperCase();
  // Index sembolleri (^XU100 gibi) .IS almaz
  if (trimmed.startsWith('^')) return trimmed;
  return trimmed.endsWith(BIST_SUFFIX) ? trimmed : `${trimmed}${BIST_SUFFIX}`;
}

/**
 * Ham sembolü normalize eder: .IS suffix'ini kaldırır, büyük harfe çevirir.
 * Örn: "thyao.IS" → "THYAO", "THYAO" → "THYAO", "^XU100" → "^XU100"
 */
export function normalizeSymbol(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.startsWith('^')) return trimmed;
  return trimmed.replace(/\.IS$/i, '');
}

export type YahooTimeframe = '15m' | '30m' | '1h' | '1d' | '1wk' | '1mo';

/** Intraday interval mi (saniye-bazlı timestamp gerektirir)? */
function isIntraday(interval: string): boolean {
  return ['1m','2m','5m','15m','30m','60m','90m'].includes(interval);
}

function getTimeframeParams(timeframe: YahooTimeframe): { range: string; interval: string } {
  switch (timeframe) {
    case '15m':
      return { range: '5d', interval: '15m' };
    case '30m':
      return { range: '5d', interval: '30m' };
    case '1h':
      return { range: '60d', interval: '60m' };
    case '1d':
      return { range: '5y', interval: '1d' };
    case '1wk':
      return { range: 'max', interval: '1wk' };
    case '1mo':
    default:
      return { range: 'max', interval: '1mo' };
  }
}

/**
 * Belirtilen hisse için OHLCV verilerini getirir.
 * @param sembol Örn: "THYAO" veya "THYAO.IS"
 * @param days Kaç günlük veri (varsayılan 90)
 */
export async function fetchOHLCV(
  sembol: string,
  days: number = 90
): Promise<OHLCVCandle[]> {
  const yahooSymbol = toYahooSymbol(sembol);
  const range = days <= 5 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : '1y';

  const cacheKey = `ohlcv:${yahooSymbol}:${range}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=1d`;

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BistAI/1.0)' },
      next: { revalidate: 300 },
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    console.error(`[Yahoo] fetchOHLCV ağ hatası / timeout (${sembol})`);
    return [];
  }

  if (!res.ok) {
    console.error(`[Yahoo] fetchOHLCV HTTP ${res.status} (${sembol})`);
    return [];
  }

  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }>;
        };
      }>;
      error?: { code?: string; description?: string };
    };
  };

  const err = json.chart?.error;
  if (err?.description) {
    console.error(`[Yahoo] fetchOHLCV API hatası (${sembol}): ${err.description}`);
    return [];
  }

  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps?.length || !quote) {
    return [];
  }

  const candles: OHLCVCandle[] = [];
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];

  for (let i = 0; i < timestamps.length; i++) {
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    if (open == null || high == null || low == null || close == null) continue;
    const date = new Date((timestamps[i] ?? 0) * 1000).toISOString().slice(0, 10);
    candles.push({
      date,
      open,
      high,
      low,
      close,
      volume: volumes[i] ?? 0,
    });
  }

  if (candles.length > 0) setCache(cacheKey, candles);
  return candles;
}

/**
 * Zaman aralığı (timeframe) bazlı OHLCV verisi.
 */
export async function fetchOHLCVByTimeframe(
  sembol: string,
  timeframe: YahooTimeframe
): Promise<OHLCVCandle[]> {
  const yahooSymbol = toYahooSymbol(sembol);
  const { range, interval } = getTimeframeParams(timeframe);

  const cacheKey = `tf:${yahooSymbol}:${range}:${interval}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?range=${range}&interval=${interval}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BistAI/1.0)' },
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    console.error(`[Yahoo] fetchOHLCVByTimeframe ağ hatası (${sembol})`);
    return [];
  }

  if (!res.ok) {
    console.error(`[Yahoo] fetchOHLCVByTimeframe HTTP ${res.status} (${sembol})`);
    return [];
  }

  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }>;
        };
      }>;
      error?: { code?: string; description?: string };
    };
  };

  const err = json.chart?.error;
  if (err?.description) {
    console.error(`[Yahoo] fetchOHLCVByTimeframe API hatası (${sembol}): ${err.description}`);
    return [];
  }

  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps?.length || !quote) {
    return [];
  }

  const candles: OHLCVCandle[] = [];
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];
  const intraday = isIntraday(interval);

  for (let i = 0; i < timestamps.length; i++) {
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    if (open == null || high == null || low == null || close == null) continue;
    const ts = timestamps[i] ?? 0;
    // Intraday: Unix timestamp (saniye) — lightweight-charts UTCTimestamp
    // Daily+: YYYY-MM-DD string — lightweight-charts BusinessDay
    const date: string | number = intraday
      ? ts
      : new Date(ts * 1000).toISOString().slice(0, 10);
    candles.push({ date, open, high, low, close, volume: volumes[i] ?? 0 });
  }

  if (candles.length > 0) setCache(cacheKey, candles);
  return candles;
}

/**
 * Tek bir hisse için güncel fiyat bilgisi (quote).
 */
export async function fetchQuote(sembol: string): Promise<{
  regularMarketPrice?: number;
  regularMarketVolume?: number;
  shortName?: string;
} | null> {
  const yahooSymbol = toYahooSymbol(sembol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BistAI/1.0)' },
      next: { revalidate: 60 },
    });
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; chartPreviousClose?: number; shortName?: string };
          indicators?: { quote?: Array<{ volume?: (number | null)[] }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    const quote = result?.indicators?.quote?.[0];
    const lastVol = quote?.volume?.filter((v) => v != null).pop();
    if (!meta) return null;
    return {
      regularMarketPrice: meta.regularMarketPrice,
      regularMarketVolume: lastVol ?? undefined,
      shortName: meta.shortName,
    };
  } catch {
    return null;
  }
}

/**
 * Birden fazla hisse için OHLCV verilerini paralel getirir.
 */
export async function fetchOHLCVMultiple(
  semboller: string[],
  days: number = 90
): Promise<Record<string, OHLCVCandle[]>> {
  const results = await Promise.allSettled(
    semboller.map(async (s) => {
      const data = await fetchOHLCV(s, days);
      const normalized = s.replace(BIST_SUFFIX, '').replace(/\.IS$/i, '') || s;
      return { sembol: normalized, data };
    })
  );

  const out: Record<string, OHLCVCandle[]> = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      out[r.value.sembol] = r.value.data;
    }
  }
  return out;
}
