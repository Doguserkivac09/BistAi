// BistAI — TypeScript interfaces

export type SignalSeverity = 'güçlü' | 'orta' | 'zayıf';
export type SignalDirection = 'yukari' | 'asagi' | 'nötr';

export interface OHLCVCandle {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BaseSignal {
  type: string;
  sembol: string;
  severity: SignalSeverity;
  direction: SignalDirection;
  data: Record<string, unknown>;
}

export interface RsiDivergenceData {
  rsiCurrent?: number;
  rsiPrev?: number;
  priceLow1?: number;
  priceLow2?: number;
  priceHigh1?: number;
  priceHigh2?: number;
  divergenceType?: 'bullish' | 'bearish';
}

export interface VolumeAnomalyData {
  currentVolume?: number;
  avgVolume20?: number;
  volumeRatio?: number;
  priceChange?: number;
}

export interface TrendStartData {
  ema9?: number;
  ema21?: number;
  crossoverCandlesAgo?: number;
}

export interface BreakoutData {
  level?: number;
  levelType?: 'support' | 'resistance';
  breakPrice?: number;
  volumeAboveAvg?: boolean;
}

export type SignalData = RsiDivergenceData | VolumeAnomalyData | TrendStartData | BreakoutData;

export interface StockSignal extends BaseSignal {
  data: Record<string, unknown>;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  sembol: string;
  created_at: string;
}

export interface SavedSignal {
  id: string;
  user_id: string;
  sembol: string;
  signal_type: string;
  signal_data: Record<string, unknown>;
  ai_explanation: string;
  created_at: string;
}

export interface User {
  id: string;
  email?: string;
}

export type SignalTypeFilter =
  | 'Tümü'
  | 'RSI Uyumsuzluğu'
  | 'Hacim Anomalisi'
  | 'Trend Başlangıcı'
  | 'Kırılım';

export type DirectionFilter = 'Tümü' | 'Yukarı' | 'Aşağı';

export const BIST_SYMBOLS = [
  'THYAO',
  'AKBNK',
  'GARAN',
  'SISE',
  'EREGL',
  'KCHOL',
  'SAHOL',
  'TUPRS',
  'ASELS',
  'PGSUS',
  'BIMAS',
  'TCELL',
  'FROTO',
  'TOASO',
  'HALKB',
  'VAKBN',
  'ISCTR',
  'OYAKC',
  'KOZAL',
  'EKGYO',
] as const;

export type BistSymbol = (typeof BIST_SYMBOLS)[number];
