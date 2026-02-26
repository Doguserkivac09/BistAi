import type { SignalPerformanceRecord } from '@/lib/performance-types';

export interface HorizonEdgeStats {
  win_rate: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  expectancy: number | null;
  std_dev: number | null;
  downside_dev: number | null;
  profit_factor: number | null;
  risk_adjusted: number | null;
}

export interface SignalEdgeStats {
  total_signals: number;
  sufficient_sample: boolean;
  horizon_3d: HorizonEdgeStats | null;
  horizon_7d: HorizonEdgeStats | null;
  horizon_14d: HorizonEdgeStats | null;
  composite_edge: number | null;
  final_score: number | null;
}

type Direction = 'yukari' | 'asagi';

function isWin(direction: Direction, returnVal: number): boolean {
  return (
    (direction === 'yukari' && returnVal > 0) ||
    (direction === 'asagi' && returnVal < 0)
  );
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// tanh normalization to reduce outlier impact
const normalize = (r: number): number => Math.tanh(r);

function computeHorizonStats(
  records: SignalPerformanceRecord[],
  getReturn: (r: SignalPerformanceRecord) => number | null
): HorizonEdgeStats {
  const returns: { direction: Direction; value: number }[] = [];

  for (const rec of records) {
    const dir = rec.direction;
    if (dir !== 'yukari' && dir !== 'asagi') continue;

    const raw = getReturn(rec);
    if (raw == null || !Number.isFinite(raw)) continue;

    const value = normalize(raw);
    if (!Number.isFinite(value)) continue;
    returns.push({ direction: dir as Direction, value });
  }

  const n = returns.length;
  if (n === 0) {
    return {
      win_rate: null,
      avg_win: null,
      avg_loss: null,
      expectancy: null,
      std_dev: null,
      downside_dev: null,
      profit_factor: null,
      risk_adjusted: null,
    };
  }

  const wins = returns.filter((r) => isWin(r.direction, r.value));
  const losses = returns.filter((r) => !isWin(r.direction, r.value));

  const winCount = wins.length;
  const lossCount = losses.length;

  const winRate = winCount / n;

  const sumWins = wins.reduce((s, r) => s + r.value, 0);
  const sumLosses = losses.reduce((s, r) => s + r.value, 0);

  const avgWin = winCount > 0 ? sumWins / winCount : null;
  const avgLoss = lossCount > 0 ? sumLosses / lossCount : null;

  const expectancy =
    avgWin != null && avgLoss != null
      ? round4(winRate * avgWin + (1 - winRate) * avgLoss)
      : winCount === n && avgWin != null
        ? avgWin
        : lossCount === n && avgLoss != null
          ? avgLoss
          : null;

  const values = returns.map((r) => r.value);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const stdDevFinite = Number.isFinite(stdDev) ? round4(stdDev) : null;

  const negativeReturns = values.filter((v) => v < 0);
  const downsideVariance =
    negativeReturns.length > 0
      ? negativeReturns.reduce((s, v) => s + v ** 2, 0) / negativeReturns.length
      : 0;
  const downsideDev =
    Number.isFinite(downsideVariance) && downsideVariance > 0
      ? round4(Math.sqrt(downsideVariance))
      : null;

  const grossProfit = wins.reduce((s, r) => s + Math.max(0, r.value), 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + Math.min(0, r.value), 0));
  const profitFactor =
    grossLoss > 0 && Number.isFinite(grossProfit)
      ? round4(grossProfit / grossLoss)
      : grossLoss === 0 && grossProfit > 0
        ? Infinity
        : grossLoss === 0 && grossProfit === 0
          ? null
          : null;

  const expFinite = expectancy != null && Number.isFinite(expectancy);
  let riskAdjusted: number | null = null;
  if (stdDevFinite === 0) {
    riskAdjusted = expFinite && expectancy! > 0 ? round4(expectancy!) : 0;
  } else if (stdDevFinite != null && stdDevFinite > 0 && expFinite) {
    const ratio = expectancy! / stdDevFinite;
    riskAdjusted = Number.isFinite(ratio) ? round4(ratio) : 0;
  }

  return {
    win_rate: round4(winRate),
    avg_win: avgWin != null ? round4(avgWin) : null,
    avg_loss: avgLoss != null ? round4(avgLoss) : null,
    expectancy,
    std_dev: stdDevFinite,
    downside_dev: downsideDev,
    profit_factor: profitFactor === Infinity ? null : profitFactor,
    risk_adjusted: riskAdjusted,
  };
}

/**
 * Pure calculation layer: computes edge statistics from performance records.
 * No DB access, no side effects.
 */
export function computeSignalEdge(
  records: SignalPerformanceRecord[]
): SignalEdgeStats {
  const totalSignals = Array.isArray(records) ? records.length : 0;
  const sufficientSample = totalSignals >= 20;

  if (!sufficientSample) {
    return {
      total_signals: totalSignals,
      sufficient_sample: false,
      horizon_3d: null,
      horizon_7d: null,
      horizon_14d: null,
      composite_edge: null,
      final_score: null,
    };
  }

  const horizon_3d = computeHorizonStats(
    records,
    (r) => r.return_3d ?? null
  );
  const horizon_7d = computeHorizonStats(
    records,
    (r) => r.return_7d ?? null
  );
  const horizon_14d = computeHorizonStats(
    records,
    (r) => r.return_14d ?? null
  );

  const risk3d = horizon_3d.risk_adjusted ?? 0;
  const risk7d = horizon_7d.risk_adjusted ?? 0;
  const risk14d = horizon_14d.risk_adjusted ?? 0;

  const compositeEdge = round4(
    0.25 * risk3d + 0.35 * risk7d + 0.4 * risk14d
  );

  const logN = totalSignals > 0 ? Math.log(totalSignals) : 0;
  const finalScore = Number.isFinite(logN)
    ? round4(compositeEdge * logN)
    : null;

  return {
    total_signals: totalSignals,
    sufficient_sample: true,
    horizon_3d,
    horizon_7d,
    horizon_14d,
    composite_edge: compositeEdge,
    final_score: finalScore,
  };
}
