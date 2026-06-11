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
import { fetchOHLCVUS } from '@/lib/yahoo-us';
import { isUSSymbol } from '@/lib/us-symbols';
import { detectAllSignals } from '@/lib/signals';
import { getMarketRegime } from '@/lib/regime-engine';
import { calculateSRLevels } from '@/lib/support-resistance';
import { computePriceTargets } from '@/lib/price-targets';
import { calculateCompositeSignal } from '@/lib/composite-signal';
import { generateCompositeExplanation } from '@/lib/claude';
import { getMacroScore, getRiskScore } from '@/lib/macro-service';
import { getSectorId, getSymbolsBySector } from '@/lib/sectors';
import { analyzeSector } from '@/lib/sector-engine';
import {
  computeDecision,
  toLegacyCompositeScore,
  toLegacyDecision,
  type DecisionOutput,
} from '@/lib/decision-engine';
import { SIGNAL_CANONICAL_FIELD } from '@/lib/signal-horizons';
import type { SymbolCatalyst, SymbolEventRisk } from '@/lib/news-impact';
import type { PriceTargets } from '@/lib/price-targets';
import type { CompositeDecision } from '@/lib/composite-signal';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
  /** Birleşik karar motoru çıktısı — tüm sinyalleri dikkate alır (dominant bug FIX'i) */
  decisionEngine?: DecisionOutput;
}

// ── Geçmiş win rate (decision engine girdisi) ──────────────────────
// Canonical horizon — tek kaynak: lib/signal-horizons (BUG-A: yerel kopya silindi)

const COMMISSION = 0.004;
const WR_STATS_LOOKBACK_D = 180;

async function fetchHistoricalWinRate(
  signalType: string,
  direction: string,
  market: 'BIST' | 'US',
): Promise<{ winRate: number; n: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;

  const field = SIGNAL_CANONICAL_FIELD[signalType];
  if (!field) return null;

  try {
    const supabase = createSupabaseClient(url, key);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - WR_STATS_LOOKBACK_D);
    // Market filtresi (BUG-B): US kayıtları BIST win-rate'ini kirletmesin (ve tersi)
    let query = supabase
      .from('signal_performance')
      .select(`signal_type, direction, ${field}`)
      .eq('evaluated', true)
      .eq('signal_type', signalType)
      .gte('entry_time', cutoff.toISOString());
    query = market === 'US'
      ? query.eq('market', 'US')
      : query.or('market.eq.BIST,market.is.null');
    const { data, error } = await query.limit(500);
    if (error || !data) return null;

    const valid = data.filter((r: Record<string, unknown>) => {
      const v = r[field] as number | null | undefined;
      return v != null && Number.isFinite(v);
    });
    if (valid.length < 5) return null;

    let wins = 0;
    for (const r of valid) {
      const rec = r as Record<string, unknown>;
      const raw = rec[field] as number;
      const dirAdj = (rec.direction as string) === 'asagi' ? -raw : raw;
      if (dirAdj - COMMISSION > 0) wins++;
    }
    // direction parametresi şimdilik döngüsel analiz için tutuldu; canonical field aynı kalır
    void direction;
    return { winRate: wins / valid.length, n: valid.length };
  } catch {
    return null;
  }
}

// ── Haber katalisti + KAP-tipi event riski (BUG-C: firsatlar ile girdi eşitliği) ──
// news-catalyst cron'unun ai_cache'e yazdığı tek satırdan okunur — fan-out yok.
// Sembol top-70 fırsat listesinde yoksa null döner (katalist faktörü 0 kalır).
async function fetchSymbolCatalystContext(
  sembol: string,
): Promise<{ catalyst: SymbolCatalyst | null; eventRisk: SymbolEventRisk | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return { catalyst: null, eventRisk: null };

  try {
    const supabase = createSupabaseClient(url, key);
    const { data } = await supabase
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', 'news-catalyst:BIST')
      .gt('expires_at', new Date().toISOString())
      .single();
    if (!data?.explanation) return { catalyst: null, eventRisk: null };

    const parsed = JSON.parse(data.explanation) as {
      items?: Record<string, SymbolCatalyst>;
      eventRisks?: Record<string, SymbolEventRisk>;
    };
    return {
      catalyst: parsed.items?.[sembol] ?? null,
      eventRisk: parsed.eventRisks?.[sembol] ?? null,
    };
  } catch {
    return { catalyst: null, eventRisk: null };
  }
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

  // US sembol tespiti — market param veya us-symbols listesi
  const marketParam = request.nextUrl.searchParams.get('market') ?? 'BIST';
  const isUS = marketParam === 'US' || isUSSymbol(symbol);

  // Cache key — timeframe + market dahil
  const cacheKey = `hisse-analiz:${symbol}:${timeframe}:${isUS ? 'US' : 'BIST'}`;
  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // 1. OHLCV — zaman dilimine göre veri çek
    let candles: import('@/types').OHLCVCandle[];
    let yahooChangePercent: number | undefined;
    let yahooCurrentPrice: number | undefined;
    let shortName: string | undefined;

    if (isUS) {
      // US hisseleri: .IS suffix olmadan Yahoo'dan çek
      const result = await fetchOHLCVUS(symbol, 252);
      candles = result.candles;
      yahooChangePercent = result.changePercent;
      yahooCurrentPrice  = result.currentPrice;
      shortName          = result.shortName;
    } else if (timeframe === '1d') {
      // BIST günlük: fetchOHLCV ile hero meta (shortName, changePercent) de gelir
      const result = await fetchOHLCV(symbol, 252);
      candles = result.candles;
      yahooChangePercent = result.changePercent;
      yahooCurrentPrice  = result.currentPrice;
      shortName          = result.shortName;
    } else {
      // Intraday (15m/30m/1h), haftalık (1wk), aylık (1mo)
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

    // Lead signal — SADECE AI açıklaması ve price target yönü için (karar için DEĞİL)
    // Gerçek karar ALL signals üzerinden computeDecision ile üretilir.
    const severityOrder = { 'güçlü': 3, 'orta': 2, 'zayıf': 1 } as Record<string, number>;
    const dominantSignal = [...signals].sort(
      (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0)
    )[0]!;

    // 3. S/R analizi + fiyat hedefleri (yön computeDecision sonrası belirlenecek)
    const srAnalysis = calculateSRLevels(candles);

    // 4. Makro + Risk + Sektör + Rejim — intraday için atla (kısa vadede anlamsız)
    let macroScore: Awaited<ReturnType<typeof getMacroScore>> | null = null;
    let riskScore:  Awaited<ReturnType<typeof getRiskScore>>  | null = null;
    let sectorMomentum: ReturnType<typeof analyzeSector> | null = null;
    let regime: string | null = null;

    if (!isIntraday && !isUS) {
      // BIST-specific: sektör analizi, XU100 rejimi
      const sectorId = getSectorId(symbol);
      const sectorSymbols = getSymbolsBySector(sectorId);

      const [macro, risk, sectorData, xu100] = await Promise.all([
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
        fetchOHLCV('XU100', 252).then((r) => r.candles).catch(() => []),
      ]);

      macroScore    = macro;
      riskScore     = risk;
      sectorMomentum = analyzeSector(sectorId, sectorData, macroScore);
      regime = xu100.length > 0 ? getMarketRegime(xu100) : null;
    } else if (!isIntraday && isUS) {
      // US: sadece global makro, sektör analizi yok
      macroScore = await getMacroScore().catch(() => null);
    }

    // 4b. Geçmiş win rate + haber katalisti/event riski (BIST, intraday hariç)
    // BUG-C fix: catalyst + kapRisk artık burada da veriliyor — /api/firsatlar ile
    // aynı girdi seti → aynı hisse iki sayfada aynı skor.
    const [historicalWinRate, catalystCtx] = await Promise.all([
      fetchHistoricalWinRate(dominantSignal.type, dominantSignal.direction, isUS ? 'US' : 'BIST'),
      (!isIntraday && !isUS)
        ? fetchSymbolCatalystContext(symbol)
        : Promise.resolve({ catalyst: null, eventRisk: null }),
    ]);

    // Göreli hacim (5g) — scan-cache cron'daki formülün canlı eşdeğeri (girdi eşitliği)
    let relVol5: number | null = null;
    if (candles.length >= 6) {
      const lastVol = candles[candles.length - 1]?.volume ?? 0;
      const prev5 = candles.slice(-6, -1);
      const avg5 = prev5.reduce((s, c) => s + c.volume, 0) / prev5.length;
      if (avg5 > 0) relVol5 = parseFloat((lastVol / avg5).toFixed(2));
    }

    // 5. BİRLEŞİK KARAR — tüm sinyaller dikkate alınır (dominant-signal bug FIX)
    const decisionOut = computeDecision({
      signals,
      macroScore,
      sectorMomentum,
      riskScore,
      historicalWinRate,
      kapRisk: catalystCtx.eventRisk ? { var: true, mesaj: catalystCtx.eventRisk.baslik } : null,
      catalyst: catalystCtx.catalyst,
      regime,
      relVol5,
      scannedAt: new Date().toISOString(),
      dataSource: 'live',
    });

    // 5b. Fiyat hedefleri — karar yönüne göre (tek sinyale göre değil)
    const priceDirection: 'yukari' | 'asagi' | 'nötr' =
      decisionOut.direction === 'yukari' ? 'yukari' :
      decisionOut.direction === 'asagi'  ? 'asagi'  : 'nötr';
    const priceTargets = computePriceTargets(currentPrice, srAnalysis, priceDirection);

    // 6. Legacy kompozit — AI açıklama context'i + geri uyumluluk alanları için
    // (UI'da eski kompozit alanları hala tüketiliyor; bunları decisionOut'tan türetiyoruz)
    const legacyComposite = calculateCompositeSignal(
      dominantSignal,
      macroScore,
      sectorMomentum,
      riskScore
    );

    // 7. AI açıklaması — lead signal üzerinden context, ama skor/karar birleşik motordan
    const explanation = await generateCompositeExplanation(
      dominantSignal,
      legacyComposite.context,
      toLegacyCompositeScore(decisionOut.score, decisionOut.direction),
      decisionOut.confidence,
      decisionOut.rating,
    );

    const response: HisseAnalizResponse = {
      sembol: symbol,
      decision: toLegacyDecision(decisionOut.rating),
      decisionTr: decisionOut.rating,
      confidence: decisionOut.confidence,
      compositeScore: toLegacyCompositeScore(decisionOut.score, decisionOut.direction),
      color: legacyComposite.color,
      emoji: legacyComposite.emoji,
      explanation,
      priceTargets,
      technicalScore: legacyComposite.technicalScore,
      macroScore: legacyComposite.macroScore,
      sectorScore: legacyComposite.sectorScore,
      sectorName: sectorMomentum?.sectorName ?? '—',
      signalDirection: priceDirection,
      shortName,
      changePercent: yahooChangePercent,
      currentPrice,
      volume: lastCandle.volume,
      avgVolume20d,
      high90d,
      low90d,
      decisionEngine: decisionOut,
    };

    setCache(cacheKey, response);
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error(`[hisse-analiz] Hata (${symbol}):`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
