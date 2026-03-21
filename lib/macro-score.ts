/**
 * Makro Skor Motoru — Tüm makro verileri → tek bir skor: -100 (çok negatif) ↔ +100 (çok pozitif)
 *
 * Phase 4.4 — BIST için makro rüzgar skoru hesaplama
 *
 * Mantık: Seviyeden çok TREND ÖNEMLİ.
 * VIX yüksek ama düşüyor → pozitif (risk iştahı artıyor)
 * USD/TRY düşük ama yükseliyor → negatif (TL zayıflıyor)
 *
 * Ağırlıklar:
 * USD/TRY  %25 — BIST'in en güçlü korelasyonu
 * CDS      %20 — Ülke riski = yabancı iştahı
 * VIX      %15 — Global risk iştahı
 * DXY      %15 — EM baskısı
 * US10Y    %10 — EM fund akışları
 * TCMB     %15 — Yerel para politikası
 */

import type { MacroSnapshot } from './macro-data';
import type { TurkeyMacroData } from './turkey-macro';
import type { FredSnapshot } from './fred';

// ── Türler ──────────────────────────────────────────────────────────

export interface MacroScoreResult {
  /** Toplam makro skor: -100 (çok negatif) ↔ +100 (çok pozitif) */
  score: number;
  /** Makro rüzgar yönü */
  wind: 'strong_positive' | 'positive' | 'neutral' | 'negative' | 'strong_negative';
  /** Renk kodu */
  color: 'green' | 'lightgreen' | 'gray' | 'orange' | 'red';
  /** Türkçe etiket */
  label: string;
  /** Her göstergenin bireysel skoru ve detayları */
  components: MacroComponent[];
  /** Hesaplama zamanı */
  calculatedAt: string;
}

export interface MacroComponent {
  name: string;
  weight: number;
  rawScore: number;     // -100 ↔ +100 (bireysel)
  weightedScore: number; // rawScore × weight
  signal: 'positive' | 'neutral' | 'negative';
  detail: string;       // İnsan okunabilir açıklama
}

// ── Ağırlıklar ──────────────────────────────────────────────────────

const WEIGHTS = {
  USDTRY: 0.25,
  CDS:    0.20,
  VIX:    0.15,
  DXY:    0.15,
  US10Y:  0.10,
  TCMB:   0.15,
} as const;

// ── Ana Skor Hesaplama ──────────────────────────────────────────────

/**
 * Tüm makro verilerden kompozit skor hesaplar.
 * Herhangi bir veri eksikse, mevcut verilerle ağırlıkları yeniden normalize eder.
 */
export function calculateMacroScore(
  macroSnapshot: MacroSnapshot | null,
  turkeyData: TurkeyMacroData | null,
  fredData: FredSnapshot | null
): MacroScoreResult {
  const components: MacroComponent[] = [];

  // 1. USD/TRY Trend Skoru
  if (macroSnapshot?.usdtry) {
    const { price, previousClose, changePercent } = macroSnapshot.usdtry;
    // USD/TRY yükseliyorsa → BIST için NEGATİF (ters korelasyon)
    const rawScore = clampScore(-changePercent * 20); // %5 artış → -100
    components.push({
      name: 'USD/TRY',
      weight: WEIGHTS.USDTRY,
      rawScore,
      weightedScore: rawScore * WEIGHTS.USDTRY,
      signal: rawScore > 15 ? 'positive' : rawScore < -15 ? 'negative' : 'neutral',
      detail: `${price.toFixed(4)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%) — ${
        changePercent > 0.5 ? 'TL zayıflıyor, BIST için negatif' :
        changePercent < -0.5 ? 'TL güçleniyor, BIST için pozitif' :
        'Stabil'
      }`,
    });
  }

  // 2. CDS (Türkiye Risk)
  if (turkeyData?.cds5y) {
    const { value, change } = turkeyData.cds5y;
    // CDS yükseliyorsa → NEGATİF, düşüyorsa → POZİTİF
    // Seviye de önemli: 300+ yüksek risk, 200- düşük risk
    const levelPenalty = value > 400 ? -30 : value > 300 ? -15 : value < 200 ? 15 : 0;
    const trendScore = change !== null ? clampScore(-change * 0.5) : 0; // 100bps artış → -50
    const rawScore = clampScore(trendScore + levelPenalty);
    components.push({
      name: 'CDS 5Y',
      weight: WEIGHTS.CDS,
      rawScore,
      weightedScore: rawScore * WEIGHTS.CDS,
      signal: rawScore > 15 ? 'positive' : rawScore < -15 ? 'negative' : 'neutral',
      detail: `${value} bps (${change !== null ? (change > 0 ? '+' : '') + change + ' bps' : 'N/A'}) — ${
        value > 400 ? 'Yüksek risk' : value > 300 ? 'Orta-yüksek risk' : value < 200 ? 'Düşük risk' : 'Orta risk'
      }`,
    });
  }

  // 3. VIX (Korku Endeksi)
  if (macroSnapshot?.vix) {
    const { price, changePercent } = macroSnapshot.vix;
    // VIX yükseliyorsa → NEGATİF (risk-off)
    // Seviye: 20+ korku, 12- sakinlik
    const levelScore = price > 30 ? -40 : price > 25 ? -25 : price > 20 ? -10 : price < 15 ? 20 : 10;
    const trendScore = clampScore(-changePercent * 3); // %10 artış → -30
    const rawScore = clampScore((levelScore + trendScore) / 2);
    components.push({
      name: 'VIX',
      weight: WEIGHTS.VIX,
      rawScore,
      weightedScore: rawScore * WEIGHTS.VIX,
      signal: rawScore > 15 ? 'positive' : rawScore < -15 ? 'negative' : 'neutral',
      detail: `${price.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%) — ${
        price > 30 ? 'Yüksek korku' : price > 20 ? 'Dikkatli ol' : price < 15 ? 'Sakin piyasa' : 'Normal'
      }`,
    });
  }

  // 4. DXY (Dolar Endeksi)
  if (macroSnapshot?.dxy) {
    const { price, changePercent } = macroSnapshot.dxy;
    // DXY yükseliyorsa → EM'ler için NEGATİF
    const levelScore = price > 108 ? -20 : price > 104 ? -10 : price < 100 ? 20 : 0;
    const trendScore = clampScore(-changePercent * 15); // %1 artış → -15
    const rawScore = clampScore((levelScore + trendScore) / 2);
    components.push({
      name: 'DXY',
      weight: WEIGHTS.DXY,
      rawScore,
      weightedScore: rawScore * WEIGHTS.DXY,
      signal: rawScore > 15 ? 'positive' : rawScore < -15 ? 'negative' : 'neutral',
      detail: `${price.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%) — ${
        price > 108 ? 'Güçlü dolar, EM baskısı' : price < 100 ? 'Zayıf dolar, EM pozitif' : 'Normal seviye'
      }`,
    });
  }

  // 5. US 10Y Yield
  if (macroSnapshot?.us10y) {
    const { price, changePercent } = macroSnapshot.us10y;
    // Yield yükseliyorsa → EM'lerden para çıkışı → NEGATİF
    const levelScore = price > 5 ? -30 : price > 4.5 ? -15 : price < 3.5 ? 15 : 0;
    const trendScore = clampScore(-changePercent * 5);
    const rawScore = clampScore((levelScore + trendScore) / 2);
    components.push({
      name: 'US 10Y',
      weight: WEIGHTS.US10Y,
      rawScore,
      weightedScore: rawScore * WEIGHTS.US10Y,
      signal: rawScore > 15 ? 'positive' : rawScore < -15 ? 'negative' : 'neutral',
      detail: `%${price.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%) — ${
        price > 5 ? 'Yüksek yield, EM baskısı' : price > 4.5 ? 'Yükseliyor, dikkat' : 'Normal/pozitif seviye'
      }`,
    });
  }

  // 6. TCMB Politika Faizi
  if (turkeyData?.policyRate) {
    const { value, change, changeDirection } = turkeyData.policyRate;
    // Faiz artışı → kısa vade NEGATİF ama orta vade stabilite → nötr eğilimli
    // Faiz indirimi → POZİTİF (likidite)
    // Çok yüksek faiz → negatif baskı
    let rawScore = 0;
    if (changeDirection === 'down') {
      rawScore = 30; // Faiz indirimi → pozitif
    } else if (changeDirection === 'up') {
      rawScore = -15; // Faiz artışı → hafif negatif (ama enflasyonla mücadele pozitif)
    }
    // Seviye: çok yüksek faiz → baskı
    if (value > 45) rawScore -= 20;
    else if (value > 35) rawScore -= 10;
    else if (value < 20) rawScore += 10;

    rawScore = clampScore(rawScore);
    components.push({
      name: 'TCMB Faiz',
      weight: WEIGHTS.TCMB,
      rawScore,
      weightedScore: rawScore * WEIGHTS.TCMB,
      signal: rawScore > 15 ? 'positive' : rawScore < -15 ? 'negative' : 'neutral',
      detail: `%${value} (${
        changeDirection === 'up' ? 'artırıldı' :
        changeDirection === 'down' ? 'indirildi' : 'değişmedi'
      }${change !== null ? ', ' + (change > 0 ? '+' : '') + change + ' puan' : ''})`,
    });
  }

  // ── Ağırlık Normalizasyonu ──────────────────────────────────────

  // Eksik bileşenler varsa, mevcut ağırlıkları yeniden normalize et
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);

  let finalScore: number;
  if (totalWeight === 0) {
    finalScore = 0;
  } else {
    // Normalize edilmiş ağırlıklı toplam
    finalScore = Math.round(
      components.reduce((sum, c) => sum + c.rawScore * (c.weight / totalWeight), 0)
    );
  }

  finalScore = clampScore(finalScore);

  // ── Wind & Label ────────────────────────────────────────────────

  const wind = getWind(finalScore);
  const color = getColor(finalScore);
  const label = getLabel(finalScore);

  return {
    score: finalScore,
    wind,
    color,
    label,
    components,
    calculatedAt: new Date().toISOString(),
  };
}

// ── FRED Verilerinden Ek Skor (bonus — ana skora eklenebilir) ──────

/**
 * FRED verilerinden ABD ekonomi sağlık skoru (bilgi amaçlı).
 * Ana makro skora dahil değil, Phase 6'da kullanılabilir.
 */
export function calculateUSEconomyHealth(fredData: FredSnapshot | null): {
  score: number;
  detail: string;
} | null {
  if (!fredData) return null;

  let score = 0;
  const details: string[] = [];

  // Fed Funds Rate trendi
  if (fredData.fedFundsRate?.change !== null && fredData.fedFundsRate?.change !== undefined) {
    if (fredData.fedFundsRate.change < 0) {
      score += 20; // Faiz indirimi → likidite → EM pozitif
      details.push('Fed faiz indirimi (EM pozitif)');
    } else if (fredData.fedFundsRate.change > 0) {
      score -= 15;
      details.push('Fed faiz artışı (EM negatif)');
    }
  }

  // GDP büyüme
  if (fredData.gdpGrowth?.latestValue !== null && fredData.gdpGrowth?.latestValue !== undefined) {
    if (fredData.gdpGrowth.latestValue > 2) {
      score += 10; // Sağlıklı büyüme
      details.push(`GDP %${fredData.gdpGrowth.latestValue} (güçlü)`);
    } else if (fredData.gdpGrowth.latestValue < 0) {
      score -= 20; // Resesyon riski → risk-off
      details.push(`GDP %${fredData.gdpGrowth.latestValue} (resesyon riski)`);
    }
  }

  // İşsizlik
  if (fredData.unemployment?.latestValue !== null && fredData.unemployment?.latestValue !== undefined) {
    if (fredData.unemployment.latestValue > 5) {
      score -= 10;
      details.push(`İşsizlik %${fredData.unemployment.latestValue} (yüksek)`);
    }
  }

  return {
    score: clampScore(score),
    detail: details.join(', ') || 'Yeterli veri yok',
  };
}

// ── Yardımcı Fonksiyonlar ───────────────────────────────────────────

function clampScore(score: number): number {
  return Math.max(-100, Math.min(100, Math.round(score)));
}

function getWind(score: number): MacroScoreResult['wind'] {
  if (score >= 40) return 'strong_positive';
  if (score >= 15) return 'positive';
  if (score <= -40) return 'strong_negative';
  if (score <= -15) return 'negative';
  return 'neutral';
}

function getColor(score: number): MacroScoreResult['color'] {
  if (score >= 40) return 'green';
  if (score >= 15) return 'lightgreen';
  if (score <= -40) return 'red';
  if (score <= -15) return 'orange';
  return 'gray';
}

function getLabel(score: number): string {
  if (score >= 40) return 'Güçlü Pozitif Rüzgar';
  if (score >= 15) return 'Pozitif Rüzgar';
  if (score <= -40) return 'Güçlü Negatif Rüzgar';
  if (score <= -15) return 'Negatif Rüzgar';
  return 'Nötr';
}
