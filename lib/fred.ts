/**
 * FRED (Federal Reserve Economic Data) API client.
 * Makro ekonomik göstergeleri çeker ve cache'ler.
 *
 * API Docs: https://fred.stlouisfed.org/docs/api/fred/
 * Ücretsiz API key: https://fred.stlouisfed.org/docs/api/api_key.html
 */

import type { FredObservation, MacroSnapshot, FredSeriesId } from '@/types/macro';
import { FRED_SERIES } from '@/types/macro';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

// --- In-memory cache ---
interface CacheEntry<T> {
  data: T;
  expiry: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

function getFredApiKey(): string | null {
  return process.env.FRED_API_KEY ?? null;
}

/**
 * Tek bir FRED serisinden son N gözlemi çeker.
 */
export async function fetchFredSeries(
  seriesId: string,
  limit: number = 1
): Promise<FredObservation[]> {
  const apiKey = getFredApiKey();
  if (!apiKey) return [];

  const cacheKey = `fred:${seriesId}:${limit}`;
  const cached = getCached<FredObservation[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = new URL(FRED_BASE);
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`[fred] ${seriesId} fetch failed: ${res.status}`);
      return [];
    }

    const json = await res.json();
    const observations: FredObservation[] = (json.observations ?? [])
      .filter((o: { value: string }) => o.value !== '.')
      .map((o: { date: string; value: string }) => ({
        date: o.date,
        value: parseFloat(o.value),
        seriesId,
      }));

    setCache(cacheKey, observations);
    return observations;
  } catch (err) {
    console.error(`[fred] ${seriesId} error:`, err);
    return [];
  }
}

/**
 * Tüm makro göstergeleri tek bir snapshot olarak döndürür.
 * Her seri için son gözlemi alır.
 */
export async function fetchAllMacroIndicators(): Promise<MacroSnapshot> {
  const cacheKey = 'fred:snapshot';
  const cached = getCached<MacroSnapshot>(cacheKey);
  if (cached) return cached;

  const seriesIds = Object.keys(FRED_SERIES) as FredSeriesId[];

  const results = await Promise.allSettled(
    seriesIds.map((id) => fetchFredSeries(FRED_SERIES[id].id, 1))
  );

  const getValue = (index: number): number | null => {
    const result = results[index];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      return result.value[0].value;
    }
    return null;
  };

  const snapshot: MacroSnapshot = {
    timestamp: new Date().toISOString(),
    fed_rate: getValue(seriesIds.indexOf('FEDFUNDS')),
    cpi_yoy: getValue(seriesIds.indexOf('CPIAUCSL')),
    gdp_growth: getValue(seriesIds.indexOf('GDP')),
    unemployment: getValue(seriesIds.indexOf('UNRATE')),
    yield_curve_10y2y: getValue(seriesIds.indexOf('T10Y2Y')),
    dollar_index: getValue(seriesIds.indexOf('DTWEXBGS')),
    vix: null,         // Yahoo'dan gelecek
    us_10y_yield: null, // Yahoo'dan gelecek
  };

  setCache(cacheKey, snapshot);
  return snapshot;
}

/**
 * Belirli bir serinin son N günlük geçmişini döndürür.
 */
export async function fetchFredHistory(
  seriesId: string,
  days: number = 30
): Promise<FredObservation[]> {
  return fetchFredSeries(seriesId, days);
}
