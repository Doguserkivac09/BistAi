/**
 * Alert Sistemi — Makro skor ve sinyal koşullarına göre uyarı üretimi.
 *
 * Phase 7.3
 *
 * Alert tipleri:
 * 1. Makro skor kritik eşiği geçince
 * 2. Risk seviyesi değişince
 * 3. Güçlü kompozit sinyal oluşunca
 * 4. Sektör momentum tersine dönünce
 */

import type { MacroScoreResult } from './macro-score';
import type { RiskScoreResult, RiskLevel } from './risk-engine';
import type { CompositeSignalResult } from './composite-signal';
import type { SectorMomentum } from './sector-engine';

// ── Türler ──────────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory = 'macro' | 'risk' | 'signal' | 'sector';

export interface Alert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  emoji: string;
  /** İlgili veri (sembol, sektör, vb.) */
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AlertConfig {
  /** Makro skor eşikleri */
  macroThresholds: {
    criticalNegative: number;  // Bu skorun altında → critical alert
    warning: number;           // Bu skorun altında → warning alert
    positiveBreakout: number;  // Bu skorun üstüne geçince → info alert
  };
  /** Risk seviye değişikliği alert */
  riskLevelChangeAlert: boolean;
  /** Minimum kompozit sinyal skoru (alert için) */
  minCompositeScore: number;
  /** Sektör momentum tersine dönme eşiği */
  sectorReversalThreshold: number;
}

// ── Varsayılan Config ───────────────────────────────────────────────

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  macroThresholds: {
    criticalNegative: -50,
    warning: -25,
    positiveBreakout: 40,
  },
  riskLevelChangeAlert: true,
  minCompositeScore: 50,
  sectorReversalThreshold: 30,
};

// ── Alert Üretimi ───────────────────────────────────────────────────

/**
 * Makro skor değişikliğinden alert üretir.
 */
export function generateMacroAlerts(
  currentScore: MacroScoreResult,
  previousScore: MacroScoreResult | null,
  config: AlertConfig = DEFAULT_ALERT_CONFIG
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  // 1. Kritik negatif skor
  if (currentScore.score <= config.macroThresholds.criticalNegative) {
    alerts.push({
      id: `macro-critical-${Date.now()}`,
      category: 'macro',
      severity: 'critical',
      title: 'Makro Rüzgar Kritik Negatif',
      message: `Makro skor ${currentScore.score} seviyesine düştü. ${currentScore.label}. Yeni pozisyon açarken çok dikkatli olun.`,
      emoji: '🚨',
      metadata: { score: currentScore.score, wind: currentScore.wind },
      createdAt: now,
    });
  }
  // 2. Uyarı eşiği
  else if (currentScore.score <= config.macroThresholds.warning) {
    alerts.push({
      id: `macro-warning-${Date.now()}`,
      category: 'macro',
      severity: 'warning',
      title: 'Makro Rüzgar Negatife Dönüyor',
      message: `Makro skor ${currentScore.score}. ${currentScore.label}. Pozisyon yönetimine dikkat edin.`,
      emoji: '⚠️',
      metadata: { score: currentScore.score, wind: currentScore.wind },
      createdAt: now,
    });
  }

  // 3. Pozitif breakout (önceki negatifken pozitife geçiş)
  if (previousScore && previousScore.score < 10 && currentScore.score >= config.macroThresholds.positiveBreakout) {
    alerts.push({
      id: `macro-breakout-${Date.now()}`,
      category: 'macro',
      severity: 'info',
      title: 'Makro Rüzgar Pozitife Döndü!',
      message: `Makro skor ${previousScore.score} → ${currentScore.score}. ${currentScore.label}. Fırsatları değerlendirin.`,
      emoji: '🟢',
      metadata: { previous: previousScore.score, current: currentScore.score },
      createdAt: now,
    });
  }

  // 4. Büyük değişim (her iki yönde)
  if (previousScore) {
    const change = currentScore.score - previousScore.score;
    if (Math.abs(change) >= 20) {
      alerts.push({
        id: `macro-shift-${Date.now()}`,
        category: 'macro',
        severity: Math.abs(change) >= 35 ? 'warning' : 'info',
        title: `Makro Skorda Sert ${change > 0 ? 'Yükseliş' : 'Düşüş'}`,
        message: `Makro skor ${change > 0 ? '+' : ''}${change} puan değişti (${previousScore.score} → ${currentScore.score}).`,
        emoji: change > 0 ? '📈' : '📉',
        metadata: { change, previous: previousScore.score, current: currentScore.score },
        createdAt: now,
      });
    }
  }

  return alerts;
}

/**
 * Risk seviye değişikliğinden alert üretir.
 */
export function generateRiskAlerts(
  currentRisk: RiskScoreResult,
  previousRisk: RiskScoreResult | null,
  config: AlertConfig = DEFAULT_ALERT_CONFIG
): Alert[] {
  if (!config.riskLevelChangeAlert) return [];

  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  // Risk seviyesi yükseldi
  if (previousRisk && isHigherRisk(currentRisk.level, previousRisk.level)) {
    const severity: AlertSeverity = currentRisk.level === 'critical' ? 'critical' : 'warning';
    alerts.push({
      id: `risk-increase-${Date.now()}`,
      category: 'risk',
      severity,
      title: `Risk Seviyesi Yükseldi: ${currentRisk.label}`,
      message: `${currentRisk.emoji} Piyasa riski ${previousRisk.label} → ${currentRisk.label}. ${currentRisk.recommendation}`,
      emoji: currentRisk.emoji,
      metadata: {
        previousLevel: previousRisk.level,
        currentLevel: currentRisk.level,
        score: currentRisk.score,
      },
      createdAt: now,
    });
  }

  // Risk seviyesi düştü (pozitif haber)
  if (previousRisk && isHigherRisk(previousRisk.level, currentRisk.level)) {
    alerts.push({
      id: `risk-decrease-${Date.now()}`,
      category: 'risk',
      severity: 'info',
      title: `Risk Seviyesi Düştü: ${currentRisk.label}`,
      message: `${currentRisk.emoji} Piyasa riski ${previousRisk.label} → ${currentRisk.label}. Koşullar iyileşiyor.`,
      emoji: '✅',
      metadata: {
        previousLevel: previousRisk.level,
        currentLevel: currentRisk.level,
        score: currentRisk.score,
      },
      createdAt: now,
    });
  }

  return alerts;
}

/**
 * Güçlü kompozit sinyal oluştuğunda alert üretir.
 */
export function generateSignalAlerts(
  sembol: string,
  composite: CompositeSignalResult,
  config: AlertConfig = DEFAULT_ALERT_CONFIG
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  if (Math.abs(composite.compositeScore) >= config.minCompositeScore) {
    const isBuy = composite.decision === 'STRONG_BUY' || composite.decision === 'BUY';
    alerts.push({
      id: `signal-strong-${sembol}-${Date.now()}`,
      category: 'signal',
      severity: 'info',
      title: `${composite.emoji} ${sembol}: ${composite.decisionTr}`,
      message: `${sembol} için güçlü ${isBuy ? 'alım' : 'satım'} sinyali. Güven: %${composite.confidence}. ${composite.context.keyFactors.slice(0, 2).join('. ')}.`,
      emoji: composite.emoji,
      metadata: {
        sembol,
        decision: composite.decision,
        confidence: composite.confidence,
        compositeScore: composite.compositeScore,
      },
      createdAt: now,
    });
  }

  return alerts;
}

/**
 * Sektör momentum tersine dönmesinden alert üretir.
 */
export function generateSectorAlerts(
  currentSectors: SectorMomentum[],
  previousSectors: SectorMomentum[] | null,
  config: AlertConfig = DEFAULT_ALERT_CONFIG
): Alert[] {
  if (!previousSectors) return [];

  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  for (const current of currentSectors) {
    const previous = previousSectors.find((s) => s.sectorId === current.sectorId);
    if (!previous) continue;

    const change = current.compositeScore - previous.compositeScore;

    if (Math.abs(change) >= config.sectorReversalThreshold) {
      alerts.push({
        id: `sector-${current.sectorId}-${Date.now()}`,
        category: 'sector',
        severity: Math.abs(change) >= 50 ? 'warning' : 'info',
        title: `${current.shortName} Sektöründe ${change > 0 ? 'Toparlanma' : 'Zayıflama'}`,
        message: `${current.sectorName} momentum skoru ${change > 0 ? '+' : ''}${change} puan değişti. ${current.reasoning}`,
        emoji: change > 0 ? '📈' : '📉',
        metadata: {
          sectorId: current.sectorId,
          previousScore: previous.compositeScore,
          currentScore: current.compositeScore,
          change,
        },
        createdAt: now,
      });
    }
  }

  return alerts;
}

/**
 * Tüm alert kaynaklarından toplu alert üretir.
 */
export function generateAllAlerts(params: {
  macroScore: MacroScoreResult;
  previousMacroScore?: MacroScoreResult | null;
  riskScore: RiskScoreResult;
  previousRiskScore?: RiskScoreResult | null;
  compositeSignals?: Array<{ sembol: string; composite: CompositeSignalResult }>;
  currentSectors?: SectorMomentum[];
  previousSectors?: SectorMomentum[] | null;
  config?: AlertConfig;
}): Alert[] {
  const config = params.config ?? DEFAULT_ALERT_CONFIG;

  const alerts: Alert[] = [
    ...generateMacroAlerts(params.macroScore, params.previousMacroScore ?? null, config),
    ...generateRiskAlerts(params.riskScore, params.previousRiskScore ?? null, config),
    ...(params.compositeSignals ?? []).flatMap(({ sembol, composite }) =>
      generateSignalAlerts(sembol, composite, config)
    ),
    ...generateSectorAlerts(
      params.currentSectors ?? [],
      params.previousSectors ?? null,
      config
    ),
  ];

  // Severity'ye göre sırala (critical > warning > info)
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

// ── Yardımcı ────────────────────────────────────────────────────────

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function isHigherRisk(a: RiskLevel, b: RiskLevel): boolean {
  return RISK_ORDER[a] > RISK_ORDER[b];
}
