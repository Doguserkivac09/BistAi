'use client';

/**
 * Backtest başarı oranı rozeti — bir sinyal tipinin geçmiş performansı.
 *
 * - Eşik: n ≥ 30 (merkezi limit teoremi — backtest v2 ile tutarlı)
 * - Wilson 95% güven aralığı tooltip'te
 * - n < 30 ise: showInsufficient=true → gri "veri yetersiz", false → gizli
 * - Renk: rate ≥ 0.60 yeşil / ≥ 0.45 amber / < 0.45 kırmızı
 */

export interface WinRateStat {
  /** Başarı oranı 0..1 */
  rate: number;
  /** Örneklem büyüklüğü */
  sampleSize: number;
}

interface WinRateBadgeProps {
  stat: WinRateStat | null;
  horizon?: '3g' | '7g' | '14g' | '30g';
  /** n < minSample iken rozet gösterilsin mi? */
  showInsufficient?: boolean;
  /** Minimum güvenilir örneklem (default 30) */
  minSample?: number;
  /** Kompakt mod — sadece yüzde; default false → "7g %67" */
  compact?: boolean;
}

/** Wilson 95% CI — yüzde sınırları döndürür */
function wilsonCI(p: number, n: number): { lower: number; upper: number } | null {
  if (n <= 0 || p < 0 || p > 1) return null;
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lower: Math.max(0, Math.round((center - margin) * 100 * 10) / 10),
    upper: Math.min(100, Math.round((center + margin) * 100 * 10) / 10),
  };
}

export function WinRateBadge({
  stat,
  horizon = '7g',
  showInsufficient = false,
  minSample = 30,
  compact = false,
}: WinRateBadgeProps) {
  // Yetersiz örneklem / veri yok
  if (!stat || stat.sampleSize < minSample) {
    if (!showInsufficient) return null;
    const n = stat?.sampleSize ?? 0;
    return (
      <span
        title={`Bu sinyalin geçmiş kayıtları yetersiz (n=${n}/${minSample}). İstatistiksel çıkarım için en az ${minSample} değerlendirilmiş örnek gerekli.`}
        className="inline-flex items-center gap-0.5 rounded-md border border-zinc-700/50 bg-zinc-800/40 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
      >
        {horizon} n={n}/{minSample}
      </span>
    );
  }

  const pct = Math.round(stat.rate * 100);
  const ci = wilsonCI(stat.rate, stat.sampleSize);

  const cls =
    pct >= 60 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
    pct >= 45 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' :
                'text-red-400 bg-red-500/10 border-red-500/30';

  const tooltip = ci
    ? `Horizon ${horizon} · Başarı %${pct} · n=${stat.sampleSize} · Wilson 95% CI: [%${ci.lower}–%${ci.upper}]`
    : `Horizon ${horizon} · Başarı %${pct} · n=${stat.sampleSize}`;

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      {compact ? `%${pct}` : `${horizon} %${pct}`}
      {!compact && <span className="opacity-60 font-normal">·n{stat.sampleSize}</span>}
    </span>
  );
}
