/**
 * Hisse Skor Kartı — 5 Boyutlu Teknik Puanlama
 *
 * Her boyut 0–100 arası puanlanır:
 *   1. Trend    — EMA9/21/50/200 hizalanması
 *   2. Momentum — RSI pozisyonu (30–70 optimum bölge)
 *   3. Hacim    — Son 5g hacim / 20g ortalama
 *   4. Sinyal   — Mevcut sinyallerin confluence skoru
 *   5. Volatilite — BB genişliği (düşük = avantajlı)
 *
 * Toplam ağırlıklı skor → 0–100 → 1–5 yıldız (her 20 puan = 1 yıldız)
 */

import type { OHLCVCandle, StockSignal } from '@/types';
import { calculateEMA } from '@/lib/signals';
import { computeConfluence } from '@/lib/signals';

export interface ScoreDimension {
  key: string;
  label: string;
  score: number;      // 0–100
  description: string;
}

export interface StockScoreResult {
  dimensions: ScoreDimension[];
  totalScore: number;   // 0–100 ağırlıklı
  stars: number;        // 1–5
  label: string;        // "Çok Güçlü", "Güçlü", vs.
  color: string;        // tailwind renk sınıfı (text-*)
}

const WEIGHTS = {
  trend:      0.30,
  momentum:   0.25,
  hacim:      0.15,
  sinyal:     0.20,
  volatilite: 0.10,
} as const;

// ── Boyut Hesaplamaları ──────────────────────────────────────────────

/** Trend skoru: EMA hizalanmasına göre */
function trendScore(candles: OHLCVCandle[]): { score: number; description: string } {
  if (candles.length < 21) return { score: 50, description: 'Yetersiz veri' };

  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1]!;

  const ema9  = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = candles.length >= 50 ? calculateEMA(closes, 50) : null;
  const ema200 = candles.length >= 200 ? calculateEMA(closes, 200) : null;

  const e9  = ema9[ema9.length - 1]!;
  const e21 = ema21[ema21.length - 1]!;
  const e50 = ema50 ? ema50[ema50.length - 1]! : null;
  const e200 = ema200 ? ema200[ema200.length - 1]! : null;

  // Her uyumlu koşul puan ekler
  let pts = 0;
  const maxPts = 5;

  if (e9 > e21) pts++;                        // kısa vade pozitif
  if (e50 !== null && e21 > e50) pts++;        // orta vade pozitif
  if (e200 !== null && e50 !== null && e50 > e200) pts++;  // uzun vade pozitif
  if (price > e21) pts++;                      // fiyat kısa-orta EMA üzerinde
  if (e200 !== null && price > e200) pts++;    // fiyat uzun vade EMA üzerinde

  const score = Math.round((pts / maxPts) * 100);

  const descriptions: Record<number, string> = {
    5: 'Tüm EMA\'lar yükseliş sıralamasında',
    4: 'Güçlü yükseliş trendi',
    3: 'Karma trend sinyalleri',
    2: 'Zayıf veya düşüş eğilimi',
    1: 'Belirgin düşüş trendi',
    0: 'Tüm EMA\'lar düşüş sıralamasında',
  };

  return { score, description: descriptions[pts] ?? 'Orta trend' };
}

/** Momentum skoru: RSI pozisyonu */
function momentumScore(candles: OHLCVCandle[]): { score: number; description: string } {
  const PERIOD = 14;
  if (candles.length < PERIOD + 5) return { score: 50, description: 'Yetersiz veri' };

  const closes = candles.map((c) => c.close);
  // Basit RSI hesabı
  const slice = closes.slice(-PERIOD - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i]! - slice[i - 1]!;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / PERIOD;
  const avgLoss = losses / PERIOD;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // RSI 45–65 = optimal alım bölgesi (güç var ama aşırı alım değil)
  // RSI <30 veya >70 = uç noktalar (düşük alım skoru)
  let score: number;
  let description: string;

  if (rsi >= 45 && rsi <= 65) {
    score = 85;
    description = `RSI ${rsi.toFixed(0)} — Güçlü momentum bölgesi`;
  } else if (rsi >= 35 && rsi < 45) {
    score = 65;
    description = `RSI ${rsi.toFixed(0)} — Toparlanma bölgesi`;
  } else if (rsi > 65 && rsi <= 75) {
    score = 60;
    description = `RSI ${rsi.toFixed(0)} — Güçlü ama aşırı alıma yakın`;
  } else if (rsi < 35 && rsi >= 25) {
    score = 50;
    description = `RSI ${rsi.toFixed(0)} — Aşırı satılmış, dikkatli ol`;
  } else if (rsi > 75) {
    score = 35;
    description = `RSI ${rsi.toFixed(0)} — Aşırı alım bölgesi`;
  } else {
    score = 30;
    description = `RSI ${rsi.toFixed(0)} — Aşırı satılmış`;
  }

  return { score, description };
}

/** Hacim skoru: 5g hacim / 20g ortalama */
function hacimScore(candles: OHLCVCandle[]): { score: number; description: string } {
  if (candles.length < 20) return { score: 50, description: 'Yetersiz veri' };

  const avg20 = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20;
  const avg5  = candles.slice(-5).reduce((a, c) => a + c.volume, 0) / 5;

  if (avg20 === 0) return { score: 50, description: 'Hacim verisi yok' };

  const ratio = avg5 / avg20;

  let score: number;
  let description: string;

  if (ratio >= 1.5) {
    score = 90;
    description = `${ratio.toFixed(1)}x hacim artışı — Güçlü ilgi`;
  } else if (ratio >= 1.2) {
    score = 72;
    description = `${ratio.toFixed(1)}x hacim — Ortalamanın üzerinde`;
  } else if (ratio >= 0.8) {
    score = 55;
    description = `${ratio.toFixed(1)}x hacim — Normal seviye`;
  } else if (ratio >= 0.5) {
    score = 35;
    description = `${ratio.toFixed(1)}x hacim — Düşük ilgi`;
  } else {
    score = 20;
    description = `${ratio.toFixed(1)}x hacim — Çok düşük hacim`;
  }

  return { score, description };
}

/** Sinyal skoru: confluence skoru normalize */
function sinyalScore(signals: StockSignal[]): { score: number; description: string } {
  if (!signals.length) {
    return { score: 20, description: 'Aktif sinyal bulunamadı' };
  }

  const confluence = computeConfluence(signals);
  // Confluence skoru 0–100, doğrudan kullan
  const score = confluence.score;

  const bullish = confluence.bullishCount;
  const bearish = confluence.bearishCount;
  const total = bullish + bearish;

  let description: string;
  if (score >= 70) {
    description = `${total} güçlü sinyal (${bullish} yükseliş)`;
  } else if (score >= 40) {
    description = `${total} orta sinyal (${bullish} yükseliş, ${bearish} düşüş)`;
  } else {
    description = `${total} zayıf sinyal tespit edildi`;
  }

  return { score, description };
}

/** Volatilite skoru: BB genişliği — dar bant = düşük risk = yüksek skor */
function volatiliteScore(candles: OHLCVCandle[]): { score: number; description: string } {
  const PERIOD = 20;
  if (candles.length < PERIOD + 10) return { score: 50, description: 'Yetersiz veri' };

  const closes = candles.map((c) => c.close);

  // Son PERIOD mumun std sapması
  const slice = closes.slice(-PERIOD);
  const sma = slice.reduce((a, b) => a + b, 0) / PERIOD;
  const variance = slice.reduce((a, b) => a + (b - sma) ** 2, 0) / PERIOD;
  const stdev = Math.sqrt(variance);
  const bbWidth = sma > 0 ? (stdev * 4 / sma) * 100 : 0; // %

  // Geçmiş BB genişlik ortalaması (karşılaştırma için)
  const historicWidths: number[] = [];
  for (let i = candles.length - PERIOD - 20; i < candles.length - PERIOD; i++) {
    if (i < 0) continue;
    const s = closes.slice(i, i + PERIOD);
    const m = s.reduce((a, b) => a + b, 0) / PERIOD;
    const v = s.reduce((a, b) => a + (b - m) ** 2, 0) / PERIOD;
    const sd = Math.sqrt(v);
    historicWidths.push(m > 0 ? (sd * 4 / m) * 100 : 0);
  }
  const avgHistoric = historicWidths.length
    ? historicWidths.reduce((a, b) => a + b, 0) / historicWidths.length
    : bbWidth;

  const relativeWidth = avgHistoric > 0 ? bbWidth / avgHistoric : 1;

  // Dar bant (düşük volatilite) = yüksek skor (fırsat bölgesi)
  let score: number;
  let description: string;

  if (relativeWidth <= 0.5) {
    score = 90;
    description = `BB çok dar — Patlama potansiyeli yüksek`;
  } else if (relativeWidth <= 0.75) {
    score = 72;
    description = `BB dar — Düşük volatilite`;
  } else if (relativeWidth <= 1.25) {
    score = 55;
    description = `BB normal genişlikte`;
  } else if (relativeWidth <= 1.75) {
    score = 35;
    description = `BB geniş — Yüksek volatilite`;
  } else {
    score = 18;
    description = `BB çok geniş — Aşırı volatilite`;
  }

  return { score, description };
}

// ── Ana Fonksiyon ────────────────────────────────────────────────────

export function computeStockScore(
  candles: OHLCVCandle[],
  signals: StockSignal[]
): StockScoreResult {
  const trend      = trendScore(candles);
  const momentum   = momentumScore(candles);
  const hacim      = hacimScore(candles);
  const sinyal     = sinyalScore(signals);
  const volatilite = volatiliteScore(candles);

  const dimensions: ScoreDimension[] = [
    { key: 'trend',      label: 'Trend',       score: trend.score,      description: trend.description },
    { key: 'momentum',   label: 'Momentum',    score: momentum.score,   description: momentum.description },
    { key: 'hacim',      label: 'Hacim',        score: hacim.score,      description: hacim.description },
    { key: 'sinyal',     label: 'Sinyal Gücü', score: sinyal.score,     description: sinyal.description },
    { key: 'volatilite', label: 'Volatilite',  score: volatilite.score, description: volatilite.description },
  ];

  const totalScore = Math.round(
    trend.score      * WEIGHTS.trend +
    momentum.score   * WEIGHTS.momentum +
    hacim.score      * WEIGHTS.hacim +
    sinyal.score     * WEIGHTS.sinyal +
    volatilite.score * WEIGHTS.volatilite
  );

  const stars = Math.max(1, Math.min(5, Math.ceil(totalScore / 20)));

  const LABELS: Record<number, { label: string; color: string }> = {
    5: { label: 'Çok Güçlü',  color: 'text-emerald-400' },
    4: { label: 'Güçlü',      color: 'text-green-400' },
    3: { label: 'Orta',       color: 'text-yellow-400' },
    2: { label: 'Zayıf',      color: 'text-orange-400' },
    1: { label: 'Çok Zayıf',  color: 'text-red-400' },
  };

  return {
    dimensions,
    totalScore,
    stars,
    label: LABELS[stars]!.label,
    color: LABELS[stars]!.color,
  };
}
