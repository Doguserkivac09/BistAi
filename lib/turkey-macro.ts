/**
 * Türkiye Makroekonomik Veri Modülü.
 * TCMB EVDS API + Yahoo Finance fallback ile Türkiye'ye özel göstergeler.
 *
 * Phase 4.3 — USD/TRY (yahoo), TCMB politika faizi, CDS (EVDS veya fallback)
 *
 * TCMB EVDS API: https://evds2.tcmb.gov.tr/index.php?/evds/userDocs
 * Ücretsiz API key alınabilir.
 */

// ── Türler ──────────────────────────────────────────────────────────

export interface TurkeyMacroData {
  policyRate: TurkeyIndicator | null;     // TCMB politika faizi
  cds5y: TurkeyIndicator | null;          // Türkiye 5Y CDS spread
  inflation: TurkeyIndicator | null;      // TÜFE yıllık
  bond10y: TurkeyIndicator | null;        // Türkiye 10Y devlet tahvili faizi
  usdtry: TurkeyIndicator | null;         // USD/TRY (macro-data.ts'den de gelir, burada ek analiz)
  fetchedAt: string;
}

export interface TurkeyIndicator {
  name: string;
  value: number;
  previousValue: number | null;
  change: number | null;
  changeDirection: 'up' | 'down' | 'flat';
  unit: string;
  source: string;
  updatedAt: string;
  history: TurkeyDataPoint[];
}

export interface TurkeyDataPoint {
  date: string;
  value: number;
}

// ── TCMB EVDS Seri Kodları ──────────────────────────────────────────

export const TCMB_SERIES = {
  POLICY_RATE: {
    code: 'TP.PF.PF01',  // 1 Hafta Repo (politika faizi)
    name: 'TCMB Politika Faizi',
    unit: '%',
  },
  CPI_YOY: {
    code: 'TP.FG.J0',     // TÜFE Yıllık Değişim
    name: 'TÜFE Yıllık Enflasyon',
    unit: '%',
  },
  BOND_10Y: {
    code: 'TP.ADHGTGS.AGTGS10Y', // 10 Yıllık Devlet Tahvili Gösterge Faizi (yıllık bileşik, %)
    name: 'Türkiye 10Y Tahvil Faizi',
    unit: '%',
  },
} as const;

// ── Cache (30 dk TTL) ───────────────────────────────────────────────

const TURKEY_CACHE_TTL_MS = 30 * 60 * 1000;

interface TurkeyCacheEntry<T> {
  data: T;
  expiry: number;
}

const turkeyCache = new Map<string, TurkeyCacheEntry<unknown>>();

function getTurkeyCached<T>(key: string): T | null {
  const entry = turkeyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    turkeyCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setTurkeyCache<T>(key: string, data: T): void {
  if (turkeyCache.size > 50) {
    const firstKey = turkeyCache.keys().next().value;
    if (firstKey) turkeyCache.delete(firstKey);
  }
  turkeyCache.set(key, { data, expiry: Date.now() + TURKEY_CACHE_TTL_MS });
}

// ── TCMB EVDS API ──────────────────────────────────────────────────

const EVDS_BASE_URL = 'https://evds2.tcmb.gov.tr/service/evds';

function getTcmbApiKey(): string | null {
  return process.env.TCMB_API_KEY || null;
}

/**
 * TCMB EVDS API'den seri verisi çeker.
 */
async function fetchEvdsSeries(
  seriesCode: string,
  startDate: string, // DD-MM-YYYY
  endDate: string
): Promise<TurkeyDataPoint[]> {
  const apiKey = getTcmbApiKey();
  if (!apiKey) {
    console.warn('[TCMB] API key bulunamadı (TCMB_API_KEY). TCMB verileri devre dışı.');
    return [];
  }

  // TCMB EVDS alışılmadık URL formatı: parametreler path segmenti olarak gönderilir
  // Doğru: /service/evds/series=X&startDate=Y&endDate=Z&type=json&key=K
  const url = `${EVDS_BASE_URL}/series=${encodeURIComponent(seriesCode)}&startDate=${startDate}&endDate=${endDate}&type=json&key=${apiKey}`;


  try {
    const res = await fetch(url, {
      cache: 'no-store', // Next.js cache bypass — TCMB kendi cache'ini yönetiyor
      headers: {
        'key': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });

    const text = await res.text();

    if (!res.ok || text.trimStart().startsWith('<')) {
      console.error(`[TCMB] HTTP ${res.status} (${seriesCode}) — İlk 300 karakter: ${text.slice(0, 300)}`);
      return [];
    }

    const json = JSON.parse(text) as EvdsResponse;
    const items = json.items;

    if (!items?.length) return [];

    // EVDS veri formatı: { "Tarih": "31-01-2024", "TP.PF.PF01": "45" }
    // Seri kodu'ndaki "." yerine "_" kullanılabilir
    const seriesKey = seriesCode.replace(/\./g, '_');

    return items
      .map((item) => {
        const rawVal = item[seriesCode] ?? item[seriesKey];
        const val = typeof rawVal === 'string' ? parseFloat(rawVal) : rawVal;
        if (val == null || isNaN(val as number)) return null;

        // Tarih: DD-MM-YYYY → YYYY-MM-DD
        const dateParts = (item.Tarih ?? '').split('-');
        const date = dateParts.length === 3
          ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`
          : '';

        return date ? { date, value: val as number } : null;
      })
      .filter((d): d is TurkeyDataPoint => d !== null);
  } catch (err) {
    console.error(`[TCMB] Ağ hatası (${seriesCode}):`, err);
    return [];
  }
}

// ── Gösterge Çekme Fonksiyonları ────────────────────────────────────

/**
 * TCMB politika faizi verisi çeker.
 */
export async function fetchPolicyRate(): Promise<TurkeyIndicator | null> {
  const cacheKey = 'turkey:policyRate';
  const cached = getTurkeyCached<TurkeyIndicator>(cacheKey);
  if (cached) return cached;

  const { code, name, unit } = TCMB_SERIES.POLICY_RATE;
  const endDate = formatDateEvds(new Date());
  const startDate = formatDateEvds(monthsAgo(6));

  const data = await fetchEvdsSeries(code, startDate, endDate);
  if (data.length === 0) {
    // Fallback: son bilinen TCMB politika faizi (2026 Nisan itibarıyla ~%37)
    return createFallbackIndicator(name, 37, unit, 'hardcoded-fallback');
  }

  const indicator = buildIndicator(name, unit, 'TCMB EVDS', data);
  if (indicator) setTurkeyCache(cacheKey, indicator);
  return indicator;
}

/**
 * TÜFE yıllık enflasyon verisi çeker.
 */
export async function fetchTurkeyInflation(): Promise<TurkeyIndicator | null> {
  const cacheKey = 'turkey:inflation';
  const cached = getTurkeyCached<TurkeyIndicator>(cacheKey);
  if (cached) return cached;

  const { code, name, unit } = TCMB_SERIES.CPI_YOY;
  const endDate = formatDateEvds(new Date());
  const startDate = formatDateEvds(monthsAgo(24));

  const data = await fetchEvdsSeries(code, startDate, endDate);
  if (data.length === 0) {
    // Fallback: TÜİK son açıklanan TÜFE yıllık (2026 itibarıyla ~%30.9)
    return createFallbackIndicator(name, 30.9, unit, 'tuik-hardcoded-fallback');
  }

  const indicator = buildIndicator(name, unit, 'TCMB EVDS', data);
  if (indicator) setTurkeyCache(cacheKey, indicator);
  return indicator;
}

/**
 * Türkiye 10 yıllık gösterge devlet tahvili faizi.
 * EVDS serisi mevcut değilse fallback (~%40 — 2026 itibarıyla tipik seviye).
 */
export async function fetchTurkey10YBond(): Promise<TurkeyIndicator | null> {
  const cacheKey = 'turkey:bond10y';
  const cached = getTurkeyCached<TurkeyIndicator>(cacheKey);
  if (cached) return cached;

  const { code, name, unit } = TCMB_SERIES.BOND_10Y;
  const endDate = formatDateEvds(new Date());
  const startDate = formatDateEvds(monthsAgo(6));

  const data = await fetchEvdsSeries(code, startDate, endDate);
  if (data.length === 0) {
    return createFallbackIndicator(name, 40, unit, 'hardcoded-fallback');
  }

  const indicator = buildIndicator(name, unit, 'TCMB EVDS', data);
  if (indicator) setTurkeyCache(cacheKey, indicator);
  return indicator;
}

/**
 * Türkiye 5Y CDS spread verisi.
 * TCMB EVDS'de CDS yoksa, Yahoo Finance'den alternatif olarak
 * USDTRY volatilitesinden proxy CDS hesaplar.
 */
export async function fetchTurkeyCDS(): Promise<TurkeyIndicator | null> {
  const cacheKey = 'turkey:cds5y';
  const cached = getTurkeyCached<TurkeyIndicator>(cacheKey);
  if (cached) return cached;

  // CDS verisi doğrudan EVDS'de bulunmayabilir.
  // Worldgovernmentbonds.com veya investing.com'dan scraping bir seçenek
  // ama güvenilirlik için şimdilik proxy kullanıyoruz.
  //
  // Proxy CDS: USD/TRY 30 gün volatilitesi × çarpan
  // Gerçek CDS entegrasyonu Phase 5 veya harici API ile yapılabilir.

  try {
    // Yahoo'dan USD/TRY tarihsel veri çek
    const { fetchMacroHistory } = await import('./macro-data');
    const usdtryHistory = await fetchMacroHistory('USDTRY', 90);

    if (!usdtryHistory?.data || usdtryHistory.data.length < 30) {
      return createFallbackIndicator('Türkiye 5Y CDS (proxy)', 290, 'bps', 'proxy-estimate');
    }

    // 30 günlük USD/TRY volatilite → proxy CDS
    const last30 = usdtryHistory.data.slice(-30);
    const returns: number[] = [];
    for (let i = 1; i < last30.length; i++) {
      const prev = last30[i - 1].close;
      if (prev > 0) {
        returns.push((last30[i].close - prev) / prev);
      }
    }

    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualize

    // Proxy CDS = volatility × 1500 (kaba tahmin, gerçek CDS korelasyonu baz alınarak)
    // Türkiye için minimum 280 bps floor — 2026 itibarıyla gerçek CDS ~280-300 bps
    const proxyCds = Math.max(280, Math.round(volatility * 1500));

    // Önceki 30 gün CDS
    const prev30 = usdtryHistory.data.slice(-60, -30);
    let previousCds: number | null = null;
    if (prev30.length >= 20) {
      const prevReturns = [];
      for (let i = 1; i < prev30.length; i++) {
        const prev = prev30[i - 1].close;
        if (prev > 0) prevReturns.push((prev30[i].close - prev) / prev);
      }
      const prevAvg = prevReturns.reduce((s, r) => s + r, 0) / prevReturns.length;
      const prevVar = prevReturns.reduce((s, r) => s + (r - prevAvg) ** 2, 0) / prevReturns.length;
      previousCds = Math.max(280, Math.round(Math.sqrt(prevVar) * Math.sqrt(252) * 1500));
    }

    const change = previousCds !== null ? proxyCds - previousCds : null;

    const indicator: TurkeyIndicator = {
      name: 'Türkiye 5Y CDS (proxy)',
      value: proxyCds,
      previousValue: previousCds,
      change,
      changeDirection: change === null ? 'flat' : change > 5 ? 'up' : change < -5 ? 'down' : 'flat',
      unit: 'bps',
      source: 'USD/TRY volatility proxy',
      updatedAt: new Date().toISOString(),
      history: last30.map((d, i) => ({
        date: d.date,
        // Kümülatif volatilite yaklaşımı
        value: i < 5 ? proxyCds : Math.round(
          Math.sqrt(
            returns.slice(Math.max(0, i - 20), i).reduce((s, r) => s + r * r, 0) /
            Math.max(1, Math.min(20, i))
          ) * Math.sqrt(252) * 1500
        ),
      })),
    };

    setTurkeyCache(cacheKey, indicator);
    return indicator;
  } catch (err) {
    console.error('[Turkey] CDS proxy hesaplama hatası:', err);
    return createFallbackIndicator('Türkiye 5Y CDS (proxy)', 290, 'bps', 'proxy-error-fallback');
  }
}

/**
 * Tüm Türkiye makro verilerini paralel çeker.
 */
export async function fetchAllTurkeyMacro(): Promise<TurkeyMacroData> {
  const cacheKey = 'turkey:all';
  const cached = getTurkeyCached<TurkeyMacroData>(cacheKey);
  if (cached) return cached;

  const [policyRate, cds5y, inflation, bond10y] = await Promise.all([
    fetchPolicyRate(),
    fetchTurkeyCDS(),
    fetchTurkeyInflation(),
    fetchTurkey10YBond(),
  ]);

  // USD/TRY ek analiz: macro-data.ts'deki quote'u zenginleştir
  let usdtry: TurkeyIndicator | null = null;
  try {
    const { fetchMacroQuote, fetchMacroHistory, calculateTrend } = await import('./macro-data');
    const [quote, history] = await Promise.all([
      fetchMacroQuote('USDTRY'),
      fetchMacroHistory('USDTRY', 90),
    ]);

    if (quote && history?.data) {
      const trend = calculateTrend(history.data);
      usdtry = {
        name: 'USD/TRY Kuru',
        value: quote.price,
        previousValue: quote.previousClose,
        change: quote.change,
        changeDirection: quote.change > 0.01 ? 'up' : quote.change < -0.01 ? 'down' : 'flat',
        unit: 'TRY',
        source: 'Yahoo Finance',
        updatedAt: quote.updatedAt,
        history: history.data.map((d) => ({ date: d.date, value: d.close })),
      };

      // Momentum bilgisi ekle
      if (trend) {
        usdtry.name = `USD/TRY Kuru (momentum: ${trend.momentum > 0 ? '+' : ''}${trend.momentum})`;
      }
    }
  } catch {
    // USD/TRY opsiyonel, hata varsa devam et
  }

  const result: TurkeyMacroData = {
    policyRate,
    cds5y,
    inflation,
    bond10y,
    usdtry,
    fetchedAt: new Date().toISOString(),
  };

  setTurkeyCache(cacheKey, result);
  return result;
}

// ── Yardımcı Fonksiyonlar ───────────────────────────────────────────

function buildIndicator(
  name: string,
  unit: string,
  source: string,
  data: TurkeyDataPoint[]
): TurkeyIndicator | null {
  if (data.length === 0) return null;

  const latest = data[data.length - 1];
  const previous = data.length >= 2 ? data[data.length - 2] : null;
  const change = previous ? roundTo(latest.value - previous.value, 4) : null;

  return {
    name,
    value: latest.value,
    previousValue: previous?.value ?? null,
    change,
    changeDirection: change === null ? 'flat' : change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat',
    unit,
    source,
    updatedAt: new Date().toISOString(),
    history: data,
  };
}

function createFallbackIndicator(
  name: string,
  fallbackValue: number,
  unit: string,
  source: string
): TurkeyIndicator {
  return {
    name,
    value: fallbackValue,
    previousValue: null,
    change: null,
    changeDirection: 'flat',
    unit,
    source,
    updatedAt: new Date().toISOString(),
    history: [],
  };
}

function formatDateEvds(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

// ── EVDS Response Tipi ──────────────────────────────────────────────

interface EvdsResponse {
  items?: Array<Record<string, string | number | undefined> & {
    Tarih?: string;
  }>;
}
