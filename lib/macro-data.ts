/**
 * Makro Veri Modülü — Yahoo Finance'den global makro göstergeleri çeker.
 * VIX, DXY, US 10Y Yield, USD/TRY, EEM (EM ETF), Brent Petrol
 *
 * Phase 4.1 — Makro Rüzgar Motoru altyapısı
 */

// ── Türler ──────────────────────────────────────────────────────────

export interface MacroQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;        // fiyat farkı
  changePercent: number;  // yüzde değişim
  dayHigh: number;
  dayLow: number;
  updatedAt: string;      // ISO timestamp
}

export interface MacroHistory {
  symbol: string;
  name: string;
  data: MacroDataPoint[];
}

export interface MacroDataPoint {
  date: string;   // YYYY-MM-DD
  close: number;
}

export interface MacroSnapshot {
  vix: MacroQuote | null;
  dxy: MacroQuote | null;
  us10y: MacroQuote | null;
  usdtry: MacroQuote | null;
  eem: MacroQuote | null;
  brent: MacroQuote | null;
  gold: MacroQuote | null;
  silver: MacroQuote | null;
  copper: MacroQuote | null;
  bist100: MacroQuote | null;
  fetchedAt: string;
}

// ── Yahoo Sembol Mapping ────────────────────────────────────────────

export const MACRO_SYMBOLS = {
  VIX:    { yahoo: '^VIX',      name: 'VIX (Korku Endeksi)' },
  DXY:    { yahoo: 'DX-Y.NYB',  name: 'Dolar Endeksi (DXY)' },
  US10Y:  { yahoo: '^TNX',      name: 'ABD 10 Yıllık Tahvil Faizi' },
  USDTRY: { yahoo: 'USDTRY=X',  name: 'USD/TRY Kuru' },
  EEM:    { yahoo: 'EEM',       name: 'iShares MSCI EM ETF' },
  BRENT:  { yahoo: 'BZ=F',      name: 'Brent Petrol' },
  GOLD:   { yahoo: 'GC=F',      name: 'Altın (XAU/USD)' },
  SILVER: { yahoo: 'SI=F',      name: 'Gümüş (XAG/USD)' },
  COPPER: { yahoo: 'HG=F',      name: 'Bakır ($/lb)' },
  BIST100:{ yahoo: 'XU100.IS',  name: 'BIST 100 Endeksi' },
} as const;

export type MacroSymbolKey = keyof typeof MACRO_SYMBOLS;

// ── Cache (15 dk TTL) ───────────────────────────────────────────────

const MACRO_CACHE_TTL_MS = 15 * 60 * 1000;

interface MacroCacheEntry<T> {
  data: T;
  expiry: number;
}

const macroCache = new Map<string, MacroCacheEntry<unknown>>();

function getMacroCached<T>(key: string): T | null {
  const entry = macroCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    macroCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setMacroCache<T>(key: string, data: T, ttlMs: number = MACRO_CACHE_TTL_MS): void {
  // Bellek sızıntısını önle — max 100 entry
  if (macroCache.size > 100) {
    const firstKey = macroCache.keys().next().value;
    if (firstKey) macroCache.delete(firstKey);
  }
  macroCache.set(key, { data, expiry: Date.now() + ttlMs });
}

// ── Yahoo Finance Fetch ─────────────────────────────────────────────

const USER_AGENT = 'Mozilla/5.0 (compatible; Investable Edge/1.0)';

/**
 * Tek bir makro sembol için güncel fiyat bilgisi çeker.
 */
export async function fetchMacroQuote(key: MacroSymbolKey): Promise<MacroQuote | null> {
  const cacheKey = `macro:quote:${key}`;
  const cached = getMacroCached<MacroQuote>(cacheKey);
  if (cached) return cached;

  const { yahoo, name } = MACRO_SYMBOLS[key];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=5d&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate: 900 }, // 15 dk
    });

    if (!res.ok) {
      console.error(`[Macro] fetchMacroQuote HTTP ${res.status} (${key})`);
      return null;
    }

    const json = await res.json() as YahooChartResponse;
    const result = json.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta?.regularMarketPrice) {
      console.error(`[Macro] fetchMacroQuote veri yok (${key})`);
      return null;
    }

    const price = meta.regularMarketPrice;

    // Anomali filtresi: Gümüş (SI=F) hiçbir zaman $80+ olmaz (tarihsel max ~$50)
    // Yahoo Finance bazen hatalı veri döner (ör: $73 yerine gerçek $32)
    if (key === 'SILVER' && price > 80) {
      console.warn(`[Macro] SILVER anormal fiyat (${price}) — veri atlanıyor`);
      return null;
    }

    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

    const quote: MacroQuote = {
      symbol: key,
      name,
      price,
      previousClose,
      change: roundTo(change, 4),
      changePercent: roundTo(changePercent, 2),
      dayHigh: meta.regularMarketDayHigh ?? price,
      dayLow: meta.regularMarketDayLow ?? price,
      updatedAt: new Date().toISOString(),
    };

    setMacroCache(cacheKey, quote);
    return quote;
  } catch (err) {
    console.error(`[Macro] fetchMacroQuote ağ hatası (${key}):`, err);
    return null;
  }
}

/**
 * Tek bir makro sembol için tarihsel veri çeker.
 * @param days Kaç günlük veri (varsayılan 90)
 */
export async function fetchMacroHistory(
  key: MacroSymbolKey,
  days: number = 90
): Promise<MacroHistory | null> {
  const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : '1y';
  const cacheKey = `macro:history:${key}:${range}`;
  const cached = getMacroCached<MacroHistory>(cacheKey);
  if (cached) return cached;

  const { yahoo, name } = MACRO_SYMBOLS[key];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=${range}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      console.error(`[Macro] fetchMacroHistory HTTP ${res.status} (${key})`);
      return null;
    }

    const json = await res.json() as YahooChartResponse;
    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const quote = result?.indicators?.quote?.[0];

    if (!timestamps?.length || !quote) return null;

    const closes = quote.close ?? [];
    const dataPoints: MacroDataPoint[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close == null) continue;
      const date = new Date((timestamps[i] ?? 0) * 1000).toISOString().slice(0, 10);
      dataPoints.push({ date, close: roundTo(close, 4) });
    }

    if (dataPoints.length === 0) return null;

    const history: MacroHistory = { symbol: key, name, data: dataPoints };
    setMacroCache(cacheKey, history);
    return history;
  } catch (err) {
    console.error(`[Macro] fetchMacroHistory ağ hatası (${key}):`, err);
    return null;
  }
}

/**
 * Tüm makro göstergelerin güncel fiyatlarını paralel çeker.
 * Ana kullanım noktası — tek çağrıyla tüm makro verileri alır.
 */
export async function fetchAllMacroQuotes(): Promise<MacroSnapshot> {
  const cacheKey = 'macro:snapshot:all';
  const cached = getMacroCached<MacroSnapshot>(cacheKey);
  if (cached) return cached;

  const keys = Object.keys(MACRO_SYMBOLS) as MacroSymbolKey[];

  const results = await Promise.allSettled(
    keys.map((key) => fetchMacroQuote(key))
  );

  const snapshot: MacroSnapshot = {
    vix: null,
    dxy: null,
    us10y: null,
    usdtry: null,
    eem: null,
    brent: null,
    gold: null,
    silver: null,
    copper: null,
    bist100: null,
    fetchedAt: new Date().toISOString(),
  };

  for (let i = 0; i < keys.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      const key = keys[i].toLowerCase() as keyof Omit<MacroSnapshot, 'fetchedAt'>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (snapshot as any)[key] = result.value;
    }
  }

  // Snapshot'ı 5 dk cache'le (individual quote'lar zaten 15 dk)
  setMacroCache(cacheKey, snapshot, 5 * 60 * 1000);
  return snapshot;
}

/**
 * Tüm makro göstergelerin tarihsel verilerini paralel çeker.
 */
export async function fetchAllMacroHistory(
  days: number = 90
): Promise<Record<MacroSymbolKey, MacroHistory | null>> {
  const keys = Object.keys(MACRO_SYMBOLS) as MacroSymbolKey[];

  const results = await Promise.allSettled(
    keys.map((key) => fetchMacroHistory(key, days))
  );

  const out = {} as Record<MacroSymbolKey, MacroHistory | null>;
  for (let i = 0; i < keys.length; i++) {
    const result = results[i];
    out[keys[i]] = result.status === 'fulfilled' ? result.value : null;
  }
  return out;
}

// ── Yardımcı: Trend Hesaplama ───────────────────────────────────────

export interface TrendInfo {
  direction: 'up' | 'down' | 'flat';
  changePct: number;        // dönem yüzde değişimi
  sma20: number | null;     // 20 günlük ortalama
  aboveSma20: boolean;      // fiyat SMA20 üstünde mi?
  momentum: number;         // -100 ile +100 arası momentum skoru
}

/**
 * Tarihsel veriden trend bilgisi hesaplar.
 */
export function calculateTrend(data: MacroDataPoint[]): TrendInfo | null {
  if (data.length < 5) return null;

  const current = data[data.length - 1].close;
  const prev20 = data.length >= 20 ? data[data.length - 20].close : data[0].close;

  // Yüzde değişim
  const changePct = prev20 !== 0 ? ((current - prev20) / prev20) * 100 : 0;

  // SMA20
  let sma20: number | null = null;
  if (data.length >= 20) {
    const last20 = data.slice(-20);
    sma20 = roundTo(last20.reduce((sum, d) => sum + d.close, 0) / 20, 4);
  }

  // Yön
  const threshold = 1; // %1 altı flat sayılır
  const direction = changePct > threshold ? 'up' : changePct < -threshold ? 'down' : 'flat';

  // Momentum: tanh normalize [-100, +100]
  const momentum = roundTo(Math.tanh(changePct / 10) * 100, 1);

  return {
    direction,
    changePct: roundTo(changePct, 2),
    sma20,
    aboveSma20: sma20 !== null ? current > sma20 : false,
    momentum,
  };
}

// ── Yardımcı ────────────────────────────────────────────────────────

function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

// ── Yahoo Response Tipi ─────────────────────────────────────────────

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
      };
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
}
