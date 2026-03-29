/**
 * Sektör Momentum Engine — Sektör bazlı fiyat momentum + makro uyum skoru.
 *
 * Phase 5.2
 *
 * Her sektör için:
 * 1. Fiyat momentum (20g ve 60g performans ortalaması)
 * 2. Makro-sektör uyum skoru (makro koşullar × sektör duyarlılığı)
 * 3. Kompozit sektör skoru
 */

import type { OHLCVCandle } from '@/types';
import type { SectorId, SectorInfo, MacroSensitivity } from './sectors';
import type { MacroScoreResult } from './macro-score';
import { SECTORS, getSymbolsBySector, getAllSectors } from './sectors';

// ── Türler ──────────────────────────────────────────────────────────

export interface SectorMomentum {
  sectorId: SectorId;
  sectorName: string;
  shortName: string;
  /** Fiyat momentum skoru: -100 ↔ +100 */
  priceMomentum: number;
  /** 20 günlük ortalama performans (%) */
  perf20d: number;
  /** 60 günlük ortalama performans (%) */
  perf60d: number;
  /** Makro uyum skoru: -100 ↔ +100 */
  macroAlignment: number;
  /** Kompozit sektör skoru: -100 ↔ +100 */
  compositeScore: number;
  /** Sektör sinyali */
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  /** Renk kodu */
  color: string;
  /** Açıklama */
  reasoning: string;
  /** Sektördeki hisse sayısı */
  symbolCount: number;
  /** En iyi/en kötü performans gösteren hisseler */
  topPerformers: SymbolPerformance[];
  bottomPerformers: SymbolPerformance[];
}

export interface SymbolPerformance {
  symbol: string;
  perf20d: number;
}

export interface SectorMomentumSnapshot {
  sectors: SectorMomentum[];
  bestSector: SectorMomentum | null;
  worstSector: SectorMomentum | null;
  calculatedAt: string;
}

// ── Fiyat Momentum Hesaplama ────────────────────────────────────────

/**
 * Bir hissenin OHLCV verisinden performans yüzdesi hesaplar.
 */
function calculatePerformance(candles: OHLCVCandle[], days: number): number | null {
  if (candles.length < days + 1) return null;

  const current = candles[candles.length - 1]?.close;
  const past = candles[candles.length - 1 - days]?.close;

  if (!past || past === 0) return null;
  return roundTo(((current - past) / past) * 100, 2);
}

/**
 * Bir sektörün fiyat momentum skorunu hesaplar.
 * Sektördeki tüm hisselerin 20g ve 60g performans ortalaması.
 *
 * @param sectorData - Sektördeki hisselerin OHLCV verileri (symbol → candles)
 */
export function calculateSectorPriceMomentum(
  sectorData: Record<string, OHLCVCandle[]>
): {
  priceMomentum: number;
  perf20d: number;
  perf60d: number;
  symbolPerformances: SymbolPerformance[];
} {
  const perfs20d: number[] = [];
  const perfs60d: number[] = [];
  const symbolPerformances: SymbolPerformance[] = [];

  for (const [symbol, candles] of Object.entries(sectorData)) {
    if (candles.length < 5) continue;

    const p20 = calculatePerformance(candles, 20);
    const p60 = calculatePerformance(candles, 60);

    if (p20 !== null) {
      perfs20d.push(p20);
      symbolPerformances.push({ symbol, perf20d: p20 });
    }
    if (p60 !== null) perfs60d.push(p60);
  }

  const perf20d = perfs20d.length > 0
    ? roundTo(perfs20d.reduce((s, p) => s + p, 0) / perfs20d.length, 2)
    : 0;

  const perf60d = perfs60d.length > 0
    ? roundTo(perfs60d.reduce((s, p) => s + p, 0) / perfs60d.length, 2)
    : 0;

  // Momentum skoru: ağırlıklı 20g (%60) + 60g (%40), tanh normalize
  const rawMomentum = perf20d * 0.6 + perf60d * 0.4;
  const priceMomentum = clampScore(Math.tanh(rawMomentum / 15) * 100);

  // Performansa göre sırala
  symbolPerformances.sort((a, b) => b.perf20d - a.perf20d);

  return { priceMomentum, perf20d, perf60d, symbolPerformances };
}

// ── Makro-Sektör Uyum Hesaplama ─────────────────────────────────────

/**
 * Makro koşullar ile sektör duyarlılığı arasındaki uyumu hesaplar.
 *
 * Mantık:
 * - Makro skor pozitif + sektör globalGrowthSensitive yüksek → uyum yüksek
 * - Faiz düşüyor + sektör benefitsFromRateCut yüksek → uyum yüksek
 * - TL zayıflıyor + sektör benefitsFromWeakTRY yüksek → uyum yüksek
 * - Risk yüksek + sektör defensive yüksek → uyum yüksek
 */
export function calculateMacroAlignment(
  sensitivity: MacroSensitivity,
  macroScore: MacroScoreResult | null,
  macroConditions?: {
    rateDirection?: 'cutting' | 'hiking' | 'hold';
    tryDirection?: 'weakening' | 'strengthening' | 'stable';
    riskLevel?: 'low' | 'medium' | 'high';
  }
): { score: number; reasoning: string } {
  if (!macroScore) {
    return { score: 0, reasoning: 'Makro veri mevcut değil' };
  }

  let score = 0;
  const reasons: string[] = [];

  // 1. Genel makro skor × büyüme duyarlılığı
  const growthContrib = (macroScore.score / 100) * sensitivity.globalGrowthSensitive * 30;
  score += growthContrib;
  if (Math.abs(growthContrib) > 5) {
    reasons.push(
      growthContrib > 0
        ? 'Makro rüzgar sektör lehine'
        : 'Makro rüzgar sektör aleyhine'
    );
  }

  // 2. Faiz yönü × sektör duyarlılığı
  const conditions = macroConditions ?? inferConditionsFromScore(macroScore);
  if (conditions.rateDirection === 'cutting') {
    const rateContrib = sensitivity.benefitsFromRateCut * 25;
    score += rateContrib;
    if (rateContrib > 5) reasons.push('Faiz indirimi sektöre olumlu');
  } else if (conditions.rateDirection === 'hiking') {
    const rateContrib = -sensitivity.benefitsFromRateCut * 15;
    score += rateContrib;
    if (rateContrib < -5) reasons.push('Faiz artışı sektöre olumsuz');
  }

  // 3. TRY yönü × sektör duyarlılığı
  if (conditions.tryDirection === 'weakening') {
    const tryContrib = sensitivity.benefitsFromWeakTRY * 20;
    score += tryContrib;
    if (Math.abs(tryContrib) > 5) {
      reasons.push(
        tryContrib > 0
          ? 'TL zayıflaması sektöre olumlu (ihracat)'
          : 'TL zayıflaması sektöre olumsuz (ithalat maliyeti)'
      );
    }
  }

  // 4. Risk seviyesi × defansiflik
  if (conditions.riskLevel === 'high') {
    const defContrib = sensitivity.defensive * 20;
    score += defContrib;
    if (defContrib > 5) reasons.push('Risk-off ortamda defansif sektör avantajlı');
    if (defContrib < -5) reasons.push('Risk-off ortamda döngüsel sektör dezavantajlı');
  }

  return {
    score: clampScore(score),
    reasoning: reasons.length > 0 ? reasons.join('. ') : 'Makro koşullar nötr',
  };
}

/**
 * Makro skor bileşenlerinden makro koşulları çıkarır.
 */
function inferConditionsFromScore(macroScore: MacroScoreResult): {
  rateDirection: 'cutting' | 'hiking' | 'hold';
  tryDirection: 'weakening' | 'strengthening' | 'stable';
  riskLevel: 'low' | 'medium' | 'high';
} {
  // Bileşenlerden TCMB faiz yönünü bul
  const tcmbComp = macroScore.components.find((c) => c.name === 'TCMB Faiz');
  let rateDirection: 'cutting' | 'hiking' | 'hold' = 'hold';
  if (tcmbComp) {
    if (tcmbComp.detail.includes('indirildi')) rateDirection = 'cutting';
    else if (tcmbComp.detail.includes('artırıldı')) rateDirection = 'hiking';
  }

  // USD/TRY yönü
  const usdtryComp = macroScore.components.find((c) => c.name === 'USD/TRY');
  let tryDirection: 'weakening' | 'strengthening' | 'stable' = 'stable';
  if (usdtryComp) {
    if (usdtryComp.rawScore < -15) tryDirection = 'weakening';
    else if (usdtryComp.rawScore > 15) tryDirection = 'strengthening';
  }

  // Risk seviyesi (VIX + CDS'den)
  const vixComp = macroScore.components.find((c) => c.name === 'VIX');
  const cdsComp = macroScore.components.find((c) => c.name === 'CDS 5Y');
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';
  const avgRisk = [vixComp?.rawScore ?? 0, cdsComp?.rawScore ?? 0];
  const avgRiskScore = avgRisk.reduce((s, r) => s + r, 0) / avgRisk.length;
  if (avgRiskScore < -30) riskLevel = 'high';
  else if (avgRiskScore > 20) riskLevel = 'low';

  return { rateDirection, tryDirection, riskLevel };
}

// ── Kompozit Sektör Skoru ───────────────────────────────────────────

/**
 * Tek bir sektör için tam momentum analizi yapar.
 */
export function analyzeSector(
  sectorId: SectorId,
  sectorData: Record<string, OHLCVCandle[]>,
  macroScore: MacroScoreResult | null
): SectorMomentum {
  const sectorInfo = SECTORS[sectorId];
  const symbols = getSymbolsBySector(sectorId);

  // Fiyat momentum
  const { priceMomentum, perf20d, perf60d, symbolPerformances } =
    calculateSectorPriceMomentum(sectorData);

  // Makro uyum
  const { score: macroAlignment, reasoning } =
    calculateMacroAlignment(sectorInfo.macroSensitivity, macroScore);

  // Kompozit: Fiyat Momentum (%60) + Makro Uyum (%40)
  const compositeScore = clampScore(
    priceMomentum * 0.6 + macroAlignment * 0.4
  );

  // Sinyal
  const signal = getSignal(compositeScore);
  const color = getColor(compositeScore);

  return {
    sectorId,
    sectorName: sectorInfo.name,
    shortName: sectorInfo.shortName,
    priceMomentum,
    perf20d,
    perf60d,
    macroAlignment,
    compositeScore,
    signal,
    color,
    reasoning,
    symbolCount: symbols.length,
    topPerformers: symbolPerformances.slice(0, 3),
    bottomPerformers: symbolPerformances.slice(-3).reverse(),
  };
}

/**
 * Tüm sektörler için momentum analizi yapar.
 * NOT: sectorDataMap'in doldurulması çağıran tarafın sorumluluğundadır.
 */
export function analyzeAllSectors(
  sectorDataMap: Record<SectorId, Record<string, OHLCVCandle[]>>,
  macroScore: MacroScoreResult | null
): SectorMomentumSnapshot {
  const allSectors = getAllSectors();

  const sectors: SectorMomentum[] = allSectors
    .map((s) => {
      const data = sectorDataMap[s.id] ?? {};
      return analyzeSector(s.id, data, macroScore);
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);

  return {
    sectors,
    bestSector: sectors[0] ?? null,
    worstSector: sectors[sectors.length - 1] ?? null,
    calculatedAt: new Date().toISOString(),
  };
}

// ── Yardımcı ────────────────────────────────────────────────────────

function clampScore(score: number): number {
  return Math.max(-100, Math.min(100, Math.round(score)));
}

function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

function getSignal(score: number): SectorMomentum['signal'] {
  if (score >= 40) return 'strong_buy';
  if (score >= 15) return 'buy';
  if (score <= -40) return 'strong_sell';
  if (score <= -15) return 'sell';
  return 'neutral';
}

function getColor(score: number): string {
  if (score >= 40) return '#16a34a';      // green-600
  if (score >= 15) return '#4ade80';      // green-400
  if (score <= -40) return '#dc2626';     // red-600
  if (score <= -15) return '#f87171';     // red-400
  return '#9ca3af';                        // gray-400
}
