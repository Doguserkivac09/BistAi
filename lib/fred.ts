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

/**
 * Tek bir FRED serisi için veri çeker.
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
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // 1 saat
    });

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
