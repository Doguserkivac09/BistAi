import type { SignalEdgeStats } from '@/lib/edge-engine';

/**
 * Pure function: computes confidence 0–100 from edge stats.
 * Uses sigmoid normalization on final_score. No DB calls.
 */
export function calculateConfidenceScore(edge: SignalEdgeStats): number | null {
  if (!edge.sufficient_sample) return null;

  const base = edge.final_score ?? 0;
  if (base <= 0) return 0;

  const confidence = 100 * (1 / (1 + Math.exp(-base)));
  return Math.round(confidence * 100) / 100;
}
