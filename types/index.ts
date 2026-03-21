// BistAI — TypeScript interfaces

export type SignalSeverity = 'güçlü' | 'orta' | 'zayıf';
export type SignalDirection = 'yukari' | 'asagi' | 'nötr';

export interface OHLCVCandle {
  date: string | number; // YYYY-MM-DD (günlük) | Unix timestamp saniye (intraday)
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
  | 'Kırılım'
  | 'MACD Kesişimi'
  | 'RSI Seviyesi'
  | 'Altın Çapraz';

export type DirectionFilter = 'Tümü' | 'Yukarı' | 'Aşağı';

/**
 * BIST100 sembol listesi (100 bileşen).
 * Kaynak: Borsa İstanbul XU100 endeks bileşenleri.
 * Not: Endeks her çeyrekte güncellenir; bu liste en yaygın bileşenleri içerir.
 */
export const BIST_SYMBOLS = [
  // Bankacılık & Finans
  'AKBNK', 'GARAN', 'HALKB', 'ISCTR', 'VAKBN', 'YKBNK', 'SKBNK', 'ALBRK', 'QNBFB', 'TSKB',
  // Holding
  'KCHOL', 'SAHOL', 'DOHOL', 'TAVHL', 'TKFEN',
  // Havacılık & Savunma
  'THYAO', 'PGSUS', 'ASELS',
  // Enerji & Petrol
  'TUPRS', 'AKSEN', 'AKENR', 'AKSA', 'ENKAI', 'ODAS', 'KONTR', 'ENJSA',
  // Otomotiv
  'FROTO', 'TOASO', 'OTKAR', 'DOAS',
  // Perakende & Tüketici
  'BIMAS', 'MGROS', 'SOKM', 'ULKER', 'CCOLA', 'TATGD', 'BIZIM', 'MAVI',
  // Telekomünikasyon & Teknoloji
  'TCELL', 'TTKOM', 'ASTOR', 'LOGO', 'ARDYZ', 'NETAS',
  // Demir-Çelik & Madencilik
  'EREGL', 'KRDMD', 'KOZAL', 'KOZAA', 'IPEKE',
  // Cam & Kimya
  'SISE', 'TRKCM', 'SODA', 'GUBRF', 'PETKM',
  // İnşaat & GYO
  'EKGYO', 'ENKA', 'KLGYO', 'ALGYO', 'ISGYO',
  // Sigorta & Finansal
  'HEKTS', 'ANHYT', 'AGROT', 'ISMEN',
  // Sanayi & Üretim
  'ARCLK', 'VESBE', 'VESTL', 'BRISA', 'CIMSA', 'OYAKC', 'GESAN', 'EGEEN',
  // Ulaştırma & Lojistik
  'CLEBI', 'RYSAS',
  // Sağlık & İlaç
  'SELEC', 'DEVA',
  // Diğer BIST100 bileşenleri
  'ALFAS', 'BERA', 'BTCIM', 'BUCIM', 'CEMAS', 'ECILC', 'GLYHO',
  'KARSN', 'MPARK', 'PEKGY', 'SARKY', 'SMRTG', 'TMSN', 'TURSG',
  'ALARK', 'AEFES', 'BAGFS', 'CWENE', 'EUPWR', 'HBCAG',
  'INDES', 'KORDS', 'MEGAP', 'OBAMS', 'SILVR',
  'ZOREN',
] as const;

export type BistSymbol = (typeof BIST_SYMBOLS)[number];

export interface PortfolyoPozisyon {
  id: string;
  user_id: string;
  sembol: string;
  miktar: number;
  alis_fiyati: number;
  alis_tarihi: string;
  notlar?: string | null;
  created_at: string;
}

export interface PortfolyoPozisyonWithStats extends PortfolyoPozisyon {
  guncel_fiyat: number | null;
  maliyet: number;
  guncel_deger: number | null;
  kar_zarar: number | null;
  kar_zarar_yuzde: number | null;
}
