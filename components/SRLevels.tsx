'use client';

import type { SRAnalysis } from '@/lib/support-resistance';

interface SRLevelsProps {
  analysis: SRAnalysis;
  compact?: boolean; // StockCard için kısa görünüm
}

function StrengthDots({ strength }: { strength: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < strength ? 'bg-current opacity-100' : 'bg-current opacity-20'}`}
        />
      ))}
    </div>
  );
}

export function SRLevels({ analysis, compact = false }: SRLevelsProps) {
  const { nearestSupport, nearestResistance, currentPrice, positionPct, supports, resistances } = analysis;

  if (!nearestSupport && !nearestResistance) {
    return (
      <p className="text-xs text-text-secondary">Yeterli veri yok.</p>
    );
  }

  if (compact) {
    // StockCard için: sadece en yakın destek/direnç + konum çubuğu
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          {nearestSupport ? (
            <span className="text-green-400 font-medium">
              D: ₺{nearestSupport.price.toFixed(2)}
            </span>
          ) : <span />}
          <span className="text-text-secondary">
            ₺{currentPrice.toFixed(2)}
          </span>
          {nearestResistance ? (
            <span className="text-red-400 font-medium">
              R: ₺{nearestResistance.price.toFixed(2)}
            </span>
          ) : <span />}
        </div>

        {positionPct !== null && (
          <div className="relative h-1.5 rounded-full bg-surface-secondary overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-500 to-red-500"
              style={{ width: `${Math.min(100, Math.max(0, positionPct))}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2.5 w-0.5 bg-white rounded-full"
              style={{ left: `${Math.min(99, Math.max(1, positionPct))}%` }}
            />
          </div>
        )}

        {positionPct !== null && (
          <p className="text-[10px] text-text-secondary text-center">
            {positionPct < 30
              ? '📍 Desteğe yakın'
              : positionPct > 70
              ? '📍 Dirence yakın'
              : '📍 Orta bölge'}
          </p>
        )}
      </div>
    );
  }

  // HisseDetail için: tam tablo
  return (
    <div className="space-y-4">
      {/* Konum çubuğu */}
      {nearestSupport && nearestResistance && positionPct !== null && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-text-secondary">
            <span>Destek: ₺{nearestSupport.price.toFixed(2)}</span>
            <span className="font-medium text-text-primary">₺{currentPrice.toFixed(2)}</span>
            <span>Direnç: ₺{nearestResistance.price.toFixed(2)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-surface-secondary overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
              style={{ width: '100%' }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3.5 w-1 bg-white rounded-full shadow-md"
              style={{ left: `${Math.min(99, Math.max(1, positionPct))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-secondary">
            <span>
              {nearestSupport
                ? `%${(((currentPrice - nearestSupport.price) / nearestSupport.price) * 100).toFixed(1)} destek üstünde`
                : ''}
            </span>
            <span>
              {nearestResistance
                ? `%${(((nearestResistance.price - currentPrice) / currentPrice) * 100).toFixed(1)} dirence kaldı`
                : ''}
            </span>
          </div>
        </div>
      )}

      {/* Direnç seviyeleri */}
      {resistances.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wide">Direnç Seviyeleri</p>
          <div className="space-y-1.5">
            {resistances.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-red-500/5 border border-red-500/20 px-3 py-1.5">
                <div className="flex items-center gap-2 text-red-400">
                  <StrengthDots strength={r.strength} />
                </div>
                <span className="text-sm font-mono font-medium text-red-400">
                  ₺{r.price.toFixed(2)}
                </span>
                <span className="text-[10px] text-text-secondary">
                  +%{(((r.price - currentPrice) / currentPrice) * 100).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destek seviyeleri */}
      {supports.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wide">Destek Seviyeleri</p>
          <div className="space-y-1.5">
            {supports.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-green-500/5 border border-green-500/20 px-3 py-1.5">
                <div className="flex items-center gap-2 text-green-400">
                  <StrengthDots strength={s.strength} />
                </div>
                <span className="text-sm font-mono font-medium text-green-400">
                  ₺{s.price.toFixed(2)}
                </span>
                <span className="text-[10px] text-text-secondary">
                  -%{(((currentPrice - s.price) / currentPrice) * 100).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-text-secondary">
        * Güç göstergesi (nokta sayısı): o seviyenin kaç kez test edildiğini gösterir.
      </p>
    </div>
  );
}
