/**
 * Sector Momentum Engine.
 * Her sektör için momentum skoru hesaplar:
 *   score = 0.5 × price_momentum + 0.3 × volume_flow + 0.2 × macro_alignment
 */

import type { OHLCVCandle } from '@/types';
import type { SectorMomentum } from '@/types/macro';
import type { SectorDefinition } from '@/lib/sectors';

interface SymbolData {
  symbol: string;
  candles: OHLCVCandle[];
}

/**
 * Fiyat momentumu: Son 5 günlük ortalama getiri vs son 20 günlük.
 * Pozitif = yukarı momentum, negatif = aşağı.
 * Normalize: -100 ile +100 arası.
 */
function computePriceMomentum(candles: OHLCVCandle[]): number {
  if (candles.length < 20) return 0;

  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1]!;
  const fiveDaysAgo = closes[closes.length - 6];
  const twentyDaysAgo = closes[closes.length - 21];

  if (!fiveDaysAgo || !twentyDaysAgo || fiveDaysAgo <= 0 || twentyDaysAgo <= 0) return 0;

  const shortReturn = (last - fiveDaysAgo) / fiveDaysAgo;
  const longReturn = (last - twentyDaysAgo) / twentyDaysAgo;

  // Kısa vadeli momentuma ağırlık ver, normalize et
  const raw = shortReturn * 0.6 + longReturn * 0.4;
  return Math.max(-100, Math.min(100, raw * 500)); // ±20% → ±100
}

/**
 * Hacim akışı: Son 5 günlük ortalama hacim vs 20 günlük ortalama.
 * > 1 = hacim artışı (momentum destekli), < 1 = hacim düşüşü.
 */
function computeVolumeFlow(candles: OHLCVCandle[]): number {
  if (candles.length < 20) return 0;

  const volumes = candles.map((c) => c.volume);
  const recent5 = volumes.slice(-5);
  const last20 = volumes.slice(-20);

  const avgRecent = recent5.reduce((a, b) => a + b, 0) / recent5.length;
  const avgLong = last20.reduce((a, b) => a + b, 0) / last20.length;

  if (avgLong <= 0) return 0;

  const ratio = avgRecent / avgLong;
  // ratio 0.5-2.0 → -100 ile +100 arası
  return Math.max(-100, Math.min(100, (ratio - 1) * 200));
}

/**
 * Makro uyum: Risk skoru düşükse (risk-on) → pozitif, yüksekse → negatif.
 * riskScore 0-100 → macro_alignment -100 ile +100.
 */
function computeMacroAlignment(riskScore: number): number {
  // Risk 0 → +100 (tam uyum), Risk 100 → -100 (tam uyumsuz)
  return 100 - riskScore * 2;
}

/**
 * Tek bir sembolün performans özeti.
 */
function getSymbolPerformance(candles: OHLCVCandle[]): number {
  if (candles.length < 2) return 0;
  const first = candles[0]!.close;
  const last = candles[candles.length - 1]!.close;
  if (first <= 0) return 0;
  return ((last - first) / first) * 100;
}

/**
 * Sektör momentum skoru hesapla.
 * Pure function.
 */
export function computeSectorMomentum(
  sector: SectorDefinition,
  symbolDataList: SymbolData[],
  riskScore: number,
  signalCount: number = 0
): SectorMomentum {
  // Her sembol için momentum hesapla
  const momentums: number[] = [];
  const volumes: number[] = [];
  const performances: { symbol: string; perf: number }[] = [];

  for (const { symbol, candles } of symbolDataList) {
    if (candles.length < 5) continue;

    momentums.push(computePriceMomentum(candles));
    volumes.push(computeVolumeFlow(candles));
    performances.push({ symbol, perf: getSymbolPerformance(candles) });
  }

  // Ortalama al
  const avgMomentum = momentums.length > 0
    ? momentums.reduce((a, b) => a + b, 0) / momentums.length
    : 0;
  const avgVolume = volumes.length > 0
    ? volumes.reduce((a, b) => a + b, 0) / volumes.length
    : 0;
  const macroAlignment = computeMacroAlignment(riskScore);

  // Ağırlıklı skor (-100 ile +100 arası)
  const rawScore = avgMomentum * 0.5 + avgVolume * 0.3 + macroAlignment * 0.2;
  const score = Math.round(Math.max(-100, Math.min(100, rawScore)));

  // En iyi / en kötü performans
  const sorted = [...performances].sort((a, b) => b.perf - a.perf);
  const topPerformer = sorted[0]?.symbol ?? '-';
  const worstPerformer = sorted[sorted.length - 1]?.symbol ?? '-';

  // Signal density = aktif sinyal sayısı / toplam üye
  const density = sector.symbols.length > 0
    ? Math.round((signalCount / sector.symbols.length) * 100) / 100
    : 0;

  return {
    sector_id: sector.id,
    sector_name: sector.name,
    score,
    price_momentum: Math.round(avgMomentum),
    volume_flow: Math.round(avgVolume),
    macro_alignment: Math.round(macroAlignment),
    member_count: sector.symbols.length,
    top_performer: topPerformer,
    worst_performer: worstPerformer,
    signal_density: density,
  };
}
