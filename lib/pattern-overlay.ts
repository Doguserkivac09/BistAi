/**
 * lib/pattern-overlay.ts
 *
 * Formasyon overlay veri üretimi — SAF FONKSİYONLAR (chart bağımsız).
 *
 * Bu modül lightweight-charts'ı import etmez; sadece overlay'ların
 * veri yapısını üretir. Chart entegrasyonu StockChart.tsx'te yapılır.
 * Bu sayede yeni UI'da farklı chart kütüphanesiyle aynı logik kullanılır.
 *
 * UI refactor notu: Yeni UI geldiğinde sadece StockChart.tsx değişir,
 * bu dosya olduğu gibi kalır.
 */

import type { OHLCVCandle, StockSignal } from '@/types';

// ── Overlay veri tipleri ──────────────────────────────────────────────

/** Zaman bazlı çizgi (trendline, kanal kenarı) */
export interface OverlayLine {
  points: Array<{ time: string; value: number }>;
  color: string;
  lineWidth: number;
  /** 0 = Solid, 1 = Dotted, 2 = Dashed */
  lineStyle: number;
  label?: string;
}

/** Yatay fiyat çizgisi (neckline, direnç, destek) */
export interface OverlayHorizontal {
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: number;
  label?: string;
}

/** Nokta marker (dip, tepe, breakout) */
export interface OverlayMarker {
  time: string;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text?: string;
  size?: number;
}

/** Bir formasyonun tüm görsel bileşenleri */
export interface PatternOverlay {
  /** Formasyon tipi — sinyal.type ile eşleşir */
  signalType: string;
  /** 'oluşum' | 'kırılım' | null */
  stage: string | null;
  /** Zaman bazlı çizgiler (trendline, kanal) */
  lines: OverlayLine[];
  /** Yatay seviye çizgileri (neckline, direnç, destek) */
  horizontals: OverlayHorizontal[];
  /** Nokta marker'ları (dip, tepe, breakout noktası) */
  markers: OverlayMarker[];
}

// ── Yardımcılar ───────────────────────────────────────────────────────

/** Mum indeksinden ISO tarih string'i al */
function timeAt(candles: OHLCVCandle[], idx: number): string {
  const c = candles[idx];
  if (!c) return '';
  // date alanı string (YYYY-MM-DD) veya number (unix timestamp)
  if (typeof c.date === 'string') return c.date;
  return new Date(c.date as number * 1000).toISOString().slice(0, 10);
}

/** Candles'ın son N mum'unun başlangıç indeksini döndür */
function windowStart(candles: OHLCVCandle[], windowSize: number): number {
  return Math.max(0, candles.length - windowSize);
}

// ── Formasyon başına overlay üretici ─────────────────────────────────

function buildDoubleBottomOverlay(sig: StockSignal, candles: OHLCVCandle[]): PatternOverlay {
  const d = sig.data as Record<string, number>;
  const lines: OverlayLine[] = [];
  const horizontals: OverlayHorizontal[] = [];
  const markers: OverlayMarker[] = [];
  const isBreakout = (sig.data as Record<string, string>).stage === 'kırılım';

  // Neckline (kırılım teyit çizgisi)
  if (d.neckline) {
    horizontals.push({
      price: d.neckline,
      color: isBreakout ? '#22c55e' : '#ef4444',
      lineWidth: 1,
      lineStyle: isBreakout ? 0 : 2,
      label: `Boyun: ${d.neckline.toFixed(2)}₺`,
    });
  }

  // 2 dip noktası (son 60 mum içinde candlesAgo kullanarak)
  const winStart = windowStart(candles, 60);
  const lastIdx = candles.length - 1;
  if (d.firstDip && d.secondDip) {
    // secondDip daha yakın (son mum'a daha yakın)
    markers.push({
      time: timeAt(candles, lastIdx - Math.round((d.candlesAgo ?? 10) * 1.8)),
      position: 'belowBar',
      shape: 'circle',
      color: '#22c55e',
      text: '1',
      size: 1,
    });
    markers.push({
      time: timeAt(candles, lastIdx - Math.round(d.candlesAgo ?? 5)),
      position: 'belowBar',
      shape: 'circle',
      color: '#22c55e',
      text: '2',
      size: 1,
    });
  } else {
    // candlesAgo yoksa son 2 lokal dip kullan
    const td = candles.slice(winStart);
    const lows = td.map((c, i) => ({ i: winStart + i, v: c.low }));
    lows.sort((a, b) => a.v - b.v);
    const bottom1 = lows[0];
    const bottom2 = lows.find((l) => l.i !== bottom1?.i && Math.abs(l.i - (bottom1?.i ?? 0)) > 5);
    if (bottom1) markers.push({ time: timeAt(candles, bottom1.i), position: 'belowBar', shape: 'circle', color: '#22c55e', text: '1', size: 1 });
    if (bottom2) markers.push({ time: timeAt(candles, bottom2.i), position: 'belowBar', shape: 'circle', color: '#22c55e', text: '2', size: 1 });
  }

  return { signalType: sig.type, stage: (sig.data as Record<string,string>).stage ?? null, lines, horizontals, markers };
}

function buildDoubleTopOverlay(sig: StockSignal, candles: OHLCVCandle[]): PatternOverlay {
  const d = sig.data as Record<string, number>;
  const horizontals: OverlayHorizontal[] = [];
  const markers: OverlayMarker[] = [];
  const isBreakout = (sig.data as Record<string, string>).stage === 'kırılım';

  if (d.neckline) {
    horizontals.push({
      price: d.neckline,
      color: isBreakout ? '#ef4444' : '#f59e0b',
      lineWidth: 1,
      lineStyle: isBreakout ? 0 : 2,
      label: `Boyun: ${d.neckline.toFixed(2)}₺`,
    });
  }

  const lastIdx = candles.length - 1;
  if (d.firstPeak && d.secondPeak) {
    markers.push({ time: timeAt(candles, lastIdx - Math.round((d.candlesAgo ?? 10) * 1.8)), position: 'aboveBar', shape: 'circle', color: '#ef4444', text: '1', size: 1 });
    markers.push({ time: timeAt(candles, lastIdx - Math.round(d.candlesAgo ?? 5)), position: 'aboveBar', shape: 'circle', color: '#ef4444', text: '2', size: 1 });
  } else {
    const winStart = windowStart(candles, 60);
    const td = candles.slice(winStart);
    const highs = td.map((c, i) => ({ i: winStart + i, v: c.high }));
    highs.sort((a, b) => b.v - a.v);
    const top1 = highs[0];
    const top2 = highs.find((h) => h.i !== top1?.i && Math.abs(h.i - (top1?.i ?? 0)) > 5);
    if (top1) markers.push({ time: timeAt(candles, top1.i), position: 'aboveBar', shape: 'circle', color: '#ef4444', text: '1', size: 1 });
    if (top2) markers.push({ time: timeAt(candles, top2.i), position: 'aboveBar', shape: 'circle', color: '#ef4444', text: '2', size: 1 });
  }

  return { signalType: sig.type, stage: (sig.data as Record<string,string>).stage ?? null, lines: [], horizontals, markers };
}

function buildFlagOverlay(sig: StockSignal, candles: OHLCVCandle[], isBull: boolean): PatternOverlay {
  const d = sig.data as Record<string, number | string>;
  const color = isBull ? '#22c55e' : '#ef4444';
  const lines: OverlayLine[] = [];
  const horizontals: OverlayHorizontal[] = [];
  const markers: OverlayMarker[] = [];

  const flagDays = typeof d.flagDays === 'number' ? d.flagDays : 8;
  const lastIdx = candles.length - 1;
  const flagStartIdx = Math.max(0, lastIdx - flagDays);

  // Flag kanal üst/alt çizgisi
  if (typeof d.flagHigh === 'number' && typeof d.flagLow === 'number') {
    const flagPoints = candles.slice(flagStartIdx).map((c, i) => ({
      time: timeAt(candles, flagStartIdx + i),
      value: 0, // placeholder
    }));
    lines.push({
      points: flagPoints.map((p) => ({ time: p.time, value: d.flagHigh as number })),
      color,
      lineWidth: 1,
      lineStyle: 2,
      label: `Flag Üst: ${(d.flagHigh as number).toFixed(2)}₺`,
    });
    lines.push({
      points: flagPoints.map((p) => ({ time: p.time, value: d.flagLow as number })),
      color,
      lineWidth: 1,
      lineStyle: 2,
      label: `Flag Alt: ${(d.flagLow as number).toFixed(2)}₺`,
    });
  }

  // Kırılım marker
  const isBreakout = d.stage === 'kırılım';
  if (isBreakout) {
    markers.push({
      time: timeAt(candles, lastIdx),
      position: isBull ? 'belowBar' : 'aboveBar',
      shape: isBull ? 'arrowUp' : 'arrowDown',
      color,
      text: isBull ? 'Flag ↑' : 'Flag ↓',
      size: 2,
    });
  }

  return { signalType: sig.type, stage: d.stage as string ?? null, lines, horizontals, markers };
}

function buildCupHandleOverlay(sig: StockSignal, candles: OHLCVCandle[]): PatternOverlay {
  const d = sig.data as Record<string, number | string>;
  const lines: OverlayLine[] = [];
  const horizontals: OverlayHorizontal[] = [];
  const markers: OverlayMarker[] = [];

  // Kulp üst seviyesi = breakout level
  if (typeof d.handleHigh === 'number') {
    const isBreakout = d.stage === 'kırılım';
    horizontals.push({
      price: d.handleHigh,
      color: isBreakout ? '#22c55e' : '#f59e0b',
      lineWidth: 2,
      lineStyle: isBreakout ? 0 : 2,
      label: `Kulp / BO: ${(d.handleHigh as number).toFixed(2)}₺`,
    });
  }

  // Kupa dip marker
  if (typeof d.cupBottom === 'number') {
    // Kupa dibinin yaklaşık indeksi
    const winStart = windowStart(candles, 80);
    const minIdx = candles
      .slice(winStart)
      .reduce((best, c, i) => (c.low < candles[winStart + best]!.low ? i : best), 0) + winStart;
    markers.push({
      time: timeAt(candles, minIdx),
      position: 'belowBar',
      shape: 'circle',
      color: '#f59e0b',
      text: 'Kupa',
      size: 1,
    });
  }

  // Sol/Sağ kenar marker'ları
  const lastIdx = candles.length - 1;
  if (typeof d.leftRim === 'number') {
    const approxLeftIdx = windowStart(candles, 80);
    markers.push({ time: timeAt(candles, approxLeftIdx), position: 'aboveBar', shape: 'circle', color: '#f59e0b', text: 'Sol', size: 1 });
  }
  if (typeof d.rightRim === 'number') {
    const approxRightIdx = Math.max(0, lastIdx - 20);
    markers.push({ time: timeAt(candles, approxRightIdx), position: 'aboveBar', shape: 'circle', color: '#f59e0b', text: 'Sağ', size: 1 });
  }

  // Kırılım noktası
  if (d.stage === 'kırılım') {
    markers.push({ time: timeAt(candles, lastIdx), position: 'belowBar', shape: 'arrowUp', color: '#22c55e', text: 'Kırılım', size: 2 });
  }

  return { signalType: sig.type, stage: d.stage as string ?? null, lines, horizontals, markers };
}

function buildInverseHSOverlay(sig: StockSignal, candles: OHLCVCandle[]): PatternOverlay {
  const d = sig.data as Record<string, number | string>;
  const horizontals: OverlayHorizontal[] = [];
  const markers: OverlayMarker[] = [];
  const isBreakout = d.stage === 'kırılım';

  // Neckline
  if (typeof d.neckline === 'number') {
    horizontals.push({
      price: d.neckline,
      color: isBreakout ? '#22c55e' : '#a855f7',
      lineWidth: 2,
      lineStyle: isBreakout ? 0 : 2,
      label: `Boyun: ${(d.neckline as number).toFixed(2)}₺`,
    });
  }

  // 3 dip marker (sol omuz, baş, sağ omuz) — yaklaşık konumlar
  const lastIdx = candles.length - 1;
  const candlesAgoVal = typeof d.candlesAgo === 'number' ? d.candlesAgo : 5;
  const headIdx = Math.max(0, lastIdx - Math.round(candlesAgoVal * 1.5));
  const leftIdx = Math.max(0, headIdx - Math.round(candlesAgoVal * 1.2));
  const rightIdx = Math.max(0, lastIdx - candlesAgoVal);

  markers.push({ time: timeAt(candles, leftIdx), position: 'belowBar', shape: 'circle', color: '#a855f7', text: 'L.S', size: 1 });
  markers.push({ time: timeAt(candles, headIdx), position: 'belowBar', shape: 'circle', color: '#a855f7', text: 'Baş', size: 2 });
  markers.push({ time: timeAt(candles, rightIdx), position: 'belowBar', shape: 'circle', color: '#a855f7', text: 'R.S', size: 1 });

  if (isBreakout) {
    markers.push({ time: timeAt(candles, lastIdx), position: 'belowBar', shape: 'arrowUp', color: '#22c55e', text: 'OBO ↑', size: 2 });
  }

  return { signalType: sig.type, stage: d.stage as string ?? null, lines: [], horizontals, markers };
}

function buildAscendingTriangleOverlay(sig: StockSignal, candles: OHLCVCandle[]): PatternOverlay {
  const d = sig.data as Record<string, number | string>;
  const lines: OverlayLine[] = [];
  const horizontals: OverlayHorizontal[] = [];
  const markers: OverlayMarker[] = [];
  const isBreakout = d.stage === 'kırılım';

  // Yatay direnç
  if (typeof d.resistance === 'number') {
    horizontals.push({
      price: d.resistance,
      color: isBreakout ? '#22c55e' : '#06b6d4',
      lineWidth: 2,
      lineStyle: isBreakout ? 0 : 2,
      label: `Direnç: ${(d.resistance as number).toFixed(2)}₺`,
    });
  }

  // Yükselen alt destek — son 40 mum içinde Higher Lows çizgisi
  const winStart = windowStart(candles, 40);
  const PIVOT_K = 2;
  const pivotLows: Array<{ i: number; v: number }> = [];
  for (let i = winStart + PIVOT_K; i < candles.length - PIVOT_K; i++) {
    const l = candles[i]!.low;
    let isMin = true;
    for (let k = 1; k <= PIVOT_K; k++) {
      if ((candles[i - k]?.low ?? Infinity) <= l || (candles[i + k]?.low ?? Infinity) <= l) {
        isMin = false; break;
      }
    }
    if (isMin) pivotLows.push({ i, v: l });
  }

  if (pivotLows.length >= 2) {
    const [p1, p2] = [pivotLows[0]!, pivotLows[pivotLows.length - 1]!];
    lines.push({
      points: [
        { time: timeAt(candles, p1.i), value: p1.v },
        { time: timeAt(candles, p2.i), value: p2.v },
      ],
      color: '#06b6d4',
      lineWidth: 1,
      lineStyle: 2,
      label: 'Alt Destek',
    });
  }

  if (isBreakout) {
    markers.push({ time: timeAt(candles, candles.length - 1), position: 'belowBar', shape: 'arrowUp', color: '#22c55e', text: 'Üçgen ↑', size: 2 });
  }

  return { signalType: sig.type, stage: d.stage as string ?? null, lines, horizontals, markers };
}

// ── Ana dispatcher ───────────────────────────────────────────────────

const FORMATION_TYPES = new Set([
  'Çift Dip', 'Çift Tepe', 'Bull Flag', 'Bear Flag',
  'Cup & Handle', 'Ters Omuz-Baş-Omuz', 'Yükselen Üçgen',
]);

/** Bir sinyal listesinden formasyon overlay'larını üretir */
export function buildPatternOverlays(
  signals: StockSignal[],
  candles: OHLCVCandle[],
): PatternOverlay[] {
  if (!candles.length) return [];
  return signals
    .filter((s) => FORMATION_TYPES.has(s.type))
    .map((sig): PatternOverlay | null => {
      try {
        switch (sig.type) {
          case 'Çift Dip':             return buildDoubleBottomOverlay(sig, candles);
          case 'Çift Tepe':            return buildDoubleTopOverlay(sig, candles);
          case 'Bull Flag':            return buildFlagOverlay(sig, candles, true);
          case 'Bear Flag':            return buildFlagOverlay(sig, candles, false);
          case 'Cup & Handle':         return buildCupHandleOverlay(sig, candles);
          case 'Ters Omuz-Baş-Omuz':   return buildInverseHSOverlay(sig, candles);
          case 'Yükselen Üçgen':       return buildAscendingTriangleOverlay(sig, candles);
          default:                     return null;
        }
      } catch {
        return null; // Overlay üretim hatası grafik render'ı bozmasın
      }
    })
    .filter((o): o is PatternOverlay => o !== null);
}

/** Formasyon tipi mi? */
export function isFormationSignal(type: string): boolean {
  return FORMATION_TYPES.has(type);
}
