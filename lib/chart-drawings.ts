/**
 * Grafik çizimleri — şekil modeli + localStorage kalıcılığı (sembol başına).
 *
 * InteractiveChart'ta kullanıcının çizdiği trend/yatay/fib/dikdörtgen/metin şekilleri
 * veri-koordinatında ({time, price}) saklanır → pan/zoom'da yerinde kalır, yeniden açılınca
 * geri gelir. Migration YOK; anahtar `ie-chart-drawings:{SYMBOL}`.
 */

export type DrawTool = 'cursor' | 'trend' | 'hline' | 'fib' | 'rect' | 'text';

/** Veri-uzayı çapa: mum zamanı + fiyat. */
export interface Anchor {
  time: string | number; // candle.date ile aynı (YYYY-MM-DD veya unix saniye)
  price: number;
}

interface Base {
  id: string;
  color: string;
}

export interface TrendDrawing extends Base { tool: 'trend'; a: Anchor; b: Anchor; }
export interface HLineDrawing extends Base { tool: 'hline'; price: number; }
export interface FibDrawing extends Base { tool: 'fib'; a: Anchor; b: Anchor; }
export interface RectDrawing extends Base { tool: 'rect'; a: Anchor; b: Anchor; }
export interface TextDrawing extends Base { tool: 'text'; at: Anchor; text: string; }

export type Drawing = TrendDrawing | HLineDrawing | FibDrawing | RectDrawing | TextDrawing;

/** Fibonacci retracement seviyeleri (0=başlangıç, 1=bitiş). */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const KEY_PREFIX = 'ie-chart-drawings:';

export function drawingsKey(symbol: string): string {
  return `${KEY_PREFIX}${symbol.trim().toUpperCase()}`;
}

/** Sembolün kayıtlı çizimlerini yükle (yoksa boş). */
export function loadDrawings(symbol: string): Drawing[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(drawingsKey(symbol));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Drawing[]) : [];
  } catch {
    return [];
  }
}

/** Sembolün çizimlerini kaydet (boşsa anahtarı sil). */
export function saveDrawings(symbol: string, drawings: Drawing[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (!drawings.length) localStorage.removeItem(drawingsKey(symbol));
    else localStorage.setItem(drawingsKey(symbol), JSON.stringify(drawings));
  } catch {
    /* kota/gizli mod — yoksay */
  }
}

/** Basit benzersiz id. */
export function newDrawingId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
