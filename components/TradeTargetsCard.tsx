'use client';

/**
 * İşlem Planı kartı — /api/hisse-analiz priceTargets'ını trader-dostu biçimde gösterir.
 *
 * - Entry (giriş) / Stop / Hedef 1 / Hedef 2 grid
 * - R/R (Risk/Ödül) rasyo rengi: ≥2 yeşil, ≥1 amber, <1 kırmızı
 * - Yön rozeti: yukari=Long / asagi=Short / nötr=Belirsiz
 * - 10.000 TL pozisyon simülasyonu (komisyon hariç)
 * - Tüm hedefler null ise kart görünmez
 */

import type { PriceTargets } from '@/lib/price-targets';

interface TradeTargetsCardProps {
  targets: PriceTargets;
  /** Ham teknik sinyal yönü — priceTargets'ın üretildiği yön. */
  direction?: 'yukari' | 'asagi' | 'nötr';
  /** Simülasyon için varsayılan pozisyon büyüklüğü (TL). */
  positionSize?: number;
}

const POSITION_DEFAULT = 10_000;

function fmtTL(v: number): string {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '₺';
}

function fmtPct(v: number): string {
  const abs = Math.abs(v).toFixed(2);
  return `${v >= 0 ? '+' : '−'}${abs}%`;
}

function fmtKarZarar(tl: number): string {
  // Pozisyon karı/zararı — mutlak TL değeri
  const abs = Math.abs(tl);
  if (abs >= 1000) return Math.round(abs).toLocaleString('tr-TR') + '₺';
  return abs.toFixed(0) + '₺';
}

function rrColorClass(rr: number | null): string {
  if (rr === null) return 'text-text-muted bg-zinc-500/10 border-zinc-500/30';
  if (rr >= 2)     return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (rr >= 1)     return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-red-400 bg-red-500/10 border-red-500/30';
}

function rrLabel(rr: number | null): string {
  if (rr === null) return 'R/R —';
  if (rr >= 2)     return `R/R ${rr.toFixed(1)} ✓`;
  if (rr >= 1)     return `R/R ${rr.toFixed(1)}`;
  return `R/R ${rr.toFixed(1)} ⚠`;
}

function rrTooltip(rr: number | null): string {
  if (rr === null) return 'Risk/Ödül oranı hesaplanamadı (stop veya hedef eksik).';
  if (rr >= 2)     return `Risk/Ödül ${rr.toFixed(2)} — sağlıklı oran (1 birim risk için ${rr.toFixed(1)} birim ödül).`;
  if (rr >= 1)     return `Risk/Ödül ${rr.toFixed(2)} — marjinal, dikkatli pozisyon alın.`;
  return `Risk/Ödül ${rr.toFixed(2)} — zayıf. Riskin ödülden büyük; işlem tavsiye edilmez.`;
}

function DirectionBadge({ direction }: { direction: 'yukari' | 'asagi' | 'nötr' }) {
  const cfg =
    direction === 'yukari'
      ? { label: '↑ Long', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', title: 'Yukarı yönlü işlem — düşüşte stop, yükselişte hedef' }
      : direction === 'asagi'
      ? { label: '↓ Short', cls: 'text-red-400 bg-red-500/10 border-red-500/30', title: 'Aşağı yönlü işlem — yükselişte stop, düşüşte hedef' }
      : { label: '→ Nötr', cls: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30', title: 'Yön belirsiz — varsayılan yukarı kabulüyle hesaplandı' };
  return (
    <span
      title={cfg.title}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

interface LevelCellProps {
  label: string;
  price: number;
  distancePct?: number | null;
  /** Vurgu rengi — entry=nötr, stop=kırmızı, target=yeşil */
  tone: 'entry' | 'stop' | 'target';
}

function LevelCell({ label, price, distancePct, tone }: LevelCellProps) {
  const priceCls =
    tone === 'stop'   ? 'text-red-400'     :
    tone === 'target' ? 'text-emerald-400' :
                        'text-text-primary';
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`truncate font-mono text-base font-bold tabular-nums ${priceCls}`}>
        {fmtTL(price)}
      </p>
      {distancePct !== undefined && distancePct !== null && (
        <p className={`text-[10px] font-medium tabular-nums ${
          distancePct > 0 ? 'text-emerald-400/80' : distancePct < 0 ? 'text-red-400/80' : 'text-text-muted'
        }`}>
          {fmtPct(distancePct)}
        </p>
      )}
    </div>
  );
}

export function TradeTargetsCard({ targets, direction = 'yukari', positionSize = POSITION_DEFAULT }: TradeTargetsCardProps) {
  const { currentPrice, stopLoss, target1, target2, riskReward } = targets;

  // Hiçbir seviye yoksa kartı göstermeye gerek yok
  if (!stopLoss && !target1 && !target2) return null;

  // Pozisyon simülasyonu — hedef/stop mesafesinden TL kar/zarar
  const tp1Kar  = target1  ? (positionSize * Math.abs(target1.distancePct))  / 100 : null;
  const tp2Kar  = target2  ? (positionSize * Math.abs(target2.distancePct))  / 100 : null;
  const stopZar = stopLoss ? (positionSize * Math.abs(stopLoss.distancePct)) / 100 : null;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-border bg-surface">
      {/* Başlık satırı */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-surface-alt/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            🎯 İşlem Planı
          </span>
          <DirectionBadge direction={direction} />
        </div>
        <span
          title={rrTooltip(riskReward)}
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${rrColorClass(riskReward)}`}
        >
          {rrLabel(riskReward)}
        </span>
      </div>

      {/* Seviye ızgarası */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4">
        <LevelCell label="Giriş"   price={currentPrice} tone="entry" />
        {stopLoss && <LevelCell label="Stop Loss" price={stopLoss.price} distancePct={stopLoss.distancePct} tone="stop"   />}
        {target1  && <LevelCell label="Hedef 1"   price={target1.price}  distancePct={target1.distancePct}  tone="target" />}
        {target2  && <LevelCell label="Hedef 2"   price={target2.price}  distancePct={target2.distancePct}  tone="target" />}
      </div>

      {/* Simülasyon şeridi */}
      {(tp1Kar !== null || stopZar !== null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 bg-surface-alt/20 px-4 py-2 text-[11px] text-text-secondary">
          <span className="font-medium text-text-muted">
            💰 {positionSize.toLocaleString('tr-TR')}₺ pozisyonda:
          </span>
          {tp1Kar !== null && (
            <span>
              TP1'de <span className="font-semibold text-emerald-400">+{fmtKarZarar(tp1Kar)}</span>
            </span>
          )}
          {tp2Kar !== null && (
            <span>
              TP2'de <span className="font-semibold text-emerald-400">+{fmtKarZarar(tp2Kar)}</span>
            </span>
          )}
          {stopZar !== null && (
            <span>
              Stop'ta <span className="font-semibold text-red-400">−{fmtKarZarar(stopZar)}</span>
            </span>
          )}
          <span className="ml-auto text-[10px] text-text-muted" title="Komisyon, spread ve vergi bu simülasyona dahil değildir.">
            * komisyon hariç
          </span>
        </div>
      )}
    </div>
  );
}
