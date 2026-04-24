'use client';

/**
 * Investable Edge — Investment Score Card
 *
 * Deterministik skoru + AI yorum katmanını birlikte gösterir.
 * Veri kaynağı: GET /api/investment-score?sembol=X
 *
 * Görsel dil: components/ScoreBreakdown.tsx örneği — ring gauge + sub-score barları.
 * AI yorumu (summary/risks/opportunities) expandable accordion altında.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type {
  InvestableConfidence,
  InvestableRating,
  InvestableSubScores,
  InvestableWeights,
} from '@/lib/investment-score';

// ── Tipler ─────────────────────────────────────────────────────────────────

interface ApiResponse {
  sembol: string;
  shortName: string | null;
  sector: string | null;
  score: number;
  subScores: InvestableSubScores;
  appliedWeights: InvestableWeights;
  missingMetrics: string[];
  presentCount: number;
  totalMetrics: number;
  confidence: InvestableConfidence;
  ratingLabel: InvestableRating;
  /** Enflasyon düzeltmesi uygulandıysa dolu olur (BIST hisseleri için) */
  inflationAdjustment?: {
    applied: boolean;
    tufeYoy: number;
    realRevenueGrowth: number | null;
    realEarningsGrowth: number | null;
    peUpperBoundUsed: number;
  };
  summary: string;
  risks: string[];
  opportunities: string[];
  aiGenerated: boolean;
  cached: boolean;
}

interface Props {
  sembol: string;
  /** true → kompakt sürüm (sadece ring + rating), Teknik tab için */
  compact?: boolean;
  /** Kompakt sürümde tıklanınca tetiklenir (örn: "Temel" tab'a yönlendir) */
  onCompactClick?: () => void;
}

// ── Renk helper'ları ───────────────────────────────────────────────────────

const RATING_STYLES: Record<InvestableRating, {
  text: string;
  bg: string;
  ring: string;
  border: string;
  stroke: string;
  emoji: string;
}> = {
  'Güçlü Al':  { text: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'ring-2 ring-emerald-500/40', border: 'border-emerald-500/40', stroke: '#34d399', emoji: '🚀' },
  'Al':        { text: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-1 ring-emerald-400/30', border: 'border-emerald-500/30', stroke: '#10b981', emoji: '📈' },
  'Tut':       { text: 'text-amber-300',   bg: 'bg-amber-500/10',   ring: 'ring-1 ring-amber-400/30',   border: 'border-amber-500/30',   stroke: '#fbbf24', emoji: '⚖️' },
  'Sat':       { text: 'text-orange-400',  bg: 'bg-orange-500/10',  ring: 'ring-1 ring-orange-400/30',  border: 'border-orange-500/30',  stroke: '#fb923c', emoji: '📉' },
  'Güçlü Sat': { text: 'text-red-400',     bg: 'bg-red-500/15',     ring: 'ring-2 ring-red-500/40',     border: 'border-red-500/40',     stroke: '#f87171', emoji: '⚠️' },
};

function scoreBarColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 55) return 'bg-green-500';
  if (score >= 40) return 'bg-amber-500';
  if (score >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}

function scoreTextColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 55) return 'text-green-400';
  if (score >= 40) return 'text-amber-400';
  if (score >= 25) return 'text-orange-400';
  return 'text-red-400';
}

const CONFIDENCE_LABEL: Record<InvestableConfidence, string> = {
  high:   'Yüksek güven',
  medium: 'Orta güven',
  low:    'Düşük güven',
};

const CONFIDENCE_STYLE: Record<InvestableConfidence, string> = {
  high:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low:    'bg-orange-500/10 text-orange-400 border-orange-500/30',
};

// ── Ring Gauge ─────────────────────────────────────────────────────────────

function ScoreRing({
  score, rating, size = 120,
}: { score: number; rating: InvestableRating; size?: number }) {
  const style = RATING_STYLES[rating];
  const stroke = 8;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={style.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="text-center">
        <motion.p
          className={cn('font-bold leading-none tabular-nums', style.text)}
          style={{ fontSize: size * 0.3 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {score}
        </motion.p>
        <p className="text-[10px] text-text-secondary/50 mt-0.5 font-mono">/ 100</p>
      </div>
    </div>
  );
}

// ── Sub-score Bar ──────────────────────────────────────────────────────────

function SubScoreBar({
  label, score, baseWeight, appliedWeight, delay = 0,
}: {
  label: string;
  score: number;
  baseWeight: number;
  appliedWeight: number;
  delay?: number;
}) {
  const reweighted = Math.abs(baseWeight - appliedWeight) > 0.01;
  const pct = Math.max(0, Math.min(100, score));

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-text-secondary flex items-center gap-1.5">
          {label}
          <span
            className={cn(
              'text-[10px] font-mono',
              reweighted ? 'text-amber-400/80' : 'text-text-secondary/40'
            )}
            title={
              reweighted
                ? `Baz %${Math.round(baseWeight * 100)} → yeniden dağıtılmış %${Math.round(appliedWeight * 100)} (eksik metrik nedeniyle normalize edildi)`
                : `Ağırlık %${Math.round(baseWeight * 100)}`
            }
          >
            %{Math.round(appliedWeight * 100)}
            {reweighted && <span className="ml-0.5 text-amber-400/80">*</span>}
          </span>
        </span>
        <span className={cn('font-mono font-semibold text-[11px]', scoreTextColor(score))}>
          {score}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className={cn('absolute left-0 top-0 bottom-0 rounded-full', scoreBarColor(score))}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ── Kompakt Badge (Teknik tab için) ────────────────────────────────────────

function CompactBadge({ data, onClick }: { data: ApiResponse; onClick?: () => void }) {
  const style = RATING_STYLES[data.ratingLabel];
  const Comp: 'button' | 'div' = onClick ? 'button' : 'div';

  return (
    <Comp
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border bg-background/50 p-3 transition-colors',
        style.border,
        onClick && 'hover:bg-background/80 cursor-pointer text-left'
      )}
      title={onClick ? 'Tam skor için Temel sekmesine git' : undefined}
    >
      <div className="flex items-center gap-3">
        <ScoreRing score={data.score} rating={data.ratingLabel} size={64} />
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-bold', style.text)}>
            {style.emoji} {data.ratingLabel}
          </p>
          <p className="text-[10px] text-text-secondary/60 mt-0.5">
            Yatırım Skoru · {CONFIDENCE_LABEL[data.confidence]}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(['valuation', 'growth', 'profitability', 'risk'] as const).map((k) => {
              const labels = { valuation: 'Değ', growth: 'Büy', profitability: 'Kâr', risk: 'Risk' };
              return (
                <span
                  key={k}
                  className={cn(
                    'text-[9px] font-mono rounded px-1 py-0.5',
                    scoreTextColor(data.subScores[k]),
                    'bg-white/5'
                  )}
                >
                  {labels[k]} {data.subScores[k]}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </Comp>
  );
}

// ── Skeleton Loading ───────────────────────────────────────────────────────

function Skeleton({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="rounded-xl border border-border bg-background/50 p-3 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-surface" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-surface" />
            <div className="h-3 w-32 rounded bg-surface" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-background/50 p-5 space-y-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-[120px] w-[120px] rounded-full bg-surface shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="h-6 w-32 rounded bg-surface" />
          <div className="h-4 w-48 rounded bg-surface" />
          <div className="h-5 w-28 rounded-full bg-surface" />
        </div>
      </div>
      <div className="space-y-3 border-t border-border pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-full rounded bg-surface" />
            <div className="h-1.5 w-full rounded-full bg-surface" />
          </div>
        ))}
      </div>
      <div className="h-20 rounded-xl bg-surface" />
    </div>
  );
}

// ── Ana Component ──────────────────────────────────────────────────────────

export function InvestableScoreCard({ sembol, compact = false, onCompactClick }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/investment-score?sembol=${encodeURIComponent(sembol)}`)
      .then(async (r) => {
        if (!r.ok) {
          const payload = await r.json().catch(() => null);
          throw new Error(payload?.error ?? 'Skor alınamadı');
        }
        return r.json() as Promise<ApiResponse>;
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'Skor hesaplanamadı');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [sembol]);

  // Error state
  if (error) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">
          {compact ? '⚠ Yatırım skoru yüklenemedi' : `⚠ Yatırım skoru hesaplanamadı: ${error}`}
        </p>
      </div>
    );
  }

  // Loading state
  if (loading || !data) {
    return <Skeleton compact={compact} />;
  }

  // Compact variant (Teknik tab)
  if (compact) {
    return <CompactBadge data={data} onClick={onCompactClick} />;
  }

  return <FullCard data={data} aiOpen={aiOpen} setAiOpen={setAiOpen} />;
}

// ── Tam Kart ──────────────────────────────────────────────────────────────

function FullCard({
  data, aiOpen, setAiOpen,
}: {
  data: ApiResponse;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
}) {
  const style = RATING_STYLES[data.ratingLabel];
  const hasAiContent = data.summary.length > 0 || data.risks.length > 0 || data.opportunities.length > 0;

  // Ağırlıklar yeniden normalize edildi mi? (Bir boyut eksik metrik nedeniyle 0 olduysa)
  const reweighted = useMemo(() => {
    const base = { valuation: 0.30, growth: 0.25, profitability: 0.20, risk: 0.25 };
    return (['valuation', 'growth', 'profitability', 'risk'] as const).some(
      (k) => Math.abs(base[k] - data.appliedWeights[k]) > 0.01
    );
  }, [data.appliedWeights]);

  return (
    <div className={cn(
      'rounded-2xl border bg-background/50 p-5 space-y-5',
      style.border,
      style.ring
    )}>
      {/* Düşük güven uyarısı */}
      {data.confidence === 'low' && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
        >
          <span className="text-base leading-none">⚠</span>
          <span>
            Bazı temel veriler eksik ({data.presentCount}/{data.totalMetrics} metrik) —
            skor tahminidir, daha fazla veriye sahip hisselerle karşılaştırırken dikkatli olun.
          </span>
        </motion.div>
      )}

      {/* Enflasyon düzeltmesi bilgi satırı (BIST için) */}
      {data.inflationAdjustment?.applied && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-xs text-sky-200/90"
          title="Türkiye yüksek enflasyon ortamında standart F/K ve nominal büyüme yanıltıcı olur. Skor, TÜFE'ye göre düzeltildi."
        >
          <span className="text-base leading-none">🇹🇷</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sky-200">
              Enflasyon düzeltildi · TÜFE %{data.inflationAdjustment.tufeYoy.toFixed(1)}
            </p>
            <p className="text-[11px] text-sky-200/70 mt-0.5">
              {data.inflationAdjustment.realRevenueGrowth !== null && (
                <>
                  Reel gelir büyümesi:{' '}
                  <span className={cn(
                    'font-semibold',
                    data.inflationAdjustment.realRevenueGrowth >= 0 ? 'text-emerald-300' : 'text-red-300'
                  )}>
                    %{(data.inflationAdjustment.realRevenueGrowth * 100).toFixed(1)}
                  </span>
                </>
              )}
              {data.inflationAdjustment.realEarningsGrowth !== null && (
                <>
                  {data.inflationAdjustment.realRevenueGrowth !== null && ' · '}
                  Reel kâr büyümesi:{' '}
                  <span className={cn(
                    'font-semibold',
                    data.inflationAdjustment.realEarningsGrowth >= 0 ? 'text-emerald-300' : 'text-red-300'
                  )}>
                    %{(data.inflationAdjustment.realEarningsGrowth * 100).toFixed(1)}
                  </span>
                </>
              )}
            </p>
          </div>
        </motion.div>
      )}

      {/* Başlık: Ring + Rating */}
      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4">
        <ScoreRing score={data.score} rating={data.ratingLabel} size={120} />

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <motion.p
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35 }}
            className={cn('text-2xl sm:text-3xl font-bold', style.text)}
          >
            {style.emoji} {data.ratingLabel}
          </motion.p>
          <p className="text-xs text-text-secondary/60 mt-1">
            Yatırım Skoru {data.shortName ? `· ${data.shortName}` : ''}
          </p>

          {/* Rozetler */}
          <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              CONFIDENCE_STYLE[data.confidence]
            )}>
              {CONFIDENCE_LABEL[data.confidence]} · {data.presentCount}/{data.totalMetrics}
            </span>
            {data.sector && (
              <span className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] text-text-secondary">
                {data.sector}
              </span>
            )}
            {data.aiGenerated && (
              <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                ✨ AI Yorumu
              </span>
            )}
            {data.cached && (
              <span
                className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] text-text-secondary/60"
                title="Bu yorum son 24 saat içinde üretildi"
              >
                Önbellek
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Alt-skor barları */}
      <div className="space-y-2.5 border-t border-border pt-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/50">
            Alt Skorlar
          </p>
          {reweighted && (
            <p className="text-[10px] text-amber-400/80" title="Bazı ağırlıklar eksik metrik nedeniyle yeniden dağıtıldı">
              * ağırlık yeniden dağıtıldı
            </p>
          )}
        </div>
        <SubScoreBar
          label="Değerleme"
          score={data.subScores.valuation}
          baseWeight={0.30}
          appliedWeight={data.appliedWeights.valuation}
          delay={0.05}
        />
        <SubScoreBar
          label="Büyüme"
          score={data.subScores.growth}
          baseWeight={0.25}
          appliedWeight={data.appliedWeights.growth}
          delay={0.12}
        />
        <SubScoreBar
          label="Kârlılık"
          score={data.subScores.profitability}
          baseWeight={0.20}
          appliedWeight={data.appliedWeights.profitability}
          delay={0.19}
        />
        <SubScoreBar
          label="Risk (yüksek = düşük risk)"
          score={data.subScores.risk}
          baseWeight={0.25}
          appliedWeight={data.appliedWeights.risk}
          delay={0.26}
        />
      </div>

      {/* AI Yorumu — expandable */}
      {hasAiContent && (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setAiOpen(!aiOpen)}
            className="w-full flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
            aria-expanded={aiOpen}
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
              <span className="text-purple-300">✨</span>
              AI Yorumu
            </span>
            <motion.span
              className="text-text-secondary/50"
              animate={{ rotate: aiOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              ▾
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {aiOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-3">
                  {data.summary && (
                    <p className="text-sm leading-relaxed text-text-secondary">
                      {data.summary}
                    </p>
                  )}

                  {data.risks.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-400/80 mb-1.5">
                        <span>🛡️</span> Riskler
                      </p>
                      <ul className="space-y-1">
                        {data.risks.map((r, i) => (
                          <motion.li
                            key={i}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.05 }}
                            className="flex items-start gap-2 text-xs text-text-secondary"
                          >
                            <span className="mt-1 shrink-0 text-red-400/60">•</span>
                            <span>{r}</span>
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.opportunities.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80 mb-1.5">
                        <span>🚀</span> Fırsatlar
                      </p>
                      <ul className="space-y-1">
                        {data.opportunities.map((o, i) => (
                          <motion.li
                            key={i}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.05 }}
                            className="flex items-start gap-2 text-xs text-text-secondary"
                          >
                            <span className="mt-1 shrink-0 text-emerald-400/60">•</span>
                            <span>{o}</span>
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-[10px] text-text-secondary/40 pt-1 border-t border-border/40">
                    Not: Skor deterministik bir motor tarafından hesaplanır. AI yorumu sadece bağlam sağlar; yatırım tavsiyesi değildir.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
