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
    const rawScore = clampScore(-(changePercent ?? 0) * 20); // %5 artış → -100
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
 * FRED verilerinden ABD ekonomi sağlık skoru — 0-100 mutlak ölçek.
 *
 * 50 = nötr taban. Her boyut sağlıklıysa puan ekler, zayıfsa çıkarır.
 * Etiket eşikleri (formatMacroResponse'ta): >=60 Güçlü, >=40 Normal, <40 Zayıf.
 *
 * Tasarım kararı: Önceki sürüm "delta" mantığı kullanıyordu (sıfırdan başla,
 * sadece change/uç değerlerde puan ekle/çıkar). Sonuç hep 0 civarında kalıyor
 * ve sağlıklı veride bile "Zayıf" görünüyordu. Bu sürüm her gösterge için
 * absolute seviye + trendi birlikte değerlendiriyor.
 */
export function calculateUSEconomyHealth(fredData: FredSnapshot | null): {
  score: number;
  detail: string;
} | null {
  if (!fredData) return null;

  let score = 50; // Nötr taban
  const details: string[] = [];
  let dimensionsScored = 0;

  // Fed Funds Rate — seviye + trend
  // Düşük faiz (<3) genişlemeci, yüksek faiz (>5) sıkı
  // İndirim trendi → EM pozitif, artış trendi → EM negatif
  const fedRate = fredData.fedFundsRate?.latestValue;
  const fedChange = fredData.fedFundsRate?.change;
  if (fedRate != null) {
    dimensionsScored++;
    if (fedRate < 2) {
      score += 8; details.push(`Fed %${fedRate.toFixed(2)} (gevşek)`);
    } else if (fedRate < 4) {
      score += 4; details.push(`Fed %${fedRate.toFixed(2)} (nötr)`);
    } else if (fedRate < 5.5) {
      score -= 2; details.push(`Fed %${fedRate.toFixed(2)} (sıkı)`);
    } else {
      score -= 8; details.push(`Fed %${fedRate.toFixed(2)} (çok sıkı)`);
    }
    if (fedChange != null && Math.abs(fedChange) >= 0.1) {
      if (fedChange < 0) { score += 5; details.push('faiz indirimi'); }
      else                { score -= 5; details.push('faiz artışı'); }
    }
  }

  // GDP büyüme — seviye
  const gdp = fredData.gdpGrowth?.latestValue;
  if (gdp != null) {
    dimensionsScored++;
    if (gdp >= 3)       { score += 15; details.push(`GSYH %${gdp} (güçlü)`); }
    else if (gdp >= 2)  { score += 10; details.push(`GSYH %${gdp} (sağlıklı)`); }
    else if (gdp >= 1)  { score += 4;  details.push(`GSYH %${gdp} (ılımlı)`); }
    else if (gdp >= 0)  { score -= 5;  details.push(`GSYH %${gdp} (zayıf)`); }
    else                { score -= 20; details.push(`GSYH %${gdp} (daralma)`); }
  }

  // İşsizlik — seviye (4-5 sağlıklı, <4 tam istihdam, >5 yumuşama, >6 resesyon riski)
  const unemp = fredData.unemployment?.latestValue;
  if (unemp != null) {
    dimensionsScored++;
    if (unemp < 4)        { score += 12; details.push(`İşsizlik %${unemp} (tam istihdam)`); }
    else if (unemp <= 4.5){ score += 8;  details.push(`İşsizlik %${unemp} (sağlıklı)`); }
    else if (unemp <= 5)  { score += 2;  details.push(`İşsizlik %${unemp} (sağlıklı)`); }
    else if (unemp <= 6)  { score -= 8;  details.push(`İşsizlik %${unemp} (yumuşama)`); }
    else                  { score -= 18; details.push(`İşsizlik %${unemp} (resesyon riski)`); }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    detail: dimensionsScored === 0 ? 'Yeterli veri yok' : details.join(', '),
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
