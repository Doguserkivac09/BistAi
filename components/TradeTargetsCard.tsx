'use client';

/**
 * İşlem Planı kartı — /api/hisse-analiz priceTargets'ını trader-dostu biçimde gösterir.
 *
 * - Entry (giriş) / Stop / Hedef 1 / Hedef 2 grid
 * - R/R (Risk/Ödül) rasyo rengi: ≥2 yeşil, ≥1 amber, <1 kırmızı
 * - Yön rozeti: yukari=Long / asagi=Short / nötr=Belirsiz
 * - Pozisyon kalkülatörü — sermaye + risk% → önerilen lot (2% kuralı varsayılan)
 * - Tüm hedefler null ise kart görünmez
 */

import { useMemo, useState } from 'react';
import type { PriceTargets, StopSource } from '@/lib/price-targets';

const CAPITAL_KEY = 'bistai_position_capital';
const RISK_KEY    = 'bistai_position_risk_pct';
const CAPITAL_DEFAULT = 100_000;
const RISK_DEFAULT    = 2; // %2 — profesyonel trader kuralı

interface TradeTargetsCardProps {
  targets: PriceTargets;
  /** Ham teknik sinyal yönü — priceTargets'ın üretildiği yön. */
  direction?: 'yukari' | 'asagi' | 'nötr';
}

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
  /** Stop için hibrit kaynak rozeti — 🏗 yapısal / 📏 ATR */
  stopSource?: StopSource;
  /** Alternatif stop fiyatları — tooltip için */
  structuralPrice?: number;
  atrPrice?: number;
}

function StopSourceBadge({ source, structuralPrice, atrPrice }: { source: StopSource; structuralPrice?: number; atrPrice?: number }) {
  const cfg =
    source === 'structural'
      ? { label: '🏗 Yapısal', title: 'Yapısal stop — en yakın destek/direnç seviyesi (S/R pivot)' }
      : source === 'atr'
      ? { label: '📏 ATR', title: 'Volatilite-bazlı stop — giriş ± 2×ATR14. Yapısal seviye fazla uzakta kalıyor.' }
      : { label: '⚙ Hibrit', title: 'Yapısal ve ATR stop\'tan en sıkı olan seçildi.' };

  const altText =
    structuralPrice != null && atrPrice != null
      ? `\nYapısal: ${fmtTL(structuralPrice)} · ATR: ${fmtTL(atrPrice)}`
      : '';

  return (
    <span
      title={cfg.title + altText}
      className="ml-1 inline-flex items-center rounded-sm border border-red-500/30 bg-red-500/10 px-1 py-[1px] text-[9px] font-semibold text-red-300"
    >
      {cfg.label}
    </span>
  );
}

function LevelCell({ label, price, distancePct, tone, stopSource, structuralPrice, atrPrice }: LevelCellProps) {
  const priceCls =
    tone === 'stop'   ? 'text-red-400'     :
    tone === 'target' ? 'text-emerald-400' :
                        'text-text-primary';
  // Mesafe rengi, yüzde işaretine göre değil tone'a göre belirlenmeli.
  // Örn. 'asagi' yönünde stop yukarıda (+%) ama kırmızı olmalı; hedef aşağıda (−%) ama yeşil olmalı.
  const distCls =
    tone === 'stop'   ? 'text-red-400/80'     :
    tone === 'target' ? 'text-emerald-400/80' :
                        'text-text-muted';
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
        {tone === 'stop' && stopSource && (
          <StopSourceBadge source={stopSource} structuralPrice={structuralPrice} atrPrice={atrPrice} />
        )}
      </p>
      <p className={`truncate font-mono text-base font-bold tabular-nums ${priceCls}`}>
        {fmtTL(price)}
      </p>
      {distancePct !== undefined && distancePct !== null && (
        <p className={`text-[10px] font-medium tabular-nums ${distCls}`}>
          {fmtPct(distancePct)}
        </p>
      )}
    </div>
  );
}

export function TradeTargetsCard({ targets, direction = 'yukari' }: TradeTargetsCardProps) {
  const { currentPrice, stopLoss, target1, target2, riskReward } = targets;

  // Pozisyon kalkülatörü state'i — localStorage ile kalıcı
  const [capital, setCapital] = useState<number>(() => {
    if (typeof window === 'undefined') return CAPITAL_DEFAULT;
    const raw = window.localStorage.getItem(CAPITAL_KEY);
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) && v > 0 ? v : CAPITAL_DEFAULT;
  });
  const [riskPct, setRiskPct] = useState<number>(() => {
    if (typeof window === 'undefined') return RISK_DEFAULT;
    const raw = window.localStorage.getItem(RISK_KEY);
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) && v > 0 && v <= 10 ? v : RISK_DEFAULT;
  });

  const updateCapital = (v: number) => {
    setCapital(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(CAPITAL_KEY, String(v));
  };
  const updateRisk = (v: number) => {
    setRiskPct(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(RISK_KEY, String(v));
  };

  // Pozisyon hesapları — sermaye × risk% / hisse başına risk (entry−stop)
  const sizing = useMemo(() => {
    if (!stopLoss || !currentPrice || currentPrice <= 0) return null;
    const perShareRisk = Math.abs(currentPrice - stopLoss.price);
    if (perShareRisk <= 0) return null;
    const riskTL = (capital * riskPct) / 100;
    const rawLot = riskTL / perShareRisk;
    const lot = Math.floor(rawLot);
    if (lot <= 0) return { lot: 0, positionTL: 0, actualRiskTL: 0, riskTL, perShareRisk };
    const positionTL    = lot * currentPrice;
    const actualRiskTL  = lot * perShareRisk;
    return { lot, positionTL, actualRiskTL, riskTL, perShareRisk };
  }, [capital, riskPct, currentPrice, stopLoss]);

  // Hiçbir seviye yoksa kartı göstermeye gerek yok
  if (!stopLoss && !target1 && !target2) return null;

  // Simülasyon — kullanıcının gerçek pozisyon büyüklüğünden TL kar/zarar
  const positionSize = sizing?.positionTL ?? 0;
  const tp1Kar  = sizing && target1  ? (positionSize * Math.abs(target1.distancePct))  / 100 : null;
  const tp2Kar  = sizing && target2  ? (positionSize * Math.abs(target2.distancePct))  / 100 : null;
  const stopZar = sizing && stopLoss ? (positionSize * Math.abs(stopLoss.distancePct)) / 100 : null;

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
        {stopLoss && (
          <LevelCell
            label="Stop Loss"
            price={stopLoss.price}
            distancePct={stopLoss.distancePct}
            tone="stop"
            stopSource={stopLoss.source}
            structuralPrice={stopLoss.structuralPrice}
            atrPrice={stopLoss.atrPrice}
          />
        )}
        {target1  && <LevelCell label="Hedef 1"   price={target1.price}  distancePct={target1.distancePct}  tone="target" />}
        {target2  && <LevelCell label="Hedef 2"   price={target2.price}  distancePct={target2.distancePct}  tone="target" />}
      </div>

      {/* Pozisyon kalkülatörü — sermaye + risk% → önerilen lot */}
      <div className="grid grid-cols-1 gap-3 border-t border-border/60 bg-surface-alt/20 px-4 py-3 text-[11px] sm:grid-cols-[auto_auto_1fr]">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">Sermaye (₺)</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={capital}
            onChange={(e) => updateCapital(Math.max(0, Number(e.target.value) || 0))}
            className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono text-sm tabular-nums text-text-primary focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted"
            title="Sermayenin kaç %'ini tek işlemde riske atacağınız. Profesyonel standart: %1-2."
          >
            Risk %
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0.1}
            max={10}
            step={0.5}
            value={riskPct}
            onChange={(e) => updateRisk(Math.min(10, Math.max(0.1, Number(e.target.value) || RISK_DEFAULT)))}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono text-sm tabular-nums text-text-primary focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-col justify-center">
          {sizing && sizing.lot > 0 ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className="text-[10px] uppercase tracking-wide text-text-muted"
                title={`Formül: floor((${capital.toLocaleString('tr-TR')}₺ × %${riskPct}) / (giriş − stop))`}
              >
                Önerilen Lot
              </span>
              <span className="font-mono text-lg font-bold tabular-nums text-primary">
                {sizing.lot.toLocaleString('tr-TR')}
              </span>
              <span className="text-[10px] text-text-muted">
                ({Math.round(sizing.positionTL).toLocaleString('tr-TR')}₺ pozisyon · gerçek risk ≈ {Math.round(sizing.actualRiskTL).toLocaleString('tr-TR')}₺)
              </span>
            </div>
          ) : stopLoss ? (
            <span className="text-[10px] italic text-amber-400/80">
              Sermaye / risk yetersiz — tek lot bile alınamıyor (risk çok dar).
            </span>
          ) : (
            <span className="text-[10px] italic text-text-muted">
              Stop seviyesi yok — pozisyon hesaplanamıyor.
            </span>
          )}
        </div>
      </div>

      {/* Simülasyon şeridi — hesaplanan lot üzerinden */}
      {sizing && sizing.lot > 0 && (tp1Kar !== null || stopZar !== null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 bg-surface-alt/20 px-4 py-2 text-[11px] text-text-secondary">
          <span className="font-medium text-text-muted">
            💰 Bu pozisyonda:
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
