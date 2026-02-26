/**
 * Yahoo Finance veri çekme (query1.finance.yahoo.com v8 chart API).
 * BIST sembolleri otomatik olarak .IS soneki ile kullanılır.
 */

import type { OHLCVCandle } from '@/types';

const BIST_SUFFIX = '.IS';

function toYahooSymbol(sembol: string): string {
  const trimmed = sembol.trim().toUpperCase();
  return trimmed.endsWith(BIST_SUFFIX) ? trimmed : `${trimmed}${BIST_SUFFIX}`;
}

export type YahooTimeframe = '1H' | '1G' | '1W' | '1A' | '3A' | '1Y';

function getTimeframeParams(timeframe: YahooTimeframe): { range: string; interval: string } {
  switch (timeframe) {
    case '1H': // 1 saatlik görünüm
      return { range: '1d', interval: '5m' };
    case '1G': // 1 gün
      return { range: '5d', interval: '30m' };
    case '1W': // 1 hafta
      return { range: '5d', interval: '1d' };
    case '1A': // 1 ay
      return { range: '1mo', interval: '1d' };
    case '3A': // 3 ay
      return { range: '3mo', interval: '1d' };
    case '1Y': // 1 yıl
    default:
      return { range: '1y', interval: '1d' };
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
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=1d`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BistAI/1.0)' },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance veri alınamadı (${sembol}): HTTP ${res.status}`);
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
    throw new Error(`Yahoo Finance (${sembol}): ${err.description}`);
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
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?range=${range}&interval=${interval}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BistAI/1.0)' },
    next: { revalidate: 120 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance veri alınamadı (${sembol}): HTTP ${res.status}`);
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
    throw new Error(`Yahoo Finance (${sembol}): ${err.description}`);
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
