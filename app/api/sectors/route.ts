import { NextResponse } from 'next/server';
import { SECTORS } from '@/lib/sectors';
import { computeSectorMomentum } from '@/lib/sector-engine';
import { computeRiskScore } from '@/lib/risk-engine';
import { fetchAllMacroIndicators } from '@/lib/fred';
import { fetchOHLCV } from '@/lib/yahoo';
import { getMarketRegime } from '@/lib/regime-engine';
import type { RiskInputs, SectorMomentum } from '@/types/macro';

// In-memory cache (15 dakika TTL)
let sectorCache: { data: SectorMomentum[]; expiry: number } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * GET /api/sectors — Tüm sektör momentumlarını döndürür (skor sıralı).
 * Cache: 15 dakika.
 */
export async function GET() {
  try {
    // Cache kontrolü
    if (sectorCache && Date.now() < sectorCache.expiry) {
      return NextResponse.json({ sectors: sectorCache.data });
    }

    // Risk skoru hesapla (macro alignment için)
    const [macro, vixCandles, bistCandles] = await Promise.all([
      fetchAllMacroIndicators(),
      fetchOHLCV('^VIX', 30),
      fetchOHLCV('^XU100', 250),
    ]);

    const latestVix = vixCandles.length > 0 ? vixCandles[vixCandles.length - 1]!.close : null;
    let vixSma20: number | null = null;
    if (vixCandles.length >= 20) {
      const last20 = vixCandles.slice(-20);
      vixSma20 = last20.reduce((acc, c) => acc + c.close, 0) / 20;
    }

    const inputs: RiskInputs = {
      vix: latestVix,
      vix_sma20: vixSma20,
      yield_10y: macro.us_10y_yield,
      yield_curve: macro.yield_curve_10y2y,
      dollar_index: macro.dollar_index,
      bist_regime: getMarketRegime(bistCandles),
    };
    const riskResult = computeRiskScore(inputs);

    // Her sektör için momentum hesapla
    const results: SectorMomentum[] = [];

    for (const sector of SECTORS) {
      // Her sektörden max 5 sembol çek (rate limit dostu)
      const symbolsToFetch = sector.symbols.slice(0, 5);
      const symbolDataList = await Promise.all(
        symbolsToFetch.map(async (symbol) => {
          try {
            const candles = await fetchOHLCV(symbol, 30);
            return { symbol, candles };
          } catch {
            return { symbol, candles: [] };
          }
        })
      );

      const momentum = computeSectorMomentum(
        sector,
        symbolDataList,
        riskResult.score
      );
      results.push(momentum);
    }

    // Skora göre sırala (yüksekten düşüğe)
    results.sort((a, b) => b.score - a.score);

    // Cache'e yaz
    sectorCache = {
      data: results,
      expiry: Date.now() + CACHE_TTL_MS,
    };

    return NextResponse.json({ sectors: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
