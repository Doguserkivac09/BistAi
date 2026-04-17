/**
 * Hisse Kompozit Analiz API
 *
 * GET /api/hisse-analiz?symbol=THYAO
 *
 * Tek hisse için tam analiz paketini döndürür:
 * - Kompozit karar (BUY/HOLD/SELL) + güven
 * - AI açıklaması (Türkçe, makro + sektör bağlamlı)
 * - Fiyat hedefleri (stop-loss, target1, target2, R/R)
 *
 * 1 saatlik in-memory cache (sembol bazlı).
 *
 * Wave 1 — Hisse Detay Sayfası Geliştirme
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { fetchOHLCV, fetchOHLCVByTimeframe, type YahooTimeframe } from '@/lib/yahoo';
import { detectAllSignals } from '@/lib/signals';
import { calculateSRLevels } from '@/lib/support-resistance';
import { computePriceTargets } from '@/lib/price-targets';
import { calculateCompositeSignal } from '@/lib/composite-signal';
import { generateCompositeExplanation } from '@/lib/claude';
import { getMacroScore, getRiskScore } from '@/lib/macro-service';
import { getSectorId, getSymbolsBySector } from '@/lib/sectors';
import { analyzeSector } from '@/lib/sector-engine';
import type { PriceTargets } from '@/lib/price-targets';
import type { CompositeDecision } from '@/lib/composite-signal';

// ── In-memory cache (1 saat TTL) ────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000;
interface CacheEntry {
  data: HisseAnalizResponse;
  expiry: number;
}
const cache = new Map<string, CacheEntry>();

function getCached(key: string): HisseAnalizResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: HisseAnalizResponse): void {
  if (cache.size > 200) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

// ── Response Tipi ───────────────────────────────────────────────────

export interface HisseAnalizResponse {
  sembol: string;
  decision: CompositeDecision;
  decisionTr: string;
  confidence: number;
  compositeScore: number;
  color: string;
  emoji: string;
  explanation: string;
  priceTargets: PriceTargets;
  technicalScore: number;
  macroScore: number;
  sectorScore: number;
  sectorName: string;
  /** Ham teknik sinyal yönü (kompozit karardan bağımsız) */
  signalDirection?: 'yukari' | 'asagi' | 'nötr';
  /** Karar üretilemeyen durumda true */
  noSignal?: boolean;
  /** Hero bölümü için ek meta */
  shortName?: string;
  changePercent?: number;
  currentPrice?: number;
  volume?: number;
  avgVolume20d?: number;
  high90d?: number;
  low90d?: number;
}

// ── Handler ─────────────────────────────────────────────────────────

// Makro/sektör bağlamı gereksiz olan zaman dilimleri (intraday)
const INTRADAY_TFS = new Set<YahooTimeframe>(['15m', '30m', '1h']);

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limit: 30 istek/dakika per IP (AI + Yahoo kullanıyor, pahalı)
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`${ip}:hisse-analiz`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol parametresi gerekli.' }, { status: 400 });
  }

  const rawTf = request.nextUrl.searchParams.get('timeframe') ?? '1d';
  const timeframe: YahooTimeframe = (['15m', '30m', '1h', '1d', '1wk', '1mo'].includes(rawTf)
    ? rawTf : '1d') as YahooTimeframe;
  const isIntraday = INTRADAY_TFS.has(timeframe);

  // Cache key — timeframe dahil
  const cacheKey = `hisse-analiz:${symbol}:${timeframe}`;
  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // 1. OHLCV — zaman dilimine göre veri çek
    let candles: import('@/types').OHLCVCandle[];
    let yahooChangePercent: number | undefined;
    let yahooCurrentPrice: number | undefined;
    let shortName: string | undefined;

    if (timeframe === '1d') {
      // Günlük: fetchOHLCV ile hero meta (shortName, changePercent) de gelir
      const result = await fetchOHLCV(symbol, 252);
      candles = result.candles;
      yahooChangePercent = result.changePercent;
      yahooCurrentPrice  = result.currentPrice;
      shortName          = result.shortName;
    } else {
      // Intraday (15m/30m/1h), haftalık (1wk), aylık (1mo) →
      // fetchOHLCVByTimeframe doğru interval ile çeker
      candles = await fetchOHLCVByTimeframe(symbol, timeframe);
    }

    if (!candles.length) {
      return NextResponse.json({ error: `${symbol} için veri bulunamadı.` }, { status: 404 });
    }

    const lastCandle = candles[candles.length - 1]!;
    const currentPrice = yahooCurrentPrice ?? lastCandle.close;

    // Hero meta — sadece günlük timeframe'de anlamlı
    const last20 = candles.slice(-20);
    const avgVolume20d = Math.round(last20.reduce((s, c) => s + c.volume, 0) / last20.length);
    const high90d = Math.max(...candles.map((c) => c.high));
    const low90d  = Math.min(...candles.map((c) => c.low));

    // 2. Sinyaller — en güçlü sinyali bul
    const signals = detectAllSignals(symbol, candles);
    if (!signals.length) {
      // Sinyal yok: minimal yanıt
      const srAnalysis = calculateSRLevels(candles);
      const priceTargets = computePriceTargets(currentPrice, srAnalysis, 'nötr');
      const noSignalResponse: HisseAnalizResponse = {
        sembol: symbol,
        decision: 'HOLD',
        decisionTr: 'TUT',
        confidence: 0,
        compositeScore: 0,
        color: '#9ca3af',
        emoji: '🟡',
        explanation: `${symbol} için şu an aktif bir teknik sinyal tespit edilemedi.`,
        priceTargets,
        technicalScore: 0,
        macroScore: 0,
        sectorScore: 0,
        sectorName: 'Bilinmiyor',
        noSignal: true,
        shortName,
        changePercent: yahooChangePercent,
        currentPrice,
        volume: lastCandle.volume,
        avgVolume20d,
        high90d,
        low90d,
      };
      return NextResponse.json(noSignalResponse);
    }

    // Güçlü > orta > zayıf sırasıyla seç
    const severityOrder = { 'güçlü': 3, 'orta': 2, 'zayıf': 1 } as Record<string, number>;
    const dominantSignal = signals.sort(
      (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0)
    )[0]!;

    // 3. S/R analizi + fiyat hedefleri
    const srAnalysis = calculateSRLevels(candles);
    const priceTargets = computePriceTargets(currentPrice, srAnalysis, dominantSignal.direction);

    // 4. Makro + Risk + Sektör — intraday için atla (kısa vadede anlamsız)
    let macroScore: Awaited<ReturnType<typeof getMacroScore>> | null = null;
    let riskScore:  Awaited<ReturnType<typeof getRiskScore>>  | null = null;
    let sectorMomentum: ReturnType<typeof analyzeSector> | null = null;

    if (!isIntraday) {
      const sectorId = getSectorId(symbol);
      const sectorSymbols = getSymbolsBySector(sectorId);

      const [macro, risk, sectorData] = await Promise.all([
        getMacroScore().catch(() => null),
        getRiskScore().catch(() => null),
        Promise.all(
          sectorSymbols.slice(0, 5).map(async (sym) => {
            const { candles: c } = await fetchOHLCV(sym, 60).catch(() => ({ candles: [] }));
            return { sym, c };
          })
        ).then((results) => {
          const map: Record<string, import('@/types').OHLCVCandle[]> = {};
          for (const { sym, c } of results) map[sym] = c;
          return map;
        }),
      ]);

      macroScore    = macro;
      riskScore     = risk;
      sectorMomentum = analyzeSector(sectorId, sectorData, macroScore);
    }

    // 5. Kompozit karar
    const composite = calculateCompositeSignal(
      dominantSignal,
      macroScore,
      sectorMomentum,
      riskScore
    );

    // 6. AI açıklaması
    const explanation = await generateCompositeExplanation(
      dominantSignal,
      composite.context,
      composite.compositeScore,
      composite.confidence,
      composite.decisionTr
    );

    const response: HisseAnalizResponse = {
      sembol: symbol,
      decision: composite.decision,
      decisionTr: composite.decisionTr,
      confidence: composite.confidence,
      compositeScore: composite.compositeScore,
      color: composite.color,
      emoji: composite.emoji,
      explanation,
      priceTargets,
      technicalScore: composite.technicalScore,
      macroScore: composite.macroScore,
      sectorScore: composite.sectorScore,
      sectorName: sectorMomentum?.sectorName ?? '—',
      signalDirection: dominantSignal.direction as 'yukari' | 'asagi' | 'nötr',
      shortName,
      changePercent: yahooChangePercent,
      currentPrice,
      volume: lastCandle.volume,
      avgVolume20d,
      high90d,
      low90d,
    };

    setCache(cacheKey, response);
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error(`[hisse-analiz] Hata (${symbol}):`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
