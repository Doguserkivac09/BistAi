/**
 * Time Alignment — farklı veri kaynaklarının zaman dilimi uyumluluğu.
 *
 * Sorun: Yahoo Finance (US market hours), TCMB (TR iş günleri),
 * FRED (aylık/çeyreklik, gecikmeli) farklı zamanlarda güncellenir.
 * Bu modül, veri tazeliğini kontrol eder ve stale veriyi işaretler.
 *
 * Phase 8.2
 */

// ── Türler ──────────────────────────────────────────────────────────

export interface DataFreshness {
  source: string;
  lastUpdate: Date | null;
  isStale: boolean;
  staleSince: string | null;     // "2 saat önce" gibi human-readable
  expectedFrequency: string;     // "15dk", "günlük", "aylık"
  marketStatus: MarketStatus;
}

export type MarketStatus = 'open' | 'closed' | 'pre_market' | 'after_hours' | 'weekend' | 'holiday';

// ── Piyasa Saatleri ─────────────────────────────────────────────────

// Türkiye tatil günleri (2026 takvimi — resmi tatiller)
const TR_HOLIDAYS_2026 = [
  '2026-01-01', // Yılbaşı
  '2026-03-25', '2026-03-26', '2026-03-27', // Ramazan Bayramı (tahmini)
  '2026-04-23', // Ulusal Egemenlik
  '2026-05-01', // İşçi Bayramı
  '2026-05-19', // Gençlik Bayramı
  '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', // Kurban Bayramı (tahmini)
  '2026-07-15', // Demokrasi Bayramı
  '2026-08-30', // Zafer Bayramı
  '2026-10-29', // Cumhuriyet Bayramı
];

const US_HOLIDAYS_2026 = [
  '2026-01-01', // New Year
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

/**
 * BIST piyasa durumunu kontrol eder.
 * BIST: Pazartesi-Cuma 10:00-18:10 (TR saati, UTC+3)
 */
export function getBISTMarketStatus(now?: Date): MarketStatus {
  const d = now ?? new Date();
  const trTime = toTRTime(d);
  const day = trTime.getDay();
  const dateStr = formatDate(trTime);

  if (day === 0 || day === 6) return 'weekend';
  if (TR_HOLIDAYS_2026.includes(dateStr)) return 'holiday';

  const hours = trTime.getHours();
  const minutes = trTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes < 600) return 'pre_market';        // 10:00 öncesi
  if (totalMinutes > 1090) return 'after_hours';       // 18:10 sonrası
  return 'open';
}

/**
 * US piyasa durumunu kontrol eder.
 * NYSE/NASDAQ: Pazartesi-Cuma 09:30-16:00 (ET, UTC-5/-4)
 */
export function getUSMarketStatus(now?: Date): MarketStatus {
  const d = now ?? new Date();
  const etTime = toETTime(d);
  const day = etTime.getDay();
  const dateStr = formatDate(etTime);

  if (day === 0 || day === 6) return 'weekend';
  if (US_HOLIDAYS_2026.includes(dateStr)) return 'holiday';

  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes < 570) return 'pre_market';         // 09:30 öncesi
  if (totalMinutes >= 960) return 'after_hours';        // 16:00 sonrası
  return 'open';
}

// ── Veri Tazeliği Kontrolü ──────────────────────────────────────────

interface FreshnessConfig {
  source: string;
  expectedFrequency: string;
  maxStalenessMs: number;
}

const FRESHNESS_CONFIGS: Record<string, FreshnessConfig> = {
  yahoo: {
    source: 'Yahoo Finance',
    expectedFrequency: '15dk',
    maxStalenessMs: 30 * 60 * 1000,       // 30 dk — market açıkken
  },
  tcmb: {
    source: 'TCMB EVDS',
    expectedFrequency: 'günlük',
    maxStalenessMs: 24 * 60 * 60 * 1000,  // 24 saat
  },
  fred: {
    source: 'FRED (St. Louis Fed)',
    expectedFrequency: 'aylık',
    maxStalenessMs: 35 * 24 * 60 * 60 * 1000, // 35 gün
  },
};

/**
 * Bir veri kaynağının tazeliğini kontrol eder.
 */
export function checkFreshness(
  sourceKey: 'yahoo' | 'tcmb' | 'fred',
  lastUpdateTime: string | Date | null
): DataFreshness {
  const config = FRESHNESS_CONFIGS[sourceKey];
  const marketStatus = sourceKey === 'yahoo'
    ? getUSMarketStatus()
    : sourceKey === 'tcmb'
      ? getBISTMarketStatus()
      : 'open'; // FRED her zaman "open" (aylık güncelleme)

  if (!lastUpdateTime) {
    return {
      source: config.source,
      lastUpdate: null,
      isStale: true,
      staleSince: 'hiç güncellenmedi',
      expectedFrequency: config.expectedFrequency,
      marketStatus,
    };
  }

  const lastUpdate = new Date(lastUpdateTime);
  const ageMs = Date.now() - lastUpdate.getTime();

  // Piyasa kapalıyken staleness threshold'u gevşet
  const effectiveMaxStale = (marketStatus !== 'open')
    ? config.maxStalenessMs * 3
    : config.maxStalenessMs;

  const isStale = ageMs > effectiveMaxStale;

  return {
    source: config.source,
    lastUpdate,
    isStale,
    staleSince: isStale ? humanizeAge(ageMs) : null,
    expectedFrequency: config.expectedFrequency,
    marketStatus,
  };
}

/**
 * Bir tarih dizisindeki en son iş gününü bulur.
 * Hafta sonu ve tatil günlerini atlar, bir önceki cuma/perşembeye gider.
 */
export function getLastBusinessDay(
  market: 'bist' | 'us',
  from?: Date
): Date {
  const d = from ? new Date(from) : new Date();
  const holidays = market === 'bist' ? TR_HOLIDAYS_2026 : US_HOLIDAYS_2026;

  // Max 10 gün geriye git
  for (let i = 0; i < 10; i++) {
    const day = d.getDay();
    const dateStr = formatDate(d);

    if (day !== 0 && day !== 6 && !holidays.includes(dateStr)) {
      return d;
    }
    d.setDate(d.getDate() - 1);
  }

  return d;
}

/**
 * Farklı frekanstaki verileri aynı zaman aralığına hizalar.
 * Örn: günlük OHLCV + aylık FRED → günlük verinin her satırına
 * o tarihte geçerli olan FRED değerini eşleştirir.
 */
export function alignTimeSeries<T extends { date: string }>(
  dailyData: T[],
  periodicData: Array<{ date: string; value: number }>,
): Array<T & { alignedValue: number | null }> {
  if (periodicData.length === 0) {
    return dailyData.map(d => ({ ...d, alignedValue: null }));
  }

  // Periodic veriyi eski→yeni sırala
  const sorted = [...periodicData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return dailyData.map(row => {
    const rowDate = new Date(row.date).getTime();

    // En yakın (ve kendinden eski) periodic veriyi bul
    let matched: number | null = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (new Date(sorted[i].date).getTime() <= rowDate) {
        matched = sorted[i].value;
        break;
      }
    }

    return { ...row, alignedValue: matched };
  });
}

// ── Yardımcı ────────────────────────────────────────────────────────

function toTRTime(d: Date): Date {
  return new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
}

function toETTime(d: Date): Date {
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function humanizeAge(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}
