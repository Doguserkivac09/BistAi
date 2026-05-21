/**
 * Yahoo Finance — US Borsası veri çekme.
 * lib/yahoo.ts'den farkı: .IS suffix EKLENMİYOR.
 * Aynı API endpoint'i, aynı response formatı.
 */

import type { OHLCVCandle } from '@/types';
import type { OHLCVFetchResult } from '@/lib/yahoo';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 dakika
const cache = new Map<string, { data: OHLCVFetchResult; expiry: number }>();

function getCached(key: string): OHLCVFetchResult | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiry) { cache.delete(key); return null; }
  return entry.data;
}
function setCached(key: string, data: OHLCVFetchResult): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

/**
 * US sembolü için OHLCV verisi çek.
 * @param sembol Örn: "AAPL", "NVDA", "RGTI"
 * @param range  Gün sayısı (1-365)
 */
export async function fetchOHLCVUS(
  sembol: string,
  range: number = 90,
): Promise<OHLCVFetchResult & { candles: OHLCVCandle[] }> {
  const symbol    = sembol.trim().toUpperCase();
  const cacheKey  = `us-ohlcv:${symbol}:${range}`;
  const cached    = getCached(cacheKey);
  if (cached)     return { ...cached, candles: cached.candles ?? [] };

  const rangeStr = range <= 5 ? '5d' : range <= 30 ? '1mo' : range <= 90 ? '3mo' : range <= 180 ? '6mo' : '1y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${rangeStr}&interval=1d`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept':     'application/json',
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    console.error(`[yahoo-us] fetch timeout/ağ hatası (${symbol}):`, err);
    return { candles: [] };
  }

  if (!res.ok) {
    console.error(`[yahoo-us] HTTP ${res.status} (${symbol})`);
    return { candles: [] };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { candles: [] };
  }

  const chart = (json as Record<string, unknown>)?.chart as Record<string, unknown> | undefined;
  const result = (chart?.result as unknown[]) ?? [];
  if (!result.length) return { candles: [] };

  const r        = result[0] as Record<string, unknown>;
  const meta     = r.meta as Record<string, unknown> | undefined;
  const tsArr    = r.timestamp as number[] | undefined;
  const quotes   = (r.indicators as Record<string, unknown>)?.quote as Record<string, unknown>[] | undefined;
  const q        = quotes?.[0];

  if (!tsArr?.length || !q) return { candles: [] };

  const opens   = q.open   as (number | null)[];
  const highs   = q.high   as (number | null)[];
  const lows    = q.low    as (number | null)[];
  const closes  = q.close  as (number | null)[];
  const volumes = q.volume as (number | null)[];

  const candles: OHLCVCandle[] = [];
  for (let i = 0; i < tsArr.length; i++) {
    const close = closes[i];
    if (!close) continue;
    const date = new Date(tsArr[i]! * 1000).toISOString().slice(0, 10);
    candles.push({
      date,
      open:   opens[i]   ?? close,
      high:   highs[i]   ?? close,
      low:    lows[i]    ?? close,
      close,
      volume: volumes[i] ?? 0,
    });
  }

  const data: OHLCVFetchResult = {
    candles,
    changePercent: typeof meta?.regularMarketChangePercent === 'number' ? meta.regularMarketChangePercent : undefined,
    currentPrice:  typeof meta?.regularMarketPrice         === 'number' ? meta.regularMarketPrice         : undefined,
    shortName:     typeof meta?.shortName                  === 'string' ? meta.shortName                  : undefined,
  };

  setCached(cacheKey, data);
  return { ...data, candles };
}

/**
 * US sembolü için güncel quote (fiyat + değişim)
 */
export async function fetchQuoteUS(sembol: string): Promise<{
  regularMarketPrice: number | null;
  regularMarketChangePercent: number | null;
} | null> {
  try {
    const { candles, changePercent, currentPrice } = await fetchOHLCVUS(sembol, 5);
    if (!currentPrice && !candles.length) return null;
    return {
      regularMarketPrice:         currentPrice ?? candles.at(-1)?.close ?? null,
      regularMarketChangePercent: changePercent ?? null,
    };
  } catch {
    return null;
  }
}
