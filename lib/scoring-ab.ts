/**
 * SCORING v1 ↔ v2 A/B ölçüm çekirdeği (SKOR-MIMARISI-PLAN FAZ 0).
 *
 * ⚠️ ÖLÇÜLEBİLİRLİK HER ŞEYDEN ÖNCE: "iyileştirme" ancak burada ölçülür. Bu modül
 * SAF + deterministik + test edilebilir — DB/IO route katmanında.
 *
 * METODOLOJİ (planın 3 düzeltmesi):
 *  1. Point-in-time yeniden skorlama: aynı sinyal satırı v1 VE v2 ile yeniden skorlanır
 *     (computeDecision `scoringV2` override). scannedAt = now → timeDecay≈1 (üretim-anı skor).
 *  2. Survivorship yok: A ve B AYNI evaluated havuzu yeniden sıralar; havuzdaki HER satırın
 *     forward getirisi elimizde → seçim kümesi farkı yanlılık yaratmaz.
 *  3. Net-of-cost + rejim-kırılımlı: getiriler yön-düzeltmeli + komisyon düşülü; equity
 *     eğrisinden Sharpe/max-drawdown; boğa/ayı/yatay ayrı.
 *
 * DÜRÜST SINIR: signal_performance geçmişte macroScore (macro_snapshots'tan) DIŞINDA
 * sektör/temel/exposure-sektör bağlamı saklamaz → bu harness öncelikle "skaler makronun
 * ranking'den çıkarılması" + sıralama kararlılığı etkisini izole eder. Sektör/temel/exposure
 * kanalları tarihsel yeniden-kurulamadığı için bu koşuda ~nötr (route caveat'ında belirtilir).
 */

import type { MacroScoreResult } from '@/lib/macro-score';
import { computeDecision, dbRowsToStockSignals } from '@/lib/decision-engine';
import { getCanonicalField } from '@/lib/signal-horizons';

/** Gidiş-dönüş komisyon (getiri decimal kesirle aynı ölçek: 0.004 = %0.4). */
export const AB_COMMISSION = 0.004;

export interface AbSignalRow {
  sembol: string;
  signal_type: string;
  direction: string;
  entry_time: string;
  confluence_score: number | null;
  weekly_aligned: boolean | null;
  regime: string | null;
  return_3d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d: number | null;
}

export interface AbEvent {
  sembol: string;
  entryTime: string;
  regime: string;
  direction: 'yukari' | 'asagi' | 'notr';
  /** Kanonik ufuk, yön-düzeltmeli, komisyon düşülü net getiri (decimal). */
  netReturn: number;
  v1Score: number;
  v2Score: number;
}

/** signal_performance regime metnini kaba kovaya indir (rapor kırılımı). */
export function bucketRegime(regime: string | null): 'boğa' | 'ayı' | 'yatay' | 'bilinmiyor' {
  if (!regime) return 'bilinmiyor';
  if (regime.includes('bull')) return 'boğa';
  if (regime.includes('bear')) return 'ayı';
  if (regime.includes('side')) return 'yatay';
  return 'bilinmiyor';
}

function normDirection(d: string): 'yukari' | 'asagi' | 'notr' {
  return d === 'yukari' ? 'yukari' : d === 'asagi' ? 'asagi' : 'notr';
}

/** Satırın kanonik ufuk, yön-düzeltmeli, net getirisi (gecmis-firsatlar ile aynı tanım). */
export function netReturnOf(row: AbSignalRow): number | null {
  const field = getCanonicalField(row.signal_type);
  const raw = (row as unknown as Record<string, number | null>)[field];
  if (raw == null || !Number.isFinite(raw)) return null;
  // Aşağı yönlü sinyalde getiri işareti çevrilir (düşüşten kazanç)
  const dirAdj = row.direction === 'asagi' ? -raw : raw;
  return dirAdj - AB_COMMISSION;
}

/**
 * Bir satırı v1 VE v2 ile yeniden skorlar (point-in-time; timeDecay≈1 için scannedAt=now).
 * macroScoreValue verilirse (macro_snapshots'tan) v1 makro-hizasını kullanır, v2 kullanmaz
 * → asıl tez farkı burada oluşur.
 */
export function scoreRow(row: AbSignalRow, macroScoreValue: number | null): { v1: number; v2: number } {
  const signals = dbRowsToStockSignals([{
    signal_type: row.signal_type,
    direction: row.direction,
    sembol: row.sembol,
    confluence_score: row.confluence_score,
    weekly_aligned: row.weekly_aligned,
  }]);
  const nowIso = new Date().toISOString(); // staleness≈0 → üretim-anı skoru yeniden kur
  const macroScore = macroScoreValue != null ? ({ score: macroScoreValue } as MacroScoreResult) : null;

  const v1 = computeDecision({
    signals, scannedAt: nowIso, dataSource: 'db_snapshot', macroScore, regime: row.regime, scoringV2: false,
  }).score;
  const v2 = computeDecision({
    signals, scannedAt: nowIso, dataSource: 'db_snapshot', macroScore, regime: row.regime,
    surface: 'short', scoringV2: true,
  }).score;
  return { v1, v2 };
}

/** DB satırlarından ölçüm event'leri kur (getirisi hesaplanamayan satır atlanır). */
export function buildEvents(rows: AbSignalRow[], macroByDate: Map<string, number>): AbEvent[] {
  const events: AbEvent[] = [];
  for (const row of rows) {
    const netReturn = netReturnOf(row);
    if (netReturn == null) continue;
    const dateKey = row.entry_time.slice(0, 10);
    const { v1, v2 } = scoreRow(row, macroByDate.get(dateKey) ?? null);
    events.push({
      sembol: row.sembol,
      entryTime: row.entry_time,
      regime: bucketRegime(row.regime),
      direction: normDirection(row.direction),
      netReturn,
      v1Score: v1,
      v2Score: v2,
    });
  }
  return events;
}

// ── Metrikler ────────────────────────────────────────────────────────────────

export interface AbMetrics {
  n: number;
  /** Kazanan oran (net > 0). */
  winRate: number;
  /** Ortalama net getiri (decimal). */
  avgReturn: number;
  /** İşlem-başı Sharpe (ortalama / std; YILLIKLANMAMIŞ — kıyas amaçlı). */
  sharpe: number;
  /** Maksimum drawdown (pozitif kesir; equity tepe→dip). */
  maxDrawdown: number;
}

const EMPTY_METRICS: AbMetrics = { n: 0, winRate: 0, avgReturn: 0, sharpe: 0, maxDrawdown: 0 };

/**
 * Zaman-sıralı net getiri serisinden metrikler. Sharpe işlem-başı (mean/std, örneklem std);
 * maxDrawdown compound equity eğrisinden. Boş seri → sıfır metrik.
 */
export function computeMetrics(returnsTimeOrdered: number[]): AbMetrics {
  const n = returnsTimeOrdered.length;
  if (n === 0) return { ...EMPTY_METRICS };

  const winRate = returnsTimeOrdered.filter((r) => r > 0).length / n;
  const avgReturn = returnsTimeOrdered.reduce((a, b) => a + b, 0) / n;

  let sharpe = 0;
  if (n >= 2) {
    const variance = returnsTimeOrdered.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);
    sharpe = std > 1e-9 ? avgReturn / std : 0;
  }

  // Compound equity → max drawdown
  let equity = 1, peak = 1, maxDrawdown = 0;
  for (const r of returnsTimeOrdered) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    n,
    winRate: round4(winRate),
    avgReturn: round4(avgReturn),
    sharpe: round4(sharpe),
    maxDrawdown: round4(maxDrawdown),
  };
}

function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

// ── A/B karşılaştırma ──────────────────────────────────────────────────────

export interface AbSideMetrics extends AbMetrics {
  selectedCount: number;
  selectionRate: number;
}

export interface AbComparison {
  poolSize: number;
  threshold: number;
  longOnly: boolean;
  a: AbSideMetrics; // v1 sıralaması
  b: AbSideMetrics; // v2 sıralaması
  byRegime: Record<string, { a: AbSideMetrics; b: AbSideMetrics }>;
  note: string;
}

function selectAndMeasure(events: AbEvent[], scoreOf: (e: AbEvent) => number, threshold: number): AbSideMetrics {
  const selected = events
    .filter((e) => scoreOf(e) >= threshold)
    .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  const metrics = computeMetrics(selected.map((e) => e.netReturn));
  return {
    ...metrics,
    selectedCount: selected.length,
    selectionRate: events.length > 0 ? round4(selected.length / events.length) : 0,
  };
}

/**
 * A (v1 skoru) vs B (v2 skoru) — eşik üstü seçim, net-of-cost metrik, rejim kırılımı.
 * longOnly (varsayılan): yalnız yukarı yönlü sinyaller (BIST bireysel gerçekçiliği — açığa
 * satış pratikte zor). Seçim eşik-tabanlı: A ve B farklı sayıda seçebilir (gerçek davranış);
 * selectedCount/selectionRate ile şeffaf.
 */
export function runAb(
  events: AbEvent[],
  opts: { threshold?: number; longOnly?: boolean } = {},
): AbComparison {
  const threshold = opts.threshold ?? 65; // "Al" eşiği
  const longOnly = opts.longOnly ?? true;
  const pool = longOnly ? events.filter((e) => e.direction === 'yukari') : events;

  const byRegime: AbComparison['byRegime'] = {};
  for (const bucket of ['boğa', 'ayı', 'yatay', 'bilinmiyor']) {
    const sub = pool.filter((e) => e.regime === bucket);
    if (sub.length === 0) continue;
    byRegime[bucket] = {
      a: selectAndMeasure(sub, (e) => e.v1Score, threshold),
      b: selectAndMeasure(sub, (e) => e.v2Score, threshold),
    };
  }

  return {
    poolSize: pool.length,
    threshold,
    longOnly,
    a: selectAndMeasure(pool, (e) => e.v1Score, threshold),
    b: selectAndMeasure(pool, (e) => e.v2Score, threshold),
    byRegime,
    note:
      'A=v1, B=v2 aynı havuzu yeniden sıralar (survivorship yok — tüm satırların forward ' +
      'getirisi mevcut). Bu koşu öncelikle skaler-makro-çıkarımı + sıralama etkisini ölçer; ' +
      'sektör/temel/exposure-sektör kanalları tarihsel bağlam eksikliğiyle bu harness\'te ~nötr.',
  };
}
