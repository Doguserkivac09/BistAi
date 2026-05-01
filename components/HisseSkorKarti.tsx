'use client';

import type { StockScoreResult, ScoreDimension } from '@/lib/stock-score';

interface HisseSkorKartiProps {
  result: StockScoreResult;
}

const DIMENSION_ICONS: Record<string, string> = {
  trend:      '📈',
  momentum:   '⚡',
  hacim:      '📊',
  sinyal:     '🎯',
  volatilite: '🌊',
};

/**
 * Hisse Skor Kartı bileşeni.
 * 5 boyutlu teknik puanlama görselleştirir.
 */
export function HisseSkorKarti({ result }: HisseSkorKartiProps) {
  return (
    <div className="space-y-4">
      {/* Skor sistemi etiketi (kafa karışıklığını önle) */}
      <div
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/50"
        title="Teknik Skor — sadece fiyat/hacim göstergeleri (trend, momentum, hacim, sinyal, volatilite). Kısa vade teknik sağlık (0-100). Bu sayfa ayrıca: 'Sinyal Skoru' (-100/+100, makro+sektör dahil) ve 'Yatırım Skoru' (0-100, temeller) gösterir — üçü farklı sorulara cevap."
      >
        <span>📈 Teknik Skor</span>
        <span className="text-text-secondary/30 normal-case font-normal">· 5 boyut ⓘ</span>
      </div>

      {/* Toplam skor başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-lg font-bold text-text-primary border border-border">
            {result.totalScore}
          </div>
          <div>
            <p className={`text-base font-semibold ${result.color}`}>{result.label}</p>
            <StarRating stars={result.stars} />
          </div>
        </div>
        <ScoreRing score={result.totalScore} color={result.color} />
      </div>

      {/* Boyut çubukları */}
      <div className="space-y-2.5">
        {result.dimensions.map((dim) => (
          <DimensionBar key={dim.key} dim={dim} />
        ))}
      </div>
    </div>
  );
}

// ── Alt Bileşenler ───────────────────────────────────────────────────

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`text-sm ${i <= stars ? 'text-yellow-400' : 'text-border'}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  // SVG daire progress
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const strokeColor =
    score >= 70 ? '#34d399' :
    score >= 50 ? '#fbbf24' :
    score >= 30 ? '#f97316' :
    '#f87171';

  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <svg className="-rotate-90" width="56" height="56" viewBox="0 0 56 56">
        {/* Arkaplan daire */}
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-border"
        />
        {/* İlerleme daire */}
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className={`absolute text-xs font-bold ${color}`}>{score}</span>
    </div>
  );
}

function DimensionBar({ dim }: { dim: ScoreDimension }) {
  const icon = DIMENSION_ICONS[dim.key] ?? '•';

  const barColor =
    dim.score >= 70 ? 'bg-emerald-500' :
    dim.score >= 50 ? 'bg-yellow-500' :
    dim.score >= 30 ? 'bg-orange-500' :
    'bg-red-500';

  const textColor =
    dim.score >= 70 ? 'text-emerald-400' :
    dim.score >= 50 ? 'text-yellow-400' :
    dim.score >= 30 ? 'text-orange-400' :
    'text-red-400';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-medium text-text-secondary">{dim.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted truncate max-w-[140px] hidden sm:block">
            {dim.description}
          </span>
          <span className={`text-xs font-semibold ${textColor} w-8 text-right`}>{dim.score}</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${dim.score}%` }}
        />
      </div>
    </div>
  );
}
