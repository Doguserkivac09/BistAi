/**
 * Kompozit Sinyal Motoru — Teknik × Makro × Sektör → BUY / HOLD / SELL
 *
 * Phase 6.1
 *
 * Karar mantığı:
 * 1. Teknik sinyal skoru (mevcut sinyal tespiti + edge stats)
 * 2. Makro rüzgar skoru (-100 / +100)
 * 3. Sektör uyum skoru (-100 / +100)
 * → Ağırlıklı kompozit → BUY / HOLD / SELL + güven skoru + açıklama
 *
 * Ağırlıklar:
 * Teknik Sinyal: %50 (temel)
 * Makro Rüzgar:  %30 (bağlam)
 * Sektör Uyumu:  %20 (filtre)
 */

import type { StockSignal, SignalDirection } from '@/types';
import type { MacroScoreResult } from './macro-score';
import type { SectorMomentum } from './sector-engine';
import type { RiskScoreResult } from './risk-engine';
import { getSectorId } from './sectors';

// ── Türler ──────────────────────────────────────────────────────────

export type CompositeDecision = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

export interface CompositeSignalResult {
  /** Kompozit karar */
  decision: CompositeDecision;
  /** Türkçe karar */
  decisionTr: string;
  /** Güven skoru: 0-100 */
  confidence: number;
  /** Kompozit skor: -100 ↔ +100 */
  compositeScore: number;
  /** Bileşen skorları */
  technicalScore: number;
  macroScore: number;
  sectorScore: number;
  /** Risk seviyesi (güveni etkiler) */
  riskAdjustment: number;
  /** Renk kodu */
  color: string;
  /** Emoji */
  emoji: string;
  /** AI açıklama için bağlam */
  context: CompositeContext;
}

export interface CompositeContext {
  signalType: string;
  signalDirection: SignalDirection;
  macroWind: string;
  macroLabel: string;
  sectorName: string;
  sectorSignal: string;
  riskLevel: string;
  keyFactors: string[];
}

// ── Ağırlıklar ──────────────────────────────────────────────────────

const WEIGHTS = {
  TECHNICAL: 0.50,
  MACRO:     0.30,
  SECTOR:    0.20,
} as const;

// ── Ana Kompozit Hesaplama ──────────────────────────────────────────

/**
 * Tek bir hisse sinyali için kompozit karar üretir.
 */
export function calculateCompositeSignal(
  signal: StockSignal,
  macroScore: MacroScoreResult | null,
  sectorMomentum: SectorMomentum | null,
  riskScore: RiskScoreResult | null,
  edgeConfidence?: number | null
): CompositeSignalResult {
  // 1. Teknik skor
  const technicalScore = calculateTechnicalScore(signal, edgeConfidence);

  // 2. Makro skor (direkt kullan, yön uyumuna göre ayarla)
  const macroScoreValue = calculateDirectionalMacroScore(
    macroScore?.score ?? 0,
    signal.direction
  );

  // 3. Sektör skoru
  const sectorScore = sectorMomentum?.compositeScore ?? 0;

  // 4. Kompozit skor (ağırlıklı)
  let compositeScore = Math.round(
    technicalScore * WEIGHTS.TECHNICAL +
    macroScoreValue * WEIGHTS.MACRO +
    sectorScore * WEIGHTS.SECTOR
  );

  // 5. Risk ayarlaması — yüksek risk ortamında güveni düşür
  const riskAdjustment = calculateRiskAdjustment(riskScore);
  compositeScore = Math.round(compositeScore * (1 + riskAdjustment / 100));
  compositeScore = clamp(compositeScore, -100, 100);

  // 6. Güven skoru (0-100)
  const confidence = calculateConfidence(compositeScore, technicalScore, macroScoreValue, sectorScore, riskScore);

  // 7. Karar
  const decision = getDecision(compositeScore, signal.direction);
  const decisionTr = getDecisionTr(decision);
  const color = getDecisionColor(decision);
  const emoji = getDecisionEmoji(decision);

  // 8. Bağlam (AI açıklama için)
  const keyFactors = buildKeyFactors(technicalScore, macroScoreValue, sectorScore, riskAdjustment, macroScore, sectorMomentum, signal);

  const context: CompositeContext = {
    signalType: signal.type,
    signalDirection: signal.direction,
    macroWind: macroScore?.wind ?? 'neutral',
    macroLabel: macroScore?.label ?? 'Bilinmiyor',
    sectorName: sectorMomentum?.sectorName ?? 'Bilinmiyor',
    sectorSignal: sectorMomentum?.signal ?? 'neutral',
    riskLevel: riskScore?.level ?? 'medium',
    keyFactors,
  };

  return {
    decision,
    decisionTr,
    confidence,
    compositeScore,
    technicalScore,
    macroScore: macroScoreValue,
    sectorScore,
    riskAdjustment,
    color,
    emoji,
    context,
  };
}

/**
 * Birden fazla sinyal için toplu kompozit hesaplama.
 */
export function calculateCompositeSignals(
  signals: StockSignal[],
  macroScore: MacroScoreResult | null,
  sectorMomentumMap: Record<string, SectorMomentum>,
  riskScore: RiskScoreResult | null
): Array<{ signal: StockSignal; composite: CompositeSignalResult }> {
  return signals.map((signal) => {
    const sectorMomentum = Object.values(sectorMomentumMap).find(
      (sm) => sm.sectorId === getSectorIdForSymbol(signal.sembol)
    ) ?? null;

    return {
      signal,
      composite: calculateCompositeSignal(signal, macroScore, sectorMomentum, riskScore),
    };
  });
}

// ── Bileşen Hesaplamaları ───────────────────────────────────────────

/**
 * Teknik sinyal skor hesaplama.
 * Sinyal severity + direction + edge confidence → -100/+100
 */
function calculateTechnicalScore(signal: StockSignal, edgeConfidence?: number | null): number {
  // Severity bazlı temel skor
  let baseScore: number;
  switch (signal.severity) {
    case 'güçlü': baseScore = 80; break;
    case 'orta':  baseScore = 50; break;
    case 'zayıf': baseScore = 25; break;
    default:      baseScore = 40;
  }

  // Yön: yukarı → pozitif, aşağı → negatif
  if (signal.direction === 'asagi') {
    baseScore = -baseScore;
  } else if (signal.direction === 'nötr') {
    baseScore = baseScore * 0.3; // Nötr sinyaller zayıf pozitif
  }

  // Edge confidence varsa, skorun güvenilirliğini ayarla
  if (edgeConfidence != null && edgeConfidence > 0) {
    // Edge confidence (0-100) → 0.5-1.5 arası çarpan
    const multiplier = 0.5 + (edgeConfidence / 100);
    baseScore = Math.round(baseScore * multiplier);
  }

  return clamp(baseScore, -100, 100);
}

/**
 * Makro skoru sinyal yönüne göre ayarla.
 * Pozitif makro + yukarı sinyal = uyum (makro skoru boost)
 * Pozitif makro + aşağı sinyal = çelişki (makro skoru düşür)
 */
function calculateDirectionalMacroScore(macroRawScore: number, direction: SignalDirection): number {
  if (direction === 'asagi') {
    // Aşağı sinyal: pozitif makro düşüş sinyalini zayıflatır (composite'i yukarı çeker),
    // negatif makro düşüşü destekler (composite'i aşağı çeker). Yön zaten
    // calculateTechnicalScore'da ters çevrildi; burada tekrar çevirmek double-inversion yaratır.
    return macroRawScore;
  }
  if (direction === 'yukari') {
    // Yukarı sinyal: pozitif makro destekler, negatif makro zayıflatır
    return macroRawScore;
  }
  // Nötr: makro etkisi yarıya düşer
  return Math.round(macroRawScore * 0.5);
}

/**
 * Risk seviyesine göre skor ayarlaması.
 * Yüksek risk → negatif ayarlama (güveni düşürür)
 */
function calculateRiskAdjustment(riskScore: RiskScoreResult | null): number {
  if (!riskScore) return 0;

  switch (riskScore.level) {
    case 'low':      return 5;    // Düşük risk → hafif boost
    case 'medium':   return 0;    // Nötr
    case 'high':     return -15;  // Yüksek risk → güven düşer
    case 'critical': return -30;  // Kritik risk → güven çok düşer
  }
}

/**
 * Güven skoru: 0-100
 * Kompozit skorun büyüklüğü + bileşenlerin uyumu
 */
function calculateConfidence(
  compositeScore: number,
  technicalScore: number,
  macroScoreVal: number,
  sectorScore: number,
  riskScore: RiskScoreResult | null
): number {
  // Temel güven: kompozit skorun mutlak değeri
  const absComposite = Math.abs(compositeScore);
  let confidence = Math.min(90, absComposite);

  // Bileşenler aynı yöndeyse güven artar
  const allSameSign = (
    Math.sign(technicalScore) === Math.sign(macroScoreVal) &&
    Math.sign(macroScoreVal) === Math.sign(sectorScore)
  );
  if (allSameSign && absComposite > 20) {
    confidence = Math.min(95, confidence + 10);
  }

  // Bileşenler çelişiyorsa güven düşer
  const conflicting = (
    Math.sign(technicalScore) !== Math.sign(macroScoreVal) &&
    Math.abs(technicalScore) > 30 && Math.abs(macroScoreVal) > 30
  );
  if (conflicting) {
    confidence = Math.max(10, confidence - 15);
  }

  // Risk ayarlaması
  if (riskScore) {
    if (riskScore.level === 'high') confidence = Math.max(10, confidence - 10);
    if (riskScore.level === 'critical') confidence = Math.max(5, confidence - 20);
  }

  return Math.round(confidence);
}

// ── Karar Fonksiyonları ─────────────────────────────────────────────

function getDecision(compositeScore: number, _direction: SignalDirection): CompositeDecision {
  // compositeScore zaten yön-duyarlı: teknik skor asagi için negatif,
  // makro/sektör de aynı işaret sistemini kullanır.
  // Pozitif composite → genel tablo yükseliş yönünde, negatif → düşüş yönünde.
  if (compositeScore >= 50)  return 'STRONG_BUY';
  if (compositeScore >= 20)  return 'BUY';
  if (compositeScore <= -50) return 'STRONG_SELL';
  if (compositeScore <= -20) return 'SELL';
  return 'HOLD';
}

function getDecisionTr(decision: CompositeDecision): string {
  switch (decision) {
    case 'STRONG_BUY':  return 'Güçlü AL';
    case 'BUY':         return 'AL';
    case 'HOLD':        return 'TUT';
    case 'SELL':        return 'SAT';
    case 'STRONG_SELL': return 'Güçlü SAT';
  }
}

function getDecisionColor(decision: CompositeDecision): string {
  switch (decision) {
    case 'STRONG_BUY':  return '#16a34a';
    case 'BUY':         return '#4ade80';
    case 'HOLD':        return '#9ca3af';
    case 'SELL':        return '#f87171';
    case 'STRONG_SELL': return '#dc2626';
  }
}

function getDecisionEmoji(decision: CompositeDecision): string {
  switch (decision) {
    case 'STRONG_BUY':  return '🟢🟢';
    case 'BUY':         return '🟢';
    case 'HOLD':        return '🟡';
    case 'SELL':        return '🔴';
    case 'STRONG_SELL': return '🔴🔴';
  }
}

// ── Key Factors (AI açıklama için) ──────────────────────────────────

function buildKeyFactors(
  technicalScore: number,
  macroScoreVal: number,
  sectorScore: number,
  riskAdj: number,
  macroResult: MacroScoreResult | null,
  sectorMomentum: SectorMomentum | null,
  signal?: StockSignal | null
): string[] {
  const factors: string[] = [];

  // ── 1. Teknik sinyal kalitesi ────────────────────────────────────
  const absTs = Math.abs(technicalScore);
  if (absTs >= 70) {
    const sevLabel = signal?.severity === 'güçlü' ? 'güçlü' : 'yüksek';
    factors.push(`Teknik momentum ${sevLabel}: sinyal skoru ${technicalScore > 0 ? '+' : ''}${technicalScore}`);
  } else if (absTs >= 40) {
    factors.push(`Orta düzey teknik sinyal (${technicalScore > 0 ? '+' : ''}${technicalScore})`);
  } else if (absTs > 0) {
    factors.push(`Zayıf teknik sinyal — ek doğrulama önerilir`);
  }

  // Sinyal tazeliği
  if (signal?.candlesAgo != null) {
    if (signal.candlesAgo === 0) {
      factors.push('Sinyal bugün tetiklendi — taze');
    } else if (signal.candlesAgo <= 2) {
      factors.push(`Sinyal ${signal.candlesAgo} gün önce tetiklendi — güncel`);
    } else if (signal.candlesAgo >= 5) {
      factors.push(`Sinyal ${signal.candlesAgo} gün önce tetiklendi — eskiyor`);
    }
  }

  // Haftalık hizalama
  if (signal?.weeklyAligned === true) {
    factors.push('Günlük + haftalık trend uyumlu — güçlü onay');
  } else if (signal?.weeklyAligned === false) {
    factors.push('Haftalık trend çelişiyor — daha zayıf sinyal');
  }

  // ── 2. Makro rüzgar detayı ───────────────────────────────────────
  if (macroResult) {
    const absMacro = Math.abs(macroScoreVal);
    if (absMacro >= 40) {
      const dir = macroScoreVal > 0 ? 'destekliyor' : 'baskılıyor';
      factors.push(`Makro rüzgar ${dir} (${macroResult.label}, skor: ${macroScoreVal > 0 ? '+' : ''}${macroScoreVal})`);
    } else if (absMacro >= 15) {
      factors.push(`Makro ${macroScoreVal > 0 ? 'hafif olumlu' : 'hafif olumsuz'}: ${macroResult.label}`);
    }

    // En güçlü/zayıf makro bileşeni
    if (macroResult.components.length > 0) {
      const sorted = [...macroResult.components].sort((a, b) => Math.abs(b.rawScore) - Math.abs(a.rawScore));
      const dominant = sorted[0];
      if (dominant && Math.abs(dominant.rawScore) >= 50) {
        const dir2 = dominant.rawScore > 0 ? '▲' : '▼';
        factors.push(`Baskın faktör: ${dominant.name} ${dir2} — ${dominant.detail}`);
      }
    }
  }

  // Makro-sinyal çelişkisi
  const signalIsUp = (signal?.direction ?? 'yukari') !== 'asagi';
  const macroIsPos = macroScoreVal > 0;
  if (Math.abs(macroScoreVal) > 25 && signalIsUp !== macroIsPos) {
    factors.push('⚠️ Teknik sinyal ile makro rüzgar çelişiyor — dikkatli olun');
  }

  // ── 3. Sektör momentum detayı ────────────────────────────────────
  if (sectorMomentum) {
    const absSector = Math.abs(sectorScore);
    if (absSector >= 40) {
      const perf = sectorMomentum.perf20d;
      const perfStr = perf != null ? ` (20g: ${perf > 0 ? '+' : ''}${perf.toFixed(1)}%)` : '';
      factors.push(
        `${sectorMomentum.shortName} sektörü ${sectorScore > 0 ? 'güçlü ↑' : 'zayıf ↓'} momentum${perfStr}`
      );
    } else if (absSector >= 20) {
      factors.push(`${sectorMomentum.shortName} sektörü ${sectorScore > 0 ? 'olumlu' : 'olumsuz'} seyirde`);
    }

    // Makro-sektör uyum bilgisi
    if (Math.abs(sectorMomentum.macroAlignment) >= 30) {
      const align = sectorMomentum.macroAlignment > 0 ? 'destekliyor' : 'baskılıyor';
      factors.push(`Makro ortam bu sektörü ${align}`);
    }
  }

  // ── 4. Risk ortamı ───────────────────────────────────────────────
  if (riskAdj <= -25) {
    factors.push('🚨 Kritik risk seviyesi — tüm sinyallerin güvenilirliği düşük');
  } else if (riskAdj <= -10) {
    factors.push('Yüksek piyasa riski güven skorunu düşürüyor');
  } else if (riskAdj >= 5) {
    factors.push('Düşük volatilite ortamı güveni artırıyor');
  }

  return factors.slice(0, 6); // maksimum 6 faktör
}

// ── Yardımcı ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getSectorIdForSymbol(symbol: string): string {
  return getSectorId(symbol);
}
