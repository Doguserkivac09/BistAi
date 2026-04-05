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
  consecutiveHighVolDays?: number; // ardışık yüksek hacim günleri
  relVol5?: number;                // 5 günlük ortalama / 20 günlük oran
  priceChange3d?: number;          // 3 günlük fiyat değişimi (%)
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
  candlesAgo?: number;     // kaç mum önce tetiklendi (0 = son mum)
  weeklyAligned?: boolean; // haftalık trend ile uyumlu mu? (null = yetersiz veri)
}

/** Çoklu sinyal güven analizi */
export interface ConfluenceResult {
  score: number;                          // 0-100
  level: 'yüksek' | 'orta' | 'düşük';
  dominantDirection: 'yukari' | 'asagi' | 'nötr';
  bullishCount: number;
  bearishCount: number;
  categoryCount: number;                  // farklı teknik kategori sayısı
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
  | 'Altın Çapraz'
  | 'Bollinger Sıkışması';

export type DirectionFilter = 'Tümü' | 'Yukarı' | 'Aşağı';

/**
 * BIST sembol listesi.
 * Kaynak: Borsa İstanbul — BIST 100 bileşenleri + seçili BIST 250 hisseleri.
 * Not: Endeks her çeyrekte güncellenir; bu liste en yaygın işlem gören hisseleri içerir.
 * Güncelleme: 2026-04-05 — Yahoo Finance doğrulamalı (~290 sembol)
 */
export const BIST_SYMBOLS = [
  // Bankacılık & Finans
  'AKBNK', 'GARAN', 'HALKB', 'ISCTR', 'VAKBN', 'YKBNK', 'SKBNK', 'ALBRK', 'TSKB',
  'ICBCT', 'GEDIK', 'GARFA', 'GSDHO', 'GSDDE', 'VAKFN',
  // Sigorta & Finansal Hizmetler
  'HEKTS', 'ANHYT', 'AGROT', 'ISMEN', 'ANSGR', 'AKGRT', 'RAYSG', 'ISFIN',
  // Holding & Yatırım
  'KCHOL', 'SAHOL', 'DOHOL', 'TAVHL', 'TKFEN', 'IHLAS', 'GOZDE', 'IEYHO', 'NTHOL', 'POLHO',
  // Havacılık & Savunma
  'THYAO', 'PGSUS', 'ASELS',
  // Enerji & Petrol
  'TUPRS', 'AKSEN', 'AKENR', 'AKSA', 'ENKAI', 'ODAS', 'KONTR', 'ENJSA', 'ORGE', 'NATEN', 'AYDEM',
  'SASA', 'AYEN', 'AYCES', 'BIOEN', 'EUPWR', 'ZOREN', 'CWENE',
  // Otomotiv & Makine
  'FROTO', 'TOASO', 'OTKAR', 'DOAS', 'TTRAK', 'KATMR', 'JANTS', 'KAREL', 'MAKIM',
  'ASUZU', 'BFREN', 'DITAS', 'GOODY', 'DMSAS', 'ERBOS', 'EMKEL', 'KAPLM', 'KNFRT',
  // Perakende & Tüketici
  'BIMAS', 'MGROS', 'SOKM', 'ULKER', 'CCOLA', 'TATGD', 'BIZIM', 'MAVI', 'KENT', 'ADEL',
  'CRFSA', 'ARZUM', 'GRSEL', 'MRSHL', 'VAKKO', 'YATAS',
  // Gıda & İçecek
  'PENGD', 'PETUN', 'TUKAS', 'BANVT', 'CUSAN', 'ERSU', 'AVOD', 'PINSU', 'ULUUN', 'NUHCM', 'AEFES',
  // Telekomünikasyon & Teknoloji
  'TCELL', 'TTKOM', 'ASTOR', 'LOGO', 'ARDYZ', 'NETAS', 'MARTI', 'TKNSA',
  'DGATE', 'DIRIT', 'FONET', 'INVEO', 'PKART', 'PLTUR', 'RODRG', 'MOBTL', 'GLBMD',
  'INDES', 'ISKPL', 'ISYAT',
  // Demir-Çelik & Madencilik
  'EREGL', 'KRDMD', 'KRDMA', 'BRSAN', 'CEMTS', 'PARSN',
  'DOKTA', 'GMTAS', 'LUKSK', 'LKMNH',
  // Çimento & Yapı Malzemeleri
  'CIMSA', 'AKCNS', 'AFYON', 'BURVA', 'KONYA', 'BSOKE', 'CMENT', 'BURCE',
  // Cam & Kimya
  'SISE', 'GUBRF', 'PETKM', 'ALKIM', 'COSMO', 'ECZYT', 'KMPUR', 'SAMAT',
  // İnşaat & GYO
  'EKGYO', 'KLGYO', 'ALGYO', 'ISGYO', 'TRGYO', 'HLGYO', 'OZGYO', 'RGYAS', 'PAGYO',
  'NIBAS', 'OSTIM', 'OYLUM',
  'AKSGY', 'AKMGY', 'AKFGY', 'MRGYO', 'SNGYO', 'VKGYO', 'RYGYO', 'DGGYO',
  'NUGYO', 'EYGYO', 'MSGYO', 'DZGYO', 'FZLGY', 'OZKGY', 'IDGYO',
  // Sanayi & Üretim
  'ARCLK', 'VESBE', 'VESTL', 'BRISA', 'OYAKC', 'GESAN', 'EGEEN', 'SANEL', 'GEREL',
  'PRKAB', 'SKTAS',
  // Tekstil & Hazır Giyim
  'MNDRS', 'SUWEN', 'SONME', 'YUNSA', 'DAGI', 'EDIP',
  'ATEKS', 'BOSSA', 'DESA', 'HATEK', 'USAK',
  // Ulaştırma & Lojistik
  'CLEBI', 'RYSAS', 'AGHOL', 'HRKET', 'ONRYT',
  // Sağlık & İlaç
  'SELEC', 'DEVA', 'ONCSM',
  // Medya & Yayıncılık
  'HURGZ', 'IHYAY', 'DNISI',
  // Spor Kulüpleri
  'BJKAS', 'FENER', 'GSRAY', 'TSPOR',
  // Diğer BIST bileşenleri
  'ALFAS', 'BERA', 'BTCIM', 'BUCIM', 'CEMAS', 'ECILC', 'GLYHO',
  'KARSN', 'MPARK', 'PEKGY', 'SARKY', 'SMRTG', 'TMSN', 'TURSG',
  'ALARK', 'BAGFS', 'KORDS', 'MEGAP', 'OBAMS', 'SILVR',
  'KARTN', 'LIDER', 'METRO', 'INTEM', 'HEDEF', 'TEKTU',
  'ACSEL', 'AHGAZ', 'ALCTL', 'ALKA', 'BAKAB', 'BARMA', 'BAYRK', 'BNTAS',
  'BORLS', 'BRMEN', 'BVSAN', 'CANTE', 'CONSE', 'DAPGM', 'DENGE', 'DERIM',
  'DYOBY', 'EGSER', 'ELITE', 'EMNIS', 'ESEN', 'FADE', 'FLAP', 'FORMT',
  'GENIL', 'GEDZA', 'GLRYH', 'GOLTS', 'GUNDG', 'HDFGS', 'HTTBT', 'HUNER',
  'IHEVA', 'IHGZT', 'IHLGM', 'IMASM', 'IZFAS', 'KLMSN', 'KUYAS',
  'LIDFA', 'MAKTK', 'MEKAG', 'NTGAZ', 'PATEK', 'PRDGS', 'PRKME',
  'PRZMA', 'PSDTC', 'ROYAL', 'RTALB', 'SAYAS', 'SEYKM', 'SNICA', 'SNPAM',
  'TRCAS', 'VERTU', 'VKING', 'YEOTK', 'YGYO', 'YKSLN',
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
