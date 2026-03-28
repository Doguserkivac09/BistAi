'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { CompositeSignalResult, CompositeDecision } from '@/lib/composite-signal';

// ─── Renk yardımcıları ────────────────────────────────────────────────────────

const DECISION_STYLES: Record<CompositeDecision, { bg: string; text: string; border: string; label: string; ring?: string }> = {
  STRONG_BUY:  { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/50', ring: 'ring-2 ring-emerald-500/30', label: 'Güçlü AL' },
  BUY:         { bg: 'bg-green-500/10',   text: 'text-green-400',   border: 'border-green-500/30',   label: 'AL' },
  HOLD:        { bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    border: 'border-zinc-500/30',    label: 'TUT' },
  SELL:        { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30',     label: 'SAT' },
  STRONG_SELL: { bg: 'bg-red-700/20',     text: 'text-red-300',     border: 'border-red-600/50',     ring: 'ring-2 ring-red-600/30',     label: 'Güçlü SAT' },
};

function scoreColor(score: number): string {
  if (score >= 50)  return 'bg-emerald-500';
  if (score >= 20)  return 'bg-green-500';
  if (score >= -20) return 'bg-zinc-500';
  if (score >= -50) return 'bg-orange-500';
  return 'bg-red-500';
}

function scoreTextColor(score: number): string {
  if (score >= 50)  return 'text-emerald-400';
  if (score >= 20)  return 'text-green-400';
  if (score >= -20) return 'text-zinc-400';
  if (score >= -50) return 'text-orange-400';
  return 'text-red-400';
}

// ─── Tek skor çubuğu ─────────────────────────────────────────────────────────

interface ScoreBarProps {
  label: string;
  weight: number;
  score: number;
  delay?: number;
}

function ScoreBar({ label, weight, score, delay = 0 }: ScoreBarProps) {
  // -100/+100 → 0-100% pozisyon (50 = nötr orta)
  const pct = Math.min(100, Math.max(0, (score + 100) / 2));
  const isPositive = score >= 0;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-text-secondary">
          {label}
          <span className="ml-1.5 text-[10px] text-text-secondary/40">%{Math.round(weight * 100)}</span>
        </span>
        <span className={cn('font-mono font-semibold text-[11px]', scoreTextColor(score))}>
          {score > 0 ? '+' : ''}{score}
        </span>
      </div>
      {/* Track */}
      <div className="relative h-1.5 rounded-full bg-white/5 overflow-hidden">
        {/* Nötr çizgi */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />
        {/* Dolgu */}
        <motion.div
          className={cn('absolute top-0 bottom-0 rounded-full', scoreColor(score))}
          style={isPositive
            ? { left: '50%', right: `${100 - pct}%` }
            : { left: `${pct}%`, right: '50%' }
          }
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5, delay, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ─── Güven halkası (SVG) ──────────────────────────────────────────────────────

function ConfidenceRing({ confidence, decision }: { confidence: number; decision: CompositeDecision }) {
  const style = DECISION_STYLES[decision];
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = (confidence / 100) * circ;

  return (
    <div className="relative flex items-center justify-center w-16 h-16 shrink-0">
      <svg width="64" height="64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        <motion.circle
          cx="32" cy="32" r={r}
          fill="none"
          stroke={style.text.replace('text-', 'currentColor')}
          className={style.text}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="text-center">
        <p className={cn('text-lg font-bold leading-none tabular-nums', style.text)}>{confidence}</p>
        <p className="text-[9px] text-text-secondary/50 mt-0.5">Güven</p>
      </div>
    </div>
  );
}

// ─── Kompakt badge (StockCard için) ──────────────────────────────────────────

export function CompositeBadge({ result }: { result: CompositeSignalResult }) {
  const style = DECISION_STYLES[result.decision];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
        style.bg, style.text, style.border
      )}
      title={`Kompozit Karar: ${style.label} | Güven: %${result.confidence} | Teknik: ${result.technicalScore}, Makro: ${result.macroScore}, Sektör: ${result.sectorScore}`}
    >
      {result.emoji} {style.label}
      <span className="opacity-60">%{result.confidence}</span>
    </span>
  );
}

// ─── Tam panel ────────────────────────────────────────────────────────────────

interface ScoreBreakdownProps {
  result: CompositeSignalResult;
  /** true → faktör detaylarını gizle */
  compact?: boolean;
}

export function ScoreBreakdown({ result, compact = false }: ScoreBreakdownProps) {
  const { decision, confidence, compositeScore, technicalScore, macroScore, sectorScore, riskAdjustment, context } = result;
  const style = DECISION_STYLES[decision];

  return (
    <div className={cn('rounded-xl border bg-background/50 p-4 space-y-4', style.ring ?? 'border-border')}>
      {/* Güçlü SAT uyarı banner */}
      {decision === 'STRONG_SELL' && (
        <motion.div
          className="flex items-center gap-2 rounded-lg border border-red-600/40 bg-red-700/15 px-3 py-2 text-xs text-red-300"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-base leading-none">⚠️</span>
          <span>Güçlü satış sinyali — pozisyon ve risk yönetimine dikkat edin.</span>
        </motion.div>
      )}
      {/* Güçlü AL bilgi banner */}
      {decision === 'STRONG_BUY' && (
        <motion.div
          className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-base leading-none">✅</span>
          <span>Güçlü alış sinyali — tüm katmanlar aynı yönü gösteriyor.</span>
        </motion.div>
      )}
      {/* Başlık + karar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ConfidenceRing confidence={confidence} decision={decision} />
          <div>
            <motion.p
              className={cn('text-2xl font-bold', style.text)}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35 }}
            >
              {result.emoji} {style.label}
            </motion.p>
            <p className="text-xs text-text-secondary/60 mt-0.5">Kompozit Karar</p>
          </div>
        </div>

        {/* Skor */}
        <div className="text-right">
          <motion.p
            className={cn('text-3xl font-bold tabular-nums', scoreTextColor(compositeScore))}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            {compositeScore > 0 ? '+' : ''}{compositeScore}
          </motion.p>
          <p className="text-[10px] text-text-secondary/40 font-mono">/ 100</p>
        </div>
      </div>

      {/* Bileşen çubukları */}
      {!compact && (
        <div className="space-y-2.5 border-t border-border pt-3">
          <p className="text-[10px] font-semibold text-text-secondary/50 uppercase tracking-wider mb-2">
            Bileşen Katkıları
          </p>
          <ScoreBar label="Teknik Sinyal" weight={0.50} score={technicalScore} delay={0.1} />
          <ScoreBar label="Makro Rüzgar"  weight={0.30} score={macroScore}     delay={0.2} />
          <ScoreBar label="Sektör Uyumu"  weight={0.20} score={sectorScore}    delay={0.3} />
          {riskAdjustment !== 0 && (
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/50">
              <span className="text-text-secondary/50">Risk Ayarlaması</span>
              <span className={riskAdjustment < 0 ? 'text-red-400 font-mono' : 'text-emerald-400 font-mono'}>
                {riskAdjustment > 0 ? '+' : ''}{riskAdjustment}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Key Factors */}
      {!compact && context.keyFactors.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-[10px] font-semibold text-text-secondary/50 uppercase tracking-wider mb-2">
            Önemli Faktörler
          </p>
          {context.keyFactors.map((f, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-1.5 text-[11px] text-text-secondary"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: 0.3 + i * 0.06 }}
            >
              <span className="mt-0.5 shrink-0 text-primary/60">•</span>
              {f}
            </motion.div>
          ))}
        </div>
      )}

      {/* Bağlam bilgisi */}
      {!compact && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-text-secondary/60">
            📡 {context.signalType}
          </span>
          <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-text-secondary/60">
            🌤 {context.macroLabel}
          </span>
          <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-text-secondary/60">
            📊 {context.sectorName}
          </span>
          <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-text-secondary/60">
            ⚠️ Risk: {context.riskLevel === 'low' ? 'Düşük' : context.riskLevel === 'medium' ? 'Orta' : context.riskLevel === 'high' ? 'Yüksek' : 'Kritik'}
          </span>
        </div>
      )}
    </div>
  );
}
