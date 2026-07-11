'use client';

/**
 * AdvancedChart — TradingView Advanced Charting Library + KENDİ verimiz (UDF datafeed).
 *
 * TradingView'in tam profesyonel arayüzünü (çizim araçları, indikatörler) KENDİ OHLCV
 * verimizle besler → BIST veri-lisansı sorunu YOK, tüm 619 BIST + US hissesi çalışır.
 *
 * ⚠️ Charting Library dosyaları npm'de YOK — TradingView'den erişim alınıp indirilerek
 *    `public/charting_library/` + `public/datafeeds/udf/` altına konur (bkz. TRADINGVIEW-KURULUM.md).
 *    Dosyalar yoksa bu bileşen zarifçe kendi SignalChart'ımıza düşer (BIST grafikleri yine çalışır).
 */

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { SignalChart } from '@/components/new/SignalChart';

// Charting Library statik yolları (public/ altına yerleştirilir)
const LIBRARY_PATH = '/charting_library/';
const LIBRARY_SCRIPT = '/charting_library/charting_library.standalone.js';
const DATAFEED_SCRIPT = '/datafeeds/udf/dist/bundle.js';
const UDF_BASE = '/api/udf';

// Script'leri uygulama ömrü boyunca tek sefer yükle; sonuç cache'lenir (var mı / yok mu).
let libLoadPromise: Promise<boolean> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`yüklenemedi: ${src}`));
    document.head.appendChild(s);
  });
}

/** Charting Library + UDF datafeed script'lerini yükle; başarısızsa (dosyalar yok) false döndür. */
function loadChartingLibrary(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (libLoadPromise) return libLoadPromise;
  libLoadPromise = (async () => {
    try {
      await loadScript(LIBRARY_SCRIPT);
      await loadScript(DATAFEED_SCRIPT);
      const w = window as unknown as { TradingView?: { widget?: unknown }; Datafeeds?: { UDFCompatibleDatafeed?: unknown } };
      return !!(w.TradingView?.widget && w.Datafeeds?.UDFCompatibleDatafeed);
    } catch {
      return false;
    }
  })();
  return libLoadPromise;
}

interface AdvancedChartProps {
  symbol: string;
  /** TradingView aralığı: 'D','60','15','W','M'. Varsayılan 'D'. */
  interval?: string;
  height?: number;
  themeOverride?: 'light' | 'dark';
}

export function AdvancedChart({ symbol, interval = 'D', height = 520, themeOverride }: AdvancedChartProps) {
  const { theme: ctxTheme } = useTheme();
  const theme = themeOverride ?? ctxTheme;
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`tvcl_${Math.random().toString(36).slice(2)}`);
  const [status, setStatus] = useState<'loading' | 'library' | 'fallback'>('loading');

  // Sembolden önek temizle (UDF ticker bekler)
  const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1]! : symbol.trim().toUpperCase();

  useEffect(() => {
    let cancelled = false;
    let widget: { remove?: () => void } | null = null;

    loadChartingLibrary().then((ok) => {
      if (cancelled) return;
      if (!ok) { setStatus('fallback'); return; }

      const container = containerRef.current;
      const w = window as unknown as {
        TradingView: { widget: new (opts: unknown) => { remove?: () => void } };
        Datafeeds: { UDFCompatibleDatafeed: new (base: string) => unknown };
      };
      if (!container) return;
      container.innerHTML = '';
      const mount = document.createElement('div');
      mount.id = idRef.current;
      mount.style.height = '100%';
      mount.style.width = '100%';
      container.appendChild(mount);

      try {
        widget = new w.TradingView.widget({
          symbol: cleanSymbol,
          interval,
          container: mount,
          datafeed: new w.Datafeeds.UDFCompatibleDatafeed(UDF_BASE),
          library_path: LIBRARY_PATH,
          locale: 'tr',
          timezone: 'Europe/Istanbul',
          theme: theme === 'dark' ? 'dark' : 'light',
          autosize: true,
          fullscreen: false,
          disabled_features: ['use_localstorage_for_settings', 'header_symbol_search'],
          enabled_features: [],
        });
        setStatus('library');
      } catch {
        setStatus('fallback');
      }
    });

    return () => {
      cancelled = true;
      try { widget?.remove?.(); } catch { /* ignore */ }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [cleanSymbol, interval, theme]);

  // Kütüphane yoksa → kendi grafiğimiz (BIST verisiyle tam kapsam)
  if (status === 'fallback') {
    return <SignalChart symbol={cleanSymbol} height={height} />;
  }

  return (
    <div className="w-full">
      {status === 'loading' && (
        <div className="flex items-center justify-center text-sm text-t3" style={{ height }}>
          Grafik yükleniyor…
        </div>
      )}
      <div
        ref={containerRef}
        style={{ height, display: status === 'library' ? 'block' : 'none' }}
        className="w-full overflow-hidden rounded-xl"
      />
    </div>
  );
}

export default AdvancedChart;
