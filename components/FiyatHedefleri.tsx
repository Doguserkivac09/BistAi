'use client';

import type { PriceTargets } from '@/lib/price-targets';

interface FiyatHedefleriProps {
  priceTargets: PriceTargets;
}

/**
 * Fiyat Hedefleri bileşeni.
 * Stop-loss, Hedef 1, Hedef 2 ve Risk/Ödül oranını görsel bant olarak gösterir.
 */
export function FiyatHedefleri({ priceTargets }: FiyatHedefleriProps) {
  const { currentPrice, stopLoss, target1, target2, riskReward } = priceTargets;

  const hasData = stopLoss || target1 || target2;
  if (!hasData) {
    return (
      <p className="text-sm text-text-secondary">
        Fiyat hedefi hesaplamak için yeterli destek/direnç seviyesi bulunamadı.
      </p>
    );
  }

  // Bant görselleştirmesi için min/max hesapla
  const prices = [
    stopLoss?.price,
    currentPrice,
    target1?.price,
    target2?.price,
  ].filter((p): p is number => p !== undefined);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  const toBarPct = (price: number) =>
    Math.max(0, Math.min(100, ((price - minPrice) / range) * 100));

  return (
    <div className="space-y-4">
      {/* Fiyat bant görselleştirmesi */}
      <div className="relative h-10">
        <div className="absolute inset-0 rounded-full bg-surface" />

        {/* Stop Loss bölgesi — kırmızı sol taraf */}
        {stopLoss && target1 && (
          <div
            className="absolute inset-y-0 rounded-l-full bg-red-500/20"
            style={{
              left: `${toBarPct(stopLoss.price)}%`,
              right: `${100 - toBarPct(target1.price)}%`,
            }}
          />
        )}

        {/* Hedef bölgesi — yeşil sağ taraf */}
        {target1 && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-emerald-500/20"
            style={{
              left: `${toBarPct(target1.price)}%`,
              right: target2 ? `${100 - toBarPct(target2.price)}%` : '0%',
            }}
          />
        )}

        {/* Stop Loss işareti */}
        {stopLoss && (
          <div
            className="absolute top-0 h-full w-0.5 bg-red-500"
            style={{ left: `${toBarPct(stopLoss.price)}%` }}
          />
        )}

        {/* Hedef 1 işareti */}
        {target1 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-emerald-500"
            style={{ left: `${toBarPct(target1.price)}%` }}
          />
        )}

        {/* Hedef 2 işareti */}
        {target2 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-emerald-400 opacity-60"
            style={{ left: `${toBarPct(target2.price)}%` }}
          />
        )}

        {/* Mevcut fiyat */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow"
          style={{ left: `${toBarPct(currentPrice)}%` }}
        />
      </div>

      {/* Fiyat etiketi satırı */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stopLoss && (
          <PriceCell
            label="Stop Loss"
            price={stopLoss.price}
            distancePct={stopLoss.distancePct}
            variant="danger"
          />
        )}
        <PriceCell
          label="Mevcut Fiyat"
          price={currentPrice}
          distancePct={0}
          variant="neutral"
        />
        {target1 && (
          <PriceCell
            label="Hedef 1"
            price={target1.price}
            distancePct={target1.distancePct}
            variant="success"
          />
        )}
        {target2 && (
          <PriceCell
            label="Hedef 2"
            price={target2.price}
            distancePct={target2.distancePct}
            variant="success-muted"
          />
        )}
      </div>

      {/* Risk/Ödül */}
      {riskReward !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="text-xs text-text-secondary">Risk/Ödül:</span>
          <span
            className={`text-sm font-semibold ${
              riskReward >= 2
                ? 'text-emerald-400'
                : riskReward >= 1
                ? 'text-yellow-400'
                : 'text-red-400'
            }`}
          >
            1:{riskReward}
          </span>
          <span className="text-xs text-text-muted">
            {riskReward >= 2
              ? '— İyi R/R oranı'
              : riskReward >= 1
              ? '— Kabul edilebilir'
              : '— Riskli'}
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
}

function PriceCell({ label, price, distancePct, variant }: PriceCellProps) {
  const colorMap = {
    danger: 'text-red-400',
    neutral: 'text-text-primary',
    success: 'text-emerald-400',
    'success-muted': 'text-emerald-400/70',
  };
  const bgMap = {
    danger: 'border-red-500/30 bg-red-500/5',
    neutral: 'border-border bg-surface',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    'success-muted': 'border-emerald-500/20 bg-emerald-500/5',
  };

  return (
    <div className={`rounded-lg border p-2 text-center ${bgMap[variant]}`}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-sm font-semibold ${colorMap[variant]}`}>
        {price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₺
      </p>
      {distancePct !== 0 && (
        <p className={`text-xs ${distancePct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {distancePct > 0 ? '+' : ''}{distancePct}%
        </p>
      )}
    </div>
  );
}
