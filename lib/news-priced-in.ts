/**
 * Haber Fiyatlandırma Analizi
 *
 * 4 faktörlü matris: haber yaşı × fiyat hareketi × hacim × trend
 * APEX-US pozisyon kararlarına entegre edilir.
 */

// ── Tipler ───────────────────────────────────────────────────────────────────

export type NewsPricedInStatus =
  | 'fresh_unpriced'      // <6sa, <0.5×ATR hareket, yüksek hacim → güçlü fırsat
  | 'reacting'            // <6sa, 0.5–2×ATR hareket → izle
  | 'parabolic_news'      // <6sa, >2×ATR hareket, düz/düşüş trend → küçült
  | 'sell_news_risk'      // <6sa, >2×ATR hareket, 5g rallisi → yeni giriş yok
  | 'already_pricing'     // 6–24sa, hareket sürüyor → dikkatli
  | 'stale'               // >24sa → nötr
  | 'negative_sentiment'  // Negatif anahtar kelime (her zaman −3)
  | 'no_news';            // Haber bulunamadı

export interface NewsPricedInResult {
  status:            NewsPricedInStatus;
  scoreAdj:          number;   // Sinyal sağlık skoruna eklenir
  reason:            string;
  nearEarnings:      boolean;
  earningsMultiplier: number;  // 1 normal, 2 = earnings ±2 gün
  headline?:         string;
  newsAgeHours?:     number;
}

// ── Sabitler ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 saat
const cache = new Map<string, { result: NewsPricedInResult; expiry: number }>();

const NEGATIVE_KEYWORDS = [
  'downgrade', 'sec ', 'sec.gov', 'lawsuit', 'fraud', 'recall',
  'misses', 'missed', 'miss earnings', 'earnings miss',
  'cuts guidance', 'lowers', 'investigation', 'class action',
  'bankruptcy', 'warning', 'fails', 'disappoints', 'shortfall',
  'probe', 'subpoena', 'regulatory', 'delisting', 'restated',
];

// ── Yahoo News + Earnings fetch ───────────────────────────────────────────────

async function fetchLatestNews(
  symbol: string,
): Promise<Array<{ title: string; publishTime: number }>> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&lang=en-US&region=US&quotesCount=0&newsCount=5`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { news?: Array<{ title?: string; publishTime?: number }> };
    return (data.news ?? []).filter((n) => n.title && n.publishTime).map((n) => ({
      title:       n.title!,
      publishTime: n.publishTime!,
    }));
  } catch {
    return [];
  }
}

async function isNearEarnings(symbol: string): Promise<boolean> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal:  AbortSignal.timeout(6_000),
    });
    if (!res.ok) return false;
    const data = await res.json() as Record<string, unknown>;
    const result  = (data?.quoteSummary as Record<string, unknown>)?.result;
    const first   = (result as Record<string, unknown>[])?.[0] as Record<string, unknown> | undefined;
    const calEvt  = first?.calendarEvents as Record<string, unknown> | undefined;
    const earningsObj = calEvt?.earnings as Record<string, unknown> | undefined;
    const earDates = earningsObj?.earningsDate as Array<{ raw?: number }> | undefined;
    if (!earDates?.length) return false;
    const nextEarnings = earDates[0]?.raw;
    if (!nextEarnings) return false;
    const diffDays = Math.abs((nextEarnings * 1000 - Date.now()) / 86_400_000);
    return diffDays <= 2;
  } catch {
    return false;
  }
}

// ── Trend tespiti: son 5 günde rally var mı? ────────────────────────────────

function hasRecentRally(candles: Array<{ close: number }> | null): boolean {
  if (!candles || candles.length < 5) return false;
  const last5 = candles.slice(-5);
  return (last5.at(-1)?.close ?? 0) > (last5[0]?.close ?? 0) * 1.03; // +%3 üstü = rally
}

// ── Ana değerlendirme fonksiyonu ─────────────────────────────────────────────

export async function assessNewsPricedIn(
  symbol:      string,
  changeToday: number | null,   // Bugünkü % değişim
  atr:         number | null,   // ATR ($)
  entryPrice:  number | null,   // Güncel fiyat
  relVol5:     number | null,   // Relative Volume 5G
  candles:     Array<{ close: number }> | null,
): Promise<NewsPricedInResult> {
  const today    = new Date().toISOString().slice(0, 10);
  const cacheKey = `news:${symbol}:${today}`;
  const cached   = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) return cached.result;

  function store(result: NewsPricedInResult): NewsPricedInResult {
    cache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS });
    return result;
  }

  const NO_NEWS: NewsPricedInResult = {
    status: 'no_news', scoreAdj: 0, reason: 'Güncel haber yok', nearEarnings: false, earningsMultiplier: 1,
  };

  // Paralel: haber + earnings
  const [news, nearEarnings] = await Promise.all([
    fetchLatestNews(symbol),
    isNearEarnings(symbol),
  ]);

  if (!news.length) return store(NO_NEWS);

  const latest    = news[0]!;
  const ageHours  = (Date.now() - latest.publishTime * 1000) / 3_600_000;
  const title     = latest.title.toLowerCase();
  const em        = nearEarnings ? 2 : 1; // earnings multiplier

  // Negatif sentiment — önce kontrol et
  const isNegative = NEGATIVE_KEYWORDS.some((kw) => title.includes(kw));
  if (isNegative) {
    return store({
      status:    'negative_sentiment',
      scoreAdj:  -3 * em,
      reason:    `Negatif haber: "${latest.title.slice(0, 70)}..."`,
      nearEarnings, earningsMultiplier: em,
      headline: latest.title, newsAgeHours: ageHours,
    });
  }

  // Eski haber — nötr
  if (ageHours > 24) {
    return store({ status: 'stale', scoreAdj: 0, reason: `Eski haber (${ageHours.toFixed(0)}sa)`, nearEarnings, earningsMultiplier: em, headline: latest.title, newsAgeHours: ageHours });
  }

  // Hareket büyüklüğü: changeToday% / (atr/entryPrice * 100)
  const atrPct = (atr && entryPrice && entryPrice > 0) ? (atr / entryPrice) * 100 : null;
  const absChange = Math.abs(changeToday ?? 0);
  const atrMultiple = atrPct && atrPct > 0 ? absChange / atrPct : null;

  const volumeStrong = (relVol5 ?? 0) >= 2;
  const volumeWeak   = (relVol5 ?? 1) < 1;
  const hasRally     = hasRecentRally(candles);

  // 6–24 saat arası: zaten fiyatlanıyor
  if (ageHours > 6) {
    return store({
      status:    'already_pricing',
      scoreAdj:  -1 * em,
      reason:    `Haber ${ageHours.toFixed(0)}sa önce, zaten fiyatlanıyor`,
      nearEarnings, earningsMultiplier: em, headline: latest.title, newsAgeHours: ageHours,
    });
  }

  // Fresh (<6sa) — 3 alt kategori
  if (atrMultiple !== null) {
    if (atrMultiple > 2) {
      // Aşırı reaksiyon
      if (hasRally) {
        return store({
          status: 'sell_news_risk', scoreAdj: -2 * em,
          reason: `Aşırı reaksiyon (${atrMultiple.toFixed(1)}×ATR) + önceki rally → sat haberi riski`,
          nearEarnings, earningsMultiplier: em, headline: latest.title, newsAgeHours: ageHours,
        });
      }
      return store({
        status: 'parabolic_news', scoreAdj: -1 * em,
        reason: `Parabolik haber hareketi (${atrMultiple.toFixed(1)}×ATR) → pozisyon küçült`,
        nearEarnings, earningsMultiplier: em, headline: latest.title, newsAgeHours: ageHours,
      });
    }

    if (atrMultiple < 0.5 && volumeStrong && !hasRally) {
      return store({
        status: 'fresh_unpriced', scoreAdj: +2 * em,
        reason: `Taze haber (${ageHours.toFixed(0)}sa), az fiyatlandı (<0.5×ATR), güçlü hacim`,
        nearEarnings, earningsMultiplier: em, headline: latest.title, newsAgeHours: ageHours,
      });
    }
  }

  // Orta reaksiyon veya yetersiz veri → izle
  return store({
    status: 'reacting', scoreAdj: 0,
    reason: `Haber reaksiyonu izleniyor (${ageHours.toFixed(0)}sa, ${atrMultiple !== null ? atrMultiple.toFixed(1) + '×ATR' : 'ATR yok'})`,
    nearEarnings, earningsMultiplier: em, headline: latest.title, newsAgeHours: ageHours,
  });
}
