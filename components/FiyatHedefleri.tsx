'use client';

import type { PriceTargets } from '@/lib/price-targets';

interface FiyatHedefleriProps {
  priceTargets: PriceTargets;
  /** Sinyal yönü — görsel düzeni ayarlar */
  direction?: 'yukari' | 'asagi' | 'nötr';
}

export function FiyatHedefleri({ priceTargets, direction = 'yukari' }: FiyatHedefleriProps) {
  const { currentPrice, stopLoss, target1, target2, riskReward } = priceTargets;

  // Tüm fiyat noktalarını topla
  const allPrices = [
    stopLoss?.price,
    currentPrice,
    target1?.price,
    target2?.price,
  ].filter((p): p is number => p !== undefined);

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const range    = maxPrice - minPrice || 1;
  const toPct    = (p: number) => Math.max(2, Math.min(98, ((p - minPrice) / range) * 100));

  const isDown  = direction === 'asagi';
  const hasData = stopLoss || target1 || target2;

  if (!hasData) {
    return (
      <p className="text-sm text-text-secondary">
        Yeterli destek/direnç verisi yok.
      </p>
    );
  }

  // Sütun sırası: düşüş için [T2][T1][Mevcut][Stop], yükseliş için [Stop][Mevcut][T1][T2]
  const cells = isDown
    ? [
        target2  && { ...target2,  variant: 'success-muted' as const, label: 'Hedef 2' },
        target1  && { ...target1,  variant: 'success'       as const, label: 'Hedef 1' },
                    { price: currentPrice, distancePct: 0, variant: 'neutral' as const, label: 'Mevcut' },
        stopLoss && { ...stopLoss, variant: 'danger'        as const, label: 'Stop Loss' },
      ]
    : [
        stopLoss && { ...stopLoss, variant: 'danger'        as const, label: 'Stop Loss' },
                    { price: currentPrice, distancePct: 0, variant: 'neutral' as const, label: 'Mevcut' },
        target1  && { ...target1,  variant: 'success'       as const, label: 'Hedef 1' },
        target2  && { ...target2,  variant: 'success-muted' as const, label: 'Hedef 2' },
      ];

  const visibleCells = cells.filter(Boolean) as Array<{
    price: number; distancePct: number;
    variant: 'danger' | 'neutral' | 'success' | 'success-muted';
    label: string;
  }>;

  return (
    <div className="space-y-4">
      {/* ── Ruler görselleştirmesi ───────────────────────────────── */}
      <div className="relative h-8 rounded-full bg-surface-alt overflow-hidden">
        {/* Stop bölgesi (kırmızı) */}
        {stopLoss && (
          <div
            className={`absolute inset-y-0 ${isDown ? 'bg-red-500/20' : 'bg-red-500/20'}`}
            style={isDown
              ? { left: `${toPct(currentPrice)}%`, right: `${100 - toPct(stopLoss.price)}%` }
              : { left: `${toPct(stopLoss.price)}%`, right: `${100 - toPct(currentPrice)}%` }
            }
          />
        )}
        {/* Hedef bölgesi (yeşil) */}
        {target1 && (
          <div
            className="absolute inset-y-0 bg-emerald-500/20"
            style={isDown
              ? { left: `${toPct(target1.price)}%`, right: `${100 - toPct(currentPrice)}%` }
              : { left: `${toPct(currentPrice)}%`, right: `${100 - toPct(target1.price)}%` }
            }
          />
        )}

        {/* Stop Loss çizgisi */}
        {stopLoss && (
          <div className="absolute inset-y-0 w-px bg-red-500/80"
            style={{ left: `${toPct(stopLoss.price)}%` }} />
        )}
        {/* Hedef 1 çizgisi */}
        {target1 && (
          <div className="absolute inset-y-0 w-px bg-emerald-500/80"
            style={{ left: `${toPct(target1.price)}%` }} />
        )}
        {/* Hedef 2 çizgisi */}
        {target2 && (
          <div className="absolute inset-y-0 w-px bg-emerald-400/50"
            style={{ left: `${toPct(target2.price)}%` }} />
        )}
        {/* Mevcut fiyat iğnesi */}
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 bg-background shadow-lg"
          style={{ left: `${toPct(currentPrice)}%` }}
        />
      </div>

      {/* ── Fiyat hücreleri ──────────────────────────────────────── */}
      <div className={`grid gap-2 ${visibleCells.length === 4 ? 'grid-cols-4' : visibleCells.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {visibleCells.map((cell) => (
          <PriceCell key={cell.label} {...cell} isDown={isDown} />
        ))}
      </div>

      {/* Hedef bulunamadı uyarısı */}
      {!target1 && (
        <p className="text-xs text-text-muted">
          {isDown
            ? 'Destek seviyesi bulunamadı — hedef hesaplanamıyor.'
            : 'Direnç seviyesi bulunamadı — hedef hesaplanamıyor.'}
        </p>
      )}

      {/* ── R/R Oranı ────────────────────────────────────────────── */}
      {riskReward !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="text-xs text-text-secondary">Risk/Ödül:</span>
          <span className={`text-sm font-semibold ${
            riskReward >= 2 ? 'text-emerald-400' : riskReward >= 1 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            1:{riskReward}
          </span>
          <span className="text-xs text-text-muted">
            {riskReward >= 2 ? '— İyi oran' : riskReward >= 1 ? '— Kabul edilebilir' : '— Riskli'}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Alt bileşen ──────────────────────────────────────────────────────

interface PriceCellProps {
  label: string;
  price: number;
  distancePct: number;
  variant: 'danger' | 'neutral' | 'success' | 'success-muted';
  isDown: boolean;
}

function PriceCell({ label, price, distancePct, variant, isDown }: PriceCellProps) {
  const colorMap = {
    danger:       'text-red-400',
    neutral:      'text-text-primary',
    success:      'text-emerald-400',
    'success-muted': 'text-emerald-400/70',
  };
  const bgMap = {
    danger:       'border-red-500/30 bg-red-500/5',
    neutral:      'border-border bg-surface',
    success:      'border-emerald-500/30 bg-emerald-500/5',
    'success-muted': 'border-emerald-500/20 bg-emerald-500/5',
  };

  // Stop loss için "risk" ifadesi
  const isStop = label === 'Stop Loss';
  const pctColor = isStop
    ? 'text-red-400'
    : distancePct > 0 ? 'text-emerald-400' : distancePct < 0 ? 'text-red-400' : '';

  // Düşüş sinyalinde stop loss pozitif % = yukarı yön riski → "↑ risk" olarak göster
  const pctLabel = isStop
    ? (isDown ? `+${Math.abs(distancePct)}% ↑` : `-${Math.abs(distancePct)}% ↓`)
    : distancePct !== 0
      ? `${distancePct > 0 ? '+' : ''}${distancePct}%`
      : null;

  return (
    <div className={`rounded-lg border p-2 text-center ${bgMap[variant]}`}>
      <p className="text-[10px] text-text-muted mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${colorMap[variant]}`}>
        {price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₺
      </p>
      {pctLabel && (
        <p className={`text-[10px] ${pctColor}`}>{pctLabel}</p>
      )}
    </div>
  );
}
