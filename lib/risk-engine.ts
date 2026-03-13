/**
 * Risk Score Engine — Piyasa risk skoru hesaplama.
 * VIX + CDS + USD/TRY volatilite → 0-100 risk skoru
 *
 * Phase 5.3
 *
 * Risk Seviyeleri:
 *   0-25:  Düşük Risk   (🟢 yeşil)
 *  25-50:  Orta Risk     (🟡 sarı)
 *  50-75:  Yüksek Risk   (🟠 turuncu)
 *  75-100: Kritik Risk   (🔴 kırmızı)
 */

import type { MacroSnapshot, MacroQuote } from './macro-data';
import type { TurkeyMacroData } from './turkey-macro';

// ── Türler ──────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskScoreResult {
  /** Toplam risk skoru: 0 (güvenli) ↔ 100 (çok riskli) */
  score: number;
  /** Risk seviyesi */
  level: RiskLevel;
  /** Renk kodu */
  color: string;
  /** Türkçe etiket */
  label: string;
  /** Emoji */
  emoji: string;
  /** Risk bileşenleri */
  components: RiskComponent[];
  /** Yatırımcı için öneri */
  recommendation: string;
  /** Hesaplama zamanı */
  calculatedAt: string;
}

export interface RiskComponent {
  name: string;
  weight: number;
  score: number;         // 0-100 (bireysel risk)
  weightedScore: number;
  detail: string;
}

// ── Ağırlıklar ──────────────────────────────────────────────────────

const RISK_WEIGHTS = {
  VIX:          0.25,   // Global korku
  CDS:          0.25,   // Türkiye ülke riski
  USDTRY_VOL:   0.20,   // Kur volatilitesi
  US10Y:        0.15,   // ABD tahvil faizi
  DXY:          0.15,   // Dolar gücü
} as const;

// ── Ana Risk Hesaplama ──────────────────────────────────────────────

/**
 * Piyasa risk skorunu hesaplar.
 */
export function calculateRiskScore(
  macroSnapshot: MacroSnapshot | null,
  turkeyData: TurkeyMacroData | null
): RiskScoreResult {
  const components: RiskComponent[] = [];

  // 1. VIX Risk
  if (macroSnapshot?.vix) {
    const vixScore = calculateVixRisk(macroSnapshot.vix);
    components.push({
      name: 'VIX',
      weight: RISK_WEIGHTS.VIX,
      score: vixScore.score,
      weightedScore: vixScore.score * RISK_WEIGHTS.VIX,
      detail: vixScore.detail,
    });
  }

  // 2. CDS Risk
  if (turkeyData?.cds5y) {
    const cdsValue = turkeyData.cds5y.value;
    const cdsScore = calculateCdsRisk(cdsValue);
    components.push({
      name: 'CDS 5Y',
      weight: RISK_WEIGHTS.CDS,
      score: cdsScore.score,
      weightedScore: cdsScore.score * RISK_WEIGHTS.CDS,
      detail: cdsScore.detail,
    });
  }

  // 3. USD/TRY Volatilite Risk
  if (macroSnapshot?.usdtry) {
    const usdtryScore = calculateUsdtryVolRisk(macroSnapshot.usdtry);
    components.push({
      name: 'USD/TRY Vol',
      weight: RISK_WEIGHTS.USDTRY_VOL,
      score: usdtryScore.score,
      weightedScore: usdtryScore.score * RISK_WEIGHTS.USDTRY_VOL,
      detail: usdtryScore.detail,
    });
  }

  // 4. US 10Y Yield Risk
  if (macroSnapshot?.us10y) {
    const us10yScore = calculateUs10yRisk(macroSnapshot.us10y);
    components.push({
      name: 'US 10Y',
      weight: RISK_WEIGHTS.US10Y,
      score: us10yScore.score,
      weightedScore: us10yScore.score * RISK_WEIGHTS.US10Y,
      detail: us10yScore.detail,
    });
  }

  // 5. DXY Risk
  if (macroSnapshot?.dxy) {
    const dxyScore = calculateDxyRisk(macroSnapshot.dxy);
    components.push({
      name: 'DXY',
      weight: RISK_WEIGHTS.DXY,
      score: dxyScore.score,
      weightedScore: dxyScore.score * RISK_WEIGHTS.DXY,
      detail: dxyScore.detail,
    });
  }

  // Ağırlık normalizasyonu
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  let finalScore: number;

  if (totalWeight === 0) {
    finalScore = 50; // Veri yoksa orta risk
  } else {
    finalScore = Math.round(
      components.reduce((sum, c) => sum + c.score * (c.weight / totalWeight), 0)
    );
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  const level = getRiskLevel(finalScore);
  const color = getRiskColor(level);
  const label = getRiskLabel(level);
  const emoji = getRiskEmoji(level);
  const recommendation = getRiskRecommendation(level, components);

  return {
    score: finalScore,
    level,
    color,
    label,
    emoji,
    components,
    recommendation,
    calculatedAt: new Date().toISOString(),
  };
}

// ── Bireysel Risk Hesaplamaları ─────────────────────────────────────

function calculateVixRisk(vix: MacroQuote): { score: number; detail: string } {
  const { price, changePercent } = vix;

  // VIX seviyeleri:
  // <15: çok düşük risk, 15-20: normal, 20-30: yüksek, 30+: panik
  let levelRisk: number;
  if (price < 12) levelRisk = 5;
  else if (price < 15) levelRisk = 15;
  else if (price < 20) levelRisk = 30;
  else if (price < 25) levelRisk = 50;
  else if (price < 30) levelRisk = 70;
  else if (price < 40) levelRisk = 85;
  else levelRisk = 95;

  // Trend risk: VIX hızla yükseliyorsa ekstra risk
  const trendRisk = Math.max(0, changePercent * 2);

  const score = Math.min(100, Math.round(levelRisk + trendRisk));

  let detail: string;
  if (price < 15) detail = `${price.toFixed(1)} — Piyasa sakin`;
  else if (price < 20) detail = `${price.toFixed(1)} — Normal risk`;
  else if (price < 30) detail = `${price.toFixed(1)} — Artan korku`;
  else detail = `${price.toFixed(1)} — Panik seviyesi!`;

  return { score, detail };
}

function calculateCdsRisk(cdsValue: number): { score: number; detail: string } {
  // CDS seviyeleri (bps):
  // <150: düşük, 150-250: normal, 250-400: yüksek, 400+: kritik
  let score: number;
  if (cdsValue < 100) score = 10;
  else if (cdsValue < 150) score = 20;
  else if (cdsValue < 200) score = 35;
  else if (cdsValue < 250) score = 45;
  else if (cdsValue < 300) score = 55;
  else if (cdsValue < 400) score = 70;
  else if (cdsValue < 500) score = 85;
  else score = 95;

  let detail: string;
  if (cdsValue < 200) detail = `${cdsValue} bps — Düşük ülke riski`;
  else if (cdsValue < 300) detail = `${cdsValue} bps — Orta ülke riski`;
  else if (cdsValue < 400) detail = `${cdsValue} bps — Yüksek ülke riski`;
  else detail = `${cdsValue} bps — Kritik ülke riski!`;

  return { score, detail };
}

function calculateUsdtryVolRisk(usdtry: MacroQuote): { score: number; detail: string } {
  const { changePercent } = usdtry;
  const absChange = Math.abs(changePercent);

  // Günlük kur hareketine göre risk:
  // <0.5%: düşük, 0.5-1%: normal, 1-2%: yüksek, 2%+: çok yüksek
  let score: number;
  if (absChange < 0.3) score = 10;
  else if (absChange < 0.5) score = 25;
  else if (absChange < 1.0) score = 40;
  else if (absChange < 1.5) score = 60;
  else if (absChange < 2.0) score = 75;
  else score = 90;

  // TL'nin zayıflaması ek risk
  if (changePercent > 0.5) score = Math.min(100, score + 10);

  const detail = `Günlük değişim: ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}% — ${
    absChange < 0.5 ? 'Stabil kur' :
    absChange < 1.0 ? 'Normal oynaklık' :
    absChange < 2.0 ? 'Yüksek oynaklık' :
    'Çok yüksek oynaklık!'
  }`;

  return { score: Math.min(100, score), detail };
}

function calculateUs10yRisk(us10y: MacroQuote): { score: number; detail: string } {
  const { price, changePercent } = us10y;

  // Yield seviyeleri:
  // <3.5: düşük risk (EM pozitif), 3.5-4.5: normal, 4.5-5: yüksek, 5+: çok yüksek
  let score: number;
  if (price < 3.0) score = 10;
  else if (price < 3.5) score = 20;
  else if (price < 4.0) score = 35;
  else if (price < 4.5) score = 50;
  else if (price < 5.0) score = 70;
  else score = 85;

  // Yield hızla yükseliyorsa ek risk
  if (changePercent > 1) score = Math.min(100, score + 10);

  const detail = `%${price.toFixed(2)} — ${
    price < 3.5 ? 'EM dostu düşük yield' :
    price < 4.5 ? 'Normal seviye' :
    'Yüksek yield, EM baskısı'
  }`;

  return { score: Math.min(100, score), detail };
}

function calculateDxyRisk(dxy: MacroQuote): { score: number; detail: string } {
  const { price, changePercent } = dxy;

  // DXY seviyeleri:
  // <100: EM pozitif, 100-104: normal, 104-108: olumsuz, 108+: çok olumsuz
  let score: number;
  if (price < 98) score = 10;
  else if (price < 100) score = 20;
  else if (price < 102) score = 30;
  else if (price < 104) score = 40;
  else if (price < 106) score = 55;
  else if (price < 108) score = 70;
  else score = 85;

  if (changePercent > 0.3) score = Math.min(100, score + 10);

  const detail = `${price.toFixed(2)} — ${
    price < 100 ? 'Zayıf dolar, EM pozitif' :
    price < 104 ? 'Normal seviye' :
    price < 108 ? 'Güçlü dolar, EM baskısı' :
    'Çok güçlü dolar!'
  }`;

  return { score: Math.min(100, score), detail };
}

// ── Risk Seviye Yardımcıları ────────────────────────────────────────

function getRiskLevel(score: number): RiskLevel {
  if (score < 25) return 'low';
  if (score < 50) return 'medium';
  if (score < 75) return 'high';
  return 'critical';
}

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return '#16a34a';       // green-600
    case 'medium': return '#eab308';    // yellow-500
    case 'high': return '#f97316';      // orange-500
    case 'critical': return '#dc2626';  // red-600
  }
}

function getRiskLabel(level: RiskLevel): string {
  switch (level) {
    case 'low': return 'Düşük Risk';
    case 'medium': return 'Orta Risk';
    case 'high': return 'Yüksek Risk';
    case 'critical': return 'Kritik Risk';
  }
}

function getRiskEmoji(level: RiskLevel): string {
  switch (level) {
    case 'low': return '🟢';
    case 'medium': return '🟡';
    case 'high': return '🟠';
    case 'critical': return '🔴';
  }
}

function getRiskRecommendation(level: RiskLevel, components: RiskComponent[]): string {
  const highRiskFactors = components
    .filter((c) => c.score > 60)
    .map((c) => c.name);

  switch (level) {
    case 'low':
      return 'Piyasa koşulları olumlu. Normal pozisyon büyüklüğüyle işlem yapılabilir.';
    case 'medium':
      return 'Piyasa normal risk seviyesinde. Dikkatli pozisyon yönetimi önerilir.';
    case 'high':
      return `Yüksek risk ortamı${highRiskFactors.length > 0 ? ` (${highRiskFactors.join(', ')})` : ''}. Pozisyon küçültme ve stop-loss kullanımı önerilir.`;
    case 'critical':
      return `Kritik risk seviyesi${highRiskFactors.length > 0 ? ` (${highRiskFactors.join(', ')})` : ''}! Yeni pozisyon açmaktan kaçının, mevcut pozisyonları gözden geçirin.`;
  }
}
