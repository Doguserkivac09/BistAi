'use client';

import type { RiskScore } from '@/types/macro';

interface RiskGaugeProps {
  risk: RiskScore;
}

const STATUS_CONFIG = {
  'risk-on': { label: 'Risk-On', color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30' },
  neutral: { label: 'Nötr', color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30' },
  'risk-off': { label: 'Risk-Off', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30' },
} as const;

const COMPONENT_LABELS: Record<string, string> = {
  vix_component: 'VIX Volatilite',
  yield_component: 'Faiz & Yield Curve',
  currency_component: 'Dolar Endeksi',
  regime_component: 'BIST Rejimi',
};

function getScoreColor(score: number): string {
  if (score <= 35) return '#22c55e'; // yeşil
  if (score <= 65) return '#eab308'; // sarı
  return '#ef4444'; // kırmızı
}

function getBarColor(value: number): string {
  const ratio = value / 25;
  if (ratio <= 0.4) return 'bg-green-500';
  if (ratio <= 0.7) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function RiskGauge({ risk }: RiskGaugeProps) {
  const config = STATUS_CONFIG[risk.status];
  const scoreColor = getScoreColor(risk.score);

  // SVG dairesel gösterge parametreleri
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const progress = (risk.score / 100) * circumference;

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-6`}>
      <h3 className="text-lg font-semibold text-zinc-100 mb-4">Piyasa Risk Skoru</h3>

      {/* Dairesel Gösterge */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 160 160">
            {/* Arka plan daire */}
            <circle
              cx="80" cy="80" r={radius}
              fill="none"
              stroke="#3f3f46"
              strokeWidth="12"
            />
            {/* İlerleme dairesi */}
            <circle
              cx="80" cy="80" r={radius}
              fill="none"
              stroke={scoreColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              transform="rotate(-90 80 80)"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          {/* Merkez metin */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold" style={{ color: scoreColor }}>
              {risk.score}
            </span>
            <span className={`text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>
        </div>
      </div>

      {/* Bileşen Çubukları */}
      <div className="space-y-3">
        {Object.entries(risk.components).map(([key, value]) => (
          <div key={key}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-zinc-400">{COMPONENT_LABELS[key] ?? key}</span>
              <span className="text-zinc-300 font-mono">{value}/25</span>
            </div>
            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getBarColor(value)}`}
                style={{ width: `${(value / 25) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
