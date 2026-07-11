'use client';

/**
 * TradingView tam-grafik modal'ı + tıklanabilir sparkline sarmalayıcısı.
 *
 * Liste satırlarındaki küçük sparkline'lar (MiniChart / SVG) TradingView'e uygun değil
 * (satır başına bir iframe = perf çöker). Bunun yerine sparkline tıklanabilir olur;
 * tıklanınca TradingView tam grafiği MODAL'da açılır — iframe YALNIZ açılınca yüklenir,
 * liste performansı korunur. (Kullanıcı kararı 2026-07-11.)
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AdvancedChart } from '@/components/new/AdvancedChart';
import { SignalChart } from '@/components/new/SignalChart';

type ChartSource = 'tradingview' | 'bistai';

interface TradingViewModalProps {
  symbol: string;
  onClose: () => void;
  /** Eski (koyu) sayfalarda 'dark' geçilir; yeni ekranlarda undefined → ThemeProvider. */
  themeOverride?: 'light' | 'dark';
  /** Başlıkta gösterilecek etiket (varsayılan symbol). */
  title?: string;
}

export function TradingViewModal({ symbol, onClose, themeOverride, title }: TradingViewModalProps) {
  // AdvancedChart (TradingView pro UI + kendi verimiz) tüm sembollerde çalışır (kütüphane
  // gelince). Varsayılan TradingView; "Basit" toggle'ı kendi SignalChart'ımızı gösterir.
  const [source, setSource] = useState<ChartSource>('tradingview');

  // ESC ile kapat + body scroll kilidi
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Portal → document.body: liquid-glass kartlarındaki transform/filter üst öğeleri
  // position:fixed için içeren-blok oluşturup modal'ı 0x0'a hapsediyor. body'ye taşı.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
          <span className="min-w-0 truncate font-manrope text-sm font-bold text-ink">{title ?? symbol}</span>
          <div className="flex items-center gap-2">
            {/* Kaynak toggle: TradingView (pro) / Basit */}
            <div className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5">
              {([
                { key: 'tradingview', label: 'TradingView' },
                { key: 'bistai', label: 'Basit' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSource(opt.key)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                    source === opt.key ? 'bg-ink text-onink' : 'text-t3 hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="rounded-lg px-2 py-1 text-lg leading-none text-t3 hover:bg-fill"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 p-3">
          {source === 'tradingview' ? (
            <AdvancedChart symbol={symbol} height={520} themeOverride={themeOverride} />
          ) : (
            <SignalChart symbol={symbol} height={520} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface SparklineChartButtonProps {
  symbol: string;
  children: React.ReactNode;
  className?: string;
  themeOverride?: 'light' | 'dark';
  title?: string;
}

/**
 * Bir sparkline'ı (children) tıklanabilir yapar; tıklanınca TradingView tam grafik modal'ı açar.
 * Drop-in: <SparklineChartButton symbol={r.sembol}><MiniChart .../></SparklineChartButton>
 */
export function SparklineChartButton({ symbol, children, className, themeOverride, title }: SparklineChartButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        title="Tam grafik (TradingView)"
        className={`cursor-pointer border-0 bg-transparent p-0 text-left ${className ?? ''}`}
      >
        {children}
      </button>
      {open && (
        <TradingViewModal
          symbol={symbol}
          onClose={() => setOpen(false)}
          themeOverride={themeOverride}
          title={title}
        />
      )}
    </>
  );
}

export default TradingViewModal;
