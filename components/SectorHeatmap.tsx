'use client';

import { useState } from 'react';
import type { SectorMomentum } from '@/types/macro';

interface SectorHeatmapProps {
  sectors: SectorMomentum[];
}

function getHeatColor(score: number): string {
  if (score >= 50) return 'bg-green-500/80 hover:bg-green-500';
  if (score >= 20) return 'bg-green-600/50 hover:bg-green-600/70';
  if (score >= -20) return 'bg-zinc-600/50 hover:bg-zinc-600/70';
  if (score >= -50) return 'bg-red-600/50 hover:bg-red-600/70';
  return 'bg-red-500/80 hover:bg-red-500';
}

function getScoreArrow(score: number): string {
  if (score >= 20) return '↑';
  if (score >= -20) return '→';
  return '↓';
}

export default function SectorHeatmap({ sectors }: SectorHeatmapProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (sectors.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-6 text-center text-zinc-500">
        Sektör verisi bulunamadı.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-6">
      <h3 className="text-lg font-semibold text-zinc-100 mb-4">
        Sektör Momentum Haritası
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sectors.map((sector) => (
          <button
            key={sector.sector_id}
            onClick={() =>
              setExpanded(expanded === sector.sector_id ? null : sector.sector_id)
            }
            className={`
              relative rounded-lg p-4 text-left transition-all duration-200
              ${getHeatColor(sector.score)}
              ${expanded === sector.sector_id ? 'ring-2 ring-white/30 col-span-2 sm:col-span-2' : ''}
            `}
          >
            {/* Sektör adı ve skor */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-white truncate pr-2">
                {sector.sector_name}
              </span>
              <span className="text-lg font-bold text-white shrink-0">
                {getScoreArrow(sector.score)}
              </span>
            </div>

            <div className="text-2xl font-bold text-white">
              {sector.score > 0 ? '+' : ''}{sector.score}
            </div>

            <div className="text-xs text-white/70 mt-1">
              {sector.member_count} hisse
            </div>

            {/* Genişletilmiş detay */}
            {expanded === sector.sector_id && (
              <div className="mt-3 pt-3 border-t border-white/20 space-y-1">
                <div className="flex justify-between text-xs text-white/80">
                  <span>Fiyat Momentum</span>
                  <span className="font-mono">{sector.price_momentum}</span>
                </div>
                <div className="flex justify-between text-xs text-white/80">
                  <span>Hacim Akışı</span>
                  <span className="font-mono">{sector.volume_flow}</span>
                </div>
                <div className="flex justify-between text-xs text-white/80">
                  <span>Makro Uyum</span>
                  <span className="font-mono">{sector.macro_alignment}</span>
                </div>
                <div className="flex justify-between text-xs text-white/80 pt-1">
                  <span>🏆 {sector.top_performer}</span>
                  <span>📉 {sector.worst_performer}</span>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
