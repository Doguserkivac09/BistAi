/**
 * FRED (Federal Reserve Economic Data) API Entegrasyonu.
 * ABD makroekonomik verileri: Fed Funds Rate, CPI, GDP, PMI, Unemployment
 *
 * Phase 4.2 — FRED API key gerektirir (ücretsiz: https://fred.stlouisfed.org/docs/api/api_key.html)
 */

// ── Türler ──────────────────────────────────────────────────────────

export interface FredSeriesPoint {
  date: string;   // YYYY-MM-DD
  value: number;
}

export interface FredSeries {
  id: string;
  name: string;
  frequency: string;
  units: string;
  latestValue: number | null;
  latestDate: string | null;
  previousValue: number | null;
  change: number | null;       // son iki gözlem arası fark
  changePct: number | null;    // yüzde değişim
  data: FredSeriesPoint[];
}

export interface FredSnapshot {
  fedFundsRate: FredSeries | null;
  cpiYoY: FredSeries | null;
  gdpGrowth: FredSeries | null;
  unemployment: FredSeries | null;
  pmi: FredSeries | null;
  fetchedAt: string;
}

// ── FRED Series Tanımları ───────────────────────────────────────────

export const FRED_SERIES = {
  FED_FUNDS: {
    id: 'DFF',
    name: 'Fed Funds Efektif Faiz',
    frequency: 'daily',
    units: '%',
  },
  CPI_YOY: {
    id: 'CPIAUCSL',
    name: 'ABD Tüketici Fiyat Endeksi (CPI)',
    frequency: 'monthly',
    units: 'Index',
  },
  GDP_GROWTH: {
    id: 'A191RL1Q225SBEA',
    name: 'ABD Reel GDP Büyüme (Çeyreklik)',
    frequency: 'quarterly',
    units: '%',
  },
  UNEMPLOYMENT: {
    id: 'UNRATE',
    name: 'ABD İşsizlik Oranı',
    frequency: 'monthly',
    units: '%',
  },
  PMI: {
    id: 'MANEMP',
    name: 'ABD İmalat İstihdam (PMI proxy)',
    frequency: 'monthly',
    units: 'Thousands',
  },
} as const;

export type FredSeriesKey = keyof typeof FRED_SERIES;

// ── Cache (1 saat TTL — FRED verileri yavaş güncellenir) ────────────

const FRED_CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

interface FredCacheEntry<T> {
  data: T;
  expiry: number;
}

const fredCache = new Map<string, FredCacheEntry<unknown>>();

function getFredCached<T>(key: string): T | null {
  const entry = fredCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    fredCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setFredCache<T>(key: string, data: T): void {
  if (fredCache.size > 50) {
    const firstKey = fredCache.keys().next().value;
    if (firstKey) fredCache.delete(firstKey);
  }
  fredCache.set(key, { data, expiry: Date.now() + FRED_CACHE_TTL_MS });
}

// ── FRED API Fetch ──────────────────────────────────────────────────

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

function getFredApiKey(): string | null {
  return process.env.FRED_API_KEY || null;
}

function getFredTimeout(): number {
  const val = parseInt(process.env.FRED_TIMEOUT_MS ?? '10000', 10);
  return isNaN(val) ? 10000 : val;
}

function getFredMaxRetries(): number {
  const val = parseInt(process.env.FRED_MAX_RETRIES ?? '2', 10);
  return isNaN(val) ? 2 : Math.min(val, 5);
}

/**
 * Fetch with timeout and exponential backoff retry.
 * Handles: timeout (AbortError), network errors, 429 rate limit.
 */
async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  maxRetries: number
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        signal: controller.signal,
        next: { revalidate: 3600 },
      });

      clearTimeout(timer);

      // Rate limit (429) → bekle ve tekrar dene
      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }
  }

  throw lastError ?? new Error('FRED fetch failed');
}

/**
 * Tek bir FRED serisi için veri çeker.
 * Timeout ve retry mekanizmalı.
 * @param key FRED_SERIES key'i
 * @param limit Son kaç gözlem (varsayılan: 60)
 */
export async function fetchFredSeries(
  key: FredSeriesKey,
  limit: number = 60
): Promise<FredSeries | null> {
  const apiKey = getFredApiKey();
  if (!apiKey) {
    console.warn('[FRED] API key bulunamadı (FRED_API_KEY). FRED verileri devre dışı.');
    return null;
  }

  const cacheKey = `fred:${key}:${limit}`;
  const cached = getFredCached<FredSeries>(cacheKey);
  if (cached) return cached;

  const series = FRED_SERIES[key];
  const url = new URL(FRED_BASE_URL);
  url.searchParams.set('series_id', series.id);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('limit', String(limit));

  try {
    const res = await fetchWithRetry(
      url.toString(),
      getFredTimeout(),
      getFredMaxRetries()
    );

    if (!res.ok) {
      console.error(`[FRED] HTTP ${res.status} (${key}/${series.id})`);
      return null;
    }

    const json = await res.json() as FredApiResponse;
    const observations = json.observations;

    if (!observations?.length) {
      console.error(`[FRED] Veri yok (${key}/${series.id})`);
      return null;
    }

    // "." değerlerini filtrele (FRED bazen veri yokken "." koyar)
    const validObs = observations
      .filter((o) => o.value !== '.' && !isNaN(parseFloat(o.value)))
      .map((o) => ({
        date: o.date,
        value: parseFloat(o.value),
      }));

    if (validObs.length === 0) return null;

    // desc sıralı geldi → reverse et (eski → yeni)
    validObs.reverse();

    const latest = validObs[validObs.length - 1];
    const previous = validObs.length >= 2 ? validObs[validObs.length - 2] : null;

    const change = previous ? roundTo(latest.value - previous.value, 4) : null;
    const changePct = previous && previous.value !== 0
      ? roundTo(((latest.value - previous.value) / previous.value) * 100, 2)
      : null;

    const result: FredSeries = {
      id: series.id,
      name: series.name,
      frequency: series.frequency,
      units: series.units,
      latestValue: latest.value,
      latestDate: latest.date,
      previousValue: previous?.value ?? null,
      change,
      changePct,
      data: validObs,
    };

    setFredCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[FRED] Ağ hatası (${key}):`, err);
    return null;
  }
}

/**
 * Tüm FRED serilerini paralel çeker.
 */
export async function fetchAllFredData(): Promise<FredSnapshot> {
  const cacheKey = 'fred:snapshot:all';
  const cached = getFredCached<FredSnapshot>(cacheKey);
  if (cached) return cached;

  const [fedFundsRate, cpiYoY, gdpGrowth, unemployment, pmi] = await Promise.all([
    fetchFredSeries('FED_FUNDS'),
    fetchFredSeries('CPI_YOY'),
    fetchFredSeries('GDP_GROWTH'),
    fetchFredSeries('UNEMPLOYMENT'),
    fetchFredSeries('PMI'),
  ]);

  const snapshot: FredSnapshot = {
    fedFundsRate,
    cpiYoY,
    gdpGrowth,
    unemployment,
    pmi,
    fetchedAt: new Date().toISOString(),
  };

  setFredCache(cacheKey, snapshot);
  return snapshot;
}

/**
 * CPI verisinden yıllık enflasyon oranı hesaplar.
 * CPI index → YoY% dönüşümü
 */
export function calculateCpiYoY(cpiData: FredSeriesPoint[]): number | null {
  if (cpiData.length < 13) return null; // En az 13 aylık veri lazım

  const latest = cpiData[cpiData.length - 1];
  // 12 ay önceki veriyi bul
  const latestDate = new Date(latest.date);
  const yearAgoTarget = new Date(latestDate);
  yearAgoTarget.setFullYear(yearAgoTarget.getFullYear() - 1);

  // En yakın 12 ay önceki veriyi bul
  let yearAgoValue: number | null = null;
  for (const point of cpiData) {
    const pointDate = new Date(point.date);
    const diffMonths = Math.abs(
      (latestDate.getFullYear() - pointDate.getFullYear()) * 12 +
      (latestDate.getMonth() - pointDate.getMonth())
    );
    if (diffMonths >= 11 && diffMonths <= 13) {
      yearAgoValue = point.value;
      break; // İlk eşleşen (eski→yeni sıralı olduğu için en yakın)
    }
  }

  if (yearAgoValue === null || yearAgoValue === 0) return null;
  return roundTo(((latest.value - yearAgoValue) / yearAgoValue) * 100, 2);
}

// ── Yardımcı ────────────────────────────────────────────────────────

function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

// ── FRED API Response Tipi ──────────────────────────────────────────

interface FredApiResponse {
  observations?: Array<{
    date: string;
    value: string;
  }>;
}

// ── Uyumluluk alias'ları (Berk'in route'ları için) ──────────────────

import type { MacroSnapshot } from '@/types/macro';

/**
 * Berk'in cron/macro-refresh ve api/macro route'larında kullandığı fonksiyon.
 * Bizim FredSnapshot'ı MacroSnapshot formatına dönüştürür.
 */
export async function fetchAllMacroIndicators(): Promise<MacroSnapshot> {
  const snapshot = await fetchAllFredData();
  return {
    timestamp: new Date().toISOString(),
    fed_rate: snapshot.fedFundsRate?.latestValue ?? null,
    cpi_yoy: snapshot.cpiYoY?.latestValue ?? null,
    gdp_growth: snapshot.gdpGrowth?.latestValue ?? null,
    unemployment: snapshot.unemployment?.latestValue ?? null,
    yield_curve_10y2y: null, // T10Y2Y bizim serilerde yok, Yahoo'dan gelecek
    dollar_index: null,      // Yahoo'dan gelecek
    vix: null,               // Yahoo'dan gelecek
    us_10y_yield: null,      // Yahoo'dan gelecek
  };
}
