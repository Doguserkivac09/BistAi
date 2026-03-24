'use client';

import type { PriceTargets } from '@/lib/price-targets';

interface FiyatHedefleriProps {
  priceTargets: PriceTargets;
  direction?: 'yukari' | 'asagi' | 'nötr';
}

export function FiyatHedefleri({ priceTargets, direction }: FiyatHedefleriProps) {
  const { currentPrice, stopLoss, target1, target2, riskReward } = priceTargets;

  // Direction'ı veriden otomatik türet
  const autoDirection: 'yukari' | 'asagi' | 'nötr' =
    direction ??
    (stopLoss
      ? stopLoss.price > currentPrice ? 'asagi' : 'yukari'
      : 'nötr');

  const isDown = autoDirection === 'asagi';
  const hasData = stopLoss || target1;

  if (!hasData) {
    return (
      <p className="text-sm text-text-secondary">
        Yeterli destek/direnç verisi yok.
      </p>
    );
  }

  // Ruler için tüm fiyatları topla
  const allPrices = [
    stopLoss?.price,
    currentPrice,
    target1?.price,
    target2?.price,
  ].filter((p): p is number => p !== undefined);

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const range = maxPrice - minPrice || 1;
  const toPct = (p: number) => Math.max(1, Math.min(99, ((p - minPrice) / range) * 100));

  const currentPct = toPct(currentPrice);
  const stopPct    = stopLoss ? toPct(stopLoss.price) : null;
  const t1Pct      = target1  ? toPct(target1.price)  : null;
  const t2Pct      = target2  ? toPct(target2.price)  : null;

  return (
    <div className="space-y-4">

      {/* ── Ruler ──────────────────────────────────────────────────── */}
      <div className="relative pt-5 pb-3">
        {/* Arka plan çizgisi */}
        <div className="relative h-3 rounded-full bg-white/10 overflow-visible">

          {/* Stop bölgesi (kırmızı) */}
          {stopPct !== null && (
            <div
              className="absolute inset-y-0 rounded-full bg-red-500/30"
              style={isDown
                ? { left: `${currentPct}%`, right: `${100 - stopPct}%` }
                : { left: `${stopPct}%`, right: `${100 - currentPct}%` }
              }
            />
          )}

          {/* Hedef bölgesi (yeşil) */}
          {t1Pct !== null && (
            <div
              className="absolute inset-y-0 rounded-full bg-emerald-500/30"
              style={isDown
                ? { left: `${t1Pct}%`, right: `${100 - currentPct}%` }
                : { left: `${currentPct}%`, right: `${100 - t1Pct}%` }
              }
            />
          )}

          {/* Stop Loss çizgisi */}
          {stopPct !== null && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-400"
              style={{ left: `${stopPct}%` }}>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-wide text-red-400 whitespace-nowrap">
                SL
              </span>
            </div>
          )}

          {/* Hedef 1 çizgisi */}
          {t1Pct !== null && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-400"
              style={{ left: `${t1Pct}%` }}>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-wide text-emerald-400 whitespace-nowrap">
                H1
              </span>
            </div>
          )}

          {/* Hedef 2 çizgisi */}
          {t2Pct !== null && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-400/50"
              style={{ left: `${t2Pct}%` }}>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-emerald-400/60 whitespace-nowrap">
                H2
              </span>
            </div>
          )}

          {/* Mevcut fiyat iğnesi */}
          <div
            className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${currentPct}%` }}
          >
            <div className="h-5 w-5 rounded-full border-2 border-white bg-background shadow-[0_0_0_3px_rgba(255,255,255,0.15)]" />
          </div>
        </div>

        {/* Fiyat etiketleri (ruler altı) */}
        <div className="relative mt-2 h-4">
          {stopPct !== null && stopLoss && (
            <span className="absolute -translate-x-1/2 text-[10px] text-red-400"
              style={{ left: `${stopPct}%` }}>
              {stopLoss.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {t1Pct !== null && target1 && (
            <span className="absolute -translate-x-1/2 text-[10px] text-emerald-400"
              style={{ left: `${t1Pct}%` }}>
              {target1.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {t2Pct !== null && target2 && (
            <span className="absolute -translate-x-1/2 text-[10px] text-emerald-400/60"
              style={{ left: `${t2Pct}%` }}>
              {target2.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>

      {/* ── Fiyat kartları ────────────────────────────────────────── */}
      <div className={`grid gap-2 ${
        (stopLoss && target1 && target2) ? 'grid-cols-4' :
        (stopLoss && target1) ? 'grid-cols-3' : 'grid-cols-2'
      }`}>
        {/* Stop Loss */}
        {stopLoss && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-center">
            <p className="mb-0.5 text-[10px] text-text-muted">Stop Loss</p>
            <p className="text-sm font-bold text-red-400">
              {stopLoss.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺
            </p>
            <p className="text-[10px] text-red-400/80">
              {isDown
                ? `+${Math.abs(stopLoss.distancePct).toFixed(2)}% ↑`
                : `-${Math.abs(stopLoss.distancePct).toFixed(2)}% ↓`}
            </p>
          </div>
        )}

        {/* Mevcut Fiyat */}
        <div className="rounded-lg border border-border bg-surface p-2 text-center ring-1 ring-white/10">
          <p className="mb-0.5 text-[10px] text-text-muted">Mevcut</p>
          <p className="text-sm font-bold text-text-primary">
            {currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺
          </p>
        </div>

        {/* Hedef 1 */}
        {target1 && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
            <p className="mb-0.5 text-[10px] text-text-muted">Hedef 1</p>
            <p className="text-sm font-bold text-emerald-400">
              {target1.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺
            </p>
            <p className="text-[10px] text-emerald-400/80">
              {target1.distancePct > 0 ? '+' : ''}{target1.distancePct.toFixed(2)}%
            </p>
          </div>
        )}

        {/* Hedef 2 */}
        {target2 && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
            <p className="mb-0.5 text-[10px] text-text-muted">Hedef 2</p>
            <p className="text-sm font-bold text-emerald-400/70">
              {target2.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺
            </p>
            <p className="text-[10px] text-emerald-400/60">
              {target2.distancePct > 0 ? '+' : ''}{target2.distancePct.toFixed(2)}%
            </p>
          </div>
        )}
      </div>

      {/* ── R/R Oranı ──────────────────────────────────────────────── */}
      {riskReward !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="text-xs text-text-secondary">Risk/Ödül:</span>
          <span className={`text-sm font-bold ${
            riskReward >= 2 ? 'text-emerald-400' :
            riskReward >= 1 ? 'text-yellow-400' :
            'text-red-400'
          }`}>
            1:{riskReward.toFixed(2)}
          </span>
          <span className="text-xs text-text-muted">
            {riskReward >= 2 ? '— İyi oran' : riskReward >= 1 ? '— Kabul edilebilir' : '— Riskli'}
          </span>
        </div>
      )}
    </div>
  );
}
