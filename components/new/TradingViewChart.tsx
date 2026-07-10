'use client';

/**
 * TradingView Advanced Chart widget (embed).
 *
 * FAZ TV (VIOP-TRADINGVIEW-PLAN.md). Harici `tv.js` script'ini runtime yükler;
 * SİZİN sinyaliniz üstüne çizilemez (widget kapalı kutu — kendi overlay için FAZ LC / SignalChart).
 *
 * - Sembol iç formatta gelir (GARAN, XU030, AAPL, F_XU0300825); `toTradingViewSymbol` çevirir.
 * - Tema ThemeProvider(`ie-theme`)'dan gelir; değişince widget remount edilir.
 * - Cleanup: unmount / prop değişiminde container temizlenir (çift-mount FOUC / leak önle).
 * - SSR guard: script yalnız tarayıcıda, tek sefer yüklenir (global flag).
 */

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { toTradingViewSymbol } from '@/lib/tradingview-symbols';

const TV_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';

// Script'i uygulama ömrü boyunca TEK sefer yükle; birden çok grafik aynı global'i paylaşır.
let tvScriptPromise: Promise<void> | null = null;

function loadTvScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  // Zaten yüklüyse
  if ((window as unknown as { TradingView?: unknown }).TradingView) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;

  tvScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TV_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('tv.js yüklenemedi')));
      return;
    }
    const script = document.createElement('script');
    script.src = TV_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      tvScriptPromise = null; // tekrar denenebilsin
      reject(new Error('tv.js yüklenemedi'));
    };
    document.head.appendChild(script);
  });
  return tvScriptPromise;
}

interface TradingViewChartProps {
  /** İç sembol (ör. "GARAN", "XU030", "AAPL", "F_XU0300825"). */
  symbol: string;
  /** TradingView aralığı: "D" (günlük), "60" (60dk), "W" vb. Varsayılan "D". */
  interval?: string;
  /** Grafik yüksekliği (px). Varsayılan 460. */
  height?: number;
  /**
   * Temayı ThemeProvider yerine sabitler. Eski (her zaman koyu) hisse detay sayfası
   * gibi ThemeProvider kapsamı dışındaki yerlerde "dark" geçilir.
   */
  themeOverride?: 'light' | 'dark';
}

export function TradingViewChart({ symbol, interval = 'D', height = 460, themeOverride }: TradingViewChartProps) {
  const { theme: ctxTheme } = useTheme();
  const theme = themeOverride ?? ctxTheme;
  const containerRef = useRef<HTMLDivElement>(null);
  // Her mount için benzersiz DOM id (aynı sayfada birden çok grafik olabilir)
  const idRef = useRef(`tv_${Math.random().toString(36).slice(2)}`);
  const [error, setError] = useState<string | null>(null);

  const { tvSymbol, proxy, proxyNote } = toTradingViewSymbol(symbol);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    loadTvScript()
      .then(() => {
        if (cancelled) return;
        const container = containerRef.current;
        const TV = (window as unknown as { TradingView?: { widget: new (opts: unknown) => unknown } }).TradingView;
        if (!container || !TV) return;
        // Önceki widget'ı temizle (tema/sembol değişimi = remount)
        container.innerHTML = '';
        const mountId = idRef.current;
        const inner = document.createElement('div');
        inner.id = mountId;
        inner.style.height = '100%';
        inner.style.width = '100%';
        container.appendChild(inner);

        // eslint-disable-next-line no-new
        new TV.widget({
          autosize: true,
          symbol: tvSymbol,
          interval,
          timezone: 'Europe/Istanbul',
          theme: theme === 'dark' ? 'dark' : 'light',
          style: '1',
          locale: 'tr',
          hide_side_toolbar: false,
          allow_symbol_change: false,
          container_id: mountId,
        });
      })
      .catch(() => {
        if (!cancelled) setError('Grafik yüklenemedi. Ağ engeli veya reklam engelleyici olabilir.');
      });

    return () => {
      cancelled = true;
      // Cleanup: container'ı boşalt (leak / çift-mount FOUC önle)
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
    // Tema / sembol / aralık değişince yeniden mount et
  }, [tvSymbol, interval, theme]);

  return (
    <div className="w-full">
      {proxy && proxyNote && (
        <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-warn/25 bg-warn/8 px-3 py-2 text-[11px] text-warn">
          <span className="shrink-0">ⓘ</span>
          <span>{proxyNote}</span>
        </div>
      )}
      {error ? (
        <div
          className="flex w-full items-center justify-center rounded-xl border border-hairline bg-fill text-sm text-t3"
          style={{ height }}
        >
          {error}
        </div>
      ) : (
        <div ref={containerRef} style={{ height }} className="w-full overflow-hidden rounded-xl" />
      )}
    </div>
  );
}

export default TradingViewChart;
