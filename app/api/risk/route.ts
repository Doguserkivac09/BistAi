import { NextResponse } from 'next/server';
import { computeRiskScore } from '@/lib/risk-engine';
import { fetchAllMacroIndicators } from '@/lib/fred';
import { fetchOHLCV } from '@/lib/yahoo';
import { getMarketRegime } from '@/lib/regime-engine';
import type { RiskInputs } from '@/types/macro';

// In-memory cache (15 dakika TTL)
let riskCache: { data: unknown; expiry: number } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * VIX son 20 günlük SMA hesapla.
 */
function computeVixSma20(candles: { close: number }[]): number | null {
  if (!Array.isArray(candles) || candles.length < 20) return null;
  const last20 = candles.slice(-20);
  const sum = last20.reduce((acc, c) => acc + c.close, 0);
  return sum / 20;
}

/**
 * GET /api/risk — Güncel risk skoru döndürür.
 * Cache: 15 dakika.
 */
export async function GET() {
  try {
    // Cache kontrolü
    if (riskCache && Date.now() < riskCache.expiry) {
      return NextResponse.json(riskCache.data);
    }

    // Paralel veri çekimi
    const [macro, vixCandles, bistCandles] = await Promise.all([
      fetchAllMacroIndicators(),
      fetchOHLCV('^VIX', 30),
      fetchOHLCV('^XU100', 250),
    ]);

    // VIX verisi
    const latestVix =
      vixCandles.length > 0 ? vixCandles[vixCandles.length - 1].close : null;
    const vixSma20 = computeVixSma20(vixCandles);

    // BIST rejimi
    const bistRegime = getMarketRegime(bistCandles);

    // Risk girdileri
    const inputs: RiskInputs = {
      vix: latestVix,
      vix_sma20: vixSma20,
      yield_10y: macro.us_10y_yield,
      yield_curve: macro.yield_curve_10y2y,
      dollar_index: macro.dollar_index,
      bist_regime: bistRegime,
    };

    const riskScore = computeRiskScore(inputs);

    const response = {
      ...riskScore,
      inputs: {
        vix: latestVix,
        vix_sma20: vixSma20 ? Math.round(vixSma20 * 100) / 100 : null,
        yield_10y: macro.us_10y_yield,
        yield_curve: macro.yield_curve_10y2y,
        dollar_index: macro.dollar_index,
        bist_regime: bistRegime,
      },
    };

    // Cache'e yaz
    riskCache = {
      data: response,
      expiry: Date.now() + CACHE_TTL_MS,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
