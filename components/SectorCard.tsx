'use client';

import type { SectorMomentum } from '@/types/macro';

interface SectorCardProps {
  sector: SectorMomentum;
}

function getDirectionStyle(score: number) {
  if (score >= 20) return { arrow: '▲', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' };
  if (score >= -20) return { arrow: '▶', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' };
  return { arrow: '▼', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
}

export default function SectorCard({ sector }: SectorCardProps) {
  const dir = getDirectionStyle(sector.score);

  return (
    <div className={`rounded-xl border ${dir.bg} p-4`}>
      {/* Başlık */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-zinc-100">{sector.sector_name}</h4>
        <span className={`text-2xl ${dir.color}`}>{dir.arrow}</span>
      </div>

      {/* Skor */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-3xl font-bold ${dir.color}`}>
          {sector.score > 0 ? '+' : ''}{sector.score}
        </span>
        <span className="text-xs text-zinc-500">/ 100</span>
      </div>

      {/* Bileşenler */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Fiyat Momentum</span>
          <span className="text-zinc-300 font-mono">{sector.price_momentum}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Hacim Akışı</span>
          <span className="text-zinc-300 font-mono">{sector.volume_flow}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Makro Uyum</span>
          <span className="text-zinc-300 font-mono">{sector.macro_alignment}</span>
        </div>
      </div>

      {/* Performans */}
      <div className="flex justify-between text-xs border-t border-zinc-700/50 pt-2">
        <span className="text-green-400">🏆 {sector.top_performer}</span>
        <span className="text-red-400">📉 {sector.worst_performer}</span>
      </div>

      {/* Alt bilgi */}
      <div className="flex justify-between text-xs text-zinc-500 mt-2">
        <span>{sector.member_count} hisse</span>
        <span>Sinyal: {sector.signal_density}</span>
      </div>
    </div>
  );
}
