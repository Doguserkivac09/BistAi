/**
 * Risk Engine — Formula-based risk score (0-100).
 * 4 bileşen × 25 puan = toplam risk skoru.
 *
 * Yüksek skor = yüksek risk (risk-off), düşük skor = düşük risk (risk-on).
 */

import type { RiskInputs, RiskScore } from '@/types/macro';

// --- VIX Bileşeni (0-25) ---
// VIX < 15 → 0 (sakin piyasa), VIX > 35 → 25 (panik)
function computeVixComponent(vix: number | null, vixSma20: number | null): number {
  if (vix == null || !Number.isFinite(vix)) return 12.5; // nötr

  // Temel VIX skoru (0-20)
  let score = 0;
  if (vix <= 15) score = 0;
  else if (vix >= 35) score = 20;
  else score = ((vix - 15) / 20) * 20;

  // VIX > SMA20 → ek 5 puan (volatilite artışı)
  if (vixSma20 != null && Number.isFinite(vixSma20) && vixSma20 > 0) {
    if (vix > vixSma20 * 1.1) score += 5;
    else if (vix > vixSma20) score += 2.5;
  }

  return Math.min(25, Math.max(0, score));
}

// --- Yield Curve Bileşeni (0-25) ---
// Negatif eğri → resesyon sinyali → yüksek risk
// T10Y2Y: pozitif = normal, negatif = ters (inverted)
function computeYieldComponent(
  yield10y: number | null,
  yieldCurve: number | null
): number {
  let score = 0;

  // Yield curve (10Y-2Y spread)
  if (yieldCurve != null && Number.isFinite(yieldCurve)) {
    if (yieldCurve < -0.5) score += 20;       // derin inversiyon
    else if (yieldCurve < 0) score += 15;      // inversiyon
    else if (yieldCurve < 0.5) score += 8;     // düzleşme
    else score += 0;                           // normal eğri
  } else {
    score += 8; // nötr
  }

  // 10Y yield seviyesi (yüksek = sıkılaşma)
  if (yield10y != null && Number.isFinite(yield10y)) {
    if (yield10y > 5) score += 5;
    else if (yield10y > 4) score += 3;
    else score += 0;
  }

  return Math.min(25, Math.max(0, score));
}

// --- Döviz/Dolar Bileşeni (0-25) ---
// DXY güçlenme → gelişmekte olan piyasalar (BIST) için risk
function computeCurrencyComponent(dollarIndex: number | null): number {
  if (dollarIndex == null || !Number.isFinite(dollarIndex)) return 12.5; // nötr

  // DXY 90-110 aralığında normalize et
  if (dollarIndex >= 108) return 25;
  if (dollarIndex <= 92) return 0;
  return ((dollarIndex - 92) / 16) * 25;
}

// --- Rejim Bileşeni (0-25) ---
// BIST piyasa rejimi: bull → düşük risk, bear → yüksek risk
function computeRegimeComponent(
  regime: 'bull_trend' | 'bear_trend' | 'sideways'
): number {
  switch (regime) {
    case 'bull_trend':
      return 5;
    case 'sideways':
      return 12.5;
    case 'bear_trend':
      return 22;
    default:
      return 12.5;
  }
}

/**
 * Ana risk skoru hesaplama fonksiyonu.
 * Pure function — side effect yok.
 */
export function computeRiskScore(inputs: RiskInputs): RiskScore {
  const vix_component = computeVixComponent(inputs.vix, inputs.vix_sma20);
  const yield_component = computeYieldComponent(inputs.yield_10y, inputs.yield_curve);
  const currency_component = computeCurrencyComponent(inputs.dollar_index);
  const regime_component = computeRegimeComponent(inputs.bist_regime);

  const score = Math.round(
    vix_component + yield_component + currency_component + regime_component
  );

  const clampedScore = Math.min(100, Math.max(0, score));

  let status: RiskScore['status'];
  if (clampedScore <= 35) status = 'risk-on';
  else if (clampedScore <= 65) status = 'neutral';
  else status = 'risk-off';

  return {
    score: clampedScore,
    status,
    components: {
      vix_component: Math.round(vix_component * 10) / 10,
      yield_component: Math.round(yield_component * 10) / 10,
      currency_component: Math.round(currency_component * 10) / 10,
      regime_component: Math.round(regime_component * 10) / 10,
    },
    timestamp: new Date().toISOString(),
  };
}
