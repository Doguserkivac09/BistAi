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
  candlesAgo?: number;          // kaç mum önce tetiklendi (0 = son mum)
  weeklyAligned?: boolean;      // haftalık trend ile uyumlu mu? (null = yetersiz veri)
  // Risk yönetimi seviyeleri (ATR bazlı)
  stopLoss?: number;            // önerilen zarar kes fiyatı
  targetPrice?: number;         // önerilen hedef fiyat
  riskRewardRatio?: number;     // risk/ödül oranı (target/stop mesafesi)
  atr?: number;                 // sinyal anındaki ATR değeri (14 periyot)
  entryPrice?: number;          // sinyal anındaki son kapanış fiyatı
  // Likidite uyarısı
  lowLiquidity?: boolean;       // 20g ort. hacim < 100K TL işlem hacmi → manipülasyon riski
  avgDailyVolumeTL?: number;    // 20g ortalama TL bazlı işlem hacmi
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
  | 'Bollinger Sıkışması'
  | 'Higher Lows'
  // Pre-signals (erken uyarı)
  | 'Altın Çapraz Yaklaşıyor'
  | 'Trend Olgunlaşıyor'
  | 'Direnç Testi'
  | 'MACD Daralıyor'
  // Formasyonlar
  | 'Çift Dip'
  | 'Çift Tepe'
  | 'Bull Flag'
  | 'Bear Flag'
  | 'Cup & Handle'
  | 'Ters Omuz-Baş-Omuz'
  | 'Yükselen Üçgen';

export type DirectionFilter = 'Tümü' | 'Yukarı' | 'Aşağı';

/**
 * BIST sembol listesi.
 * Kaynak: Borsa İstanbul — BIST 100 bileşenleri + seçili BIST 250 hisseleri.
 * Not: Endeks her çeyrekte güncellenir; bu liste en yaygın işlem gören hisseleri içerir.
 */
export const BIST_SYMBOLS = [
  // Bankacılık & Finans
  'AKBNK', 'GARAN', 'HALKB', 'ISCTR', 'VAKBN', 'YKBNK', 'SKBNK', 'ALBRK', 'TSKB',
  'ICBCT', 'GEDIK', 'GARFA', 'GSDHO', 'GSDDE', 'VAKFN',
  // Sigorta & Finansal Hizmetler
  'HEKTS', 'ANHYT', 'AGROT', 'ISMEN', 'ANSGR', 'AKGRT', 'RAYSG', 'ISFIN', 'ATLAS',
  // Holding & Yatırım
  'KCHOL', 'SAHOL', 'DOHOL', 'TAVHL', 'TKFEN', 'IHLAS', 'GOZDE', 'IEYHO', 'NTHOL', 'POLHO', 'POLTK',
  'YYLGD',
  // Havacılık & Savunma
  'THYAO', 'PGSUS', 'ASELS',
  // Enerji & Petrol
  'TUPRS', 'AKSEN', 'AKENR', 'AKSA', 'ENKAI', 'ODAS', 'KONTR', 'ENJSA', 'ORGE', 'NATEN', 'AYDEM',
  'SASA', 'AYEN', 'AYCES', 'BIOEN', 'EUPWR', 'ZOREN', 'CWENE', 'EGEGY', 'BASGZ',
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
  'ASGYO', 'MTRYO', 'TDGYO',
  // Sanayi & Üretim
  'ARCLK', 'VESBE', 'VESTL', 'BRISA', 'OYAKC', 'GESAN', 'EGEEN', 'SANEL', 'GEREL',
  'PRKAB', 'SKTAS',
  // Tekstil & Hazır Giyim
  'MNDRS', 'SUWEN', 'SONME', 'YUNSA', 'DAGI', 'EDIP',
  'ATEKS', 'BOSSA', 'DESA', 'HATEK', 'USAK',
  // Ulaştırma & Lojistik
  'CLEBI', 'RYSAS', 'AGHOL', 'HRKET', 'ONRYT', 'ULUFA',
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
  'TRCAS', 'VERTU', 'VKING', 'YEOTK', 'YGYO', 'YKSLN', 'TRILC', 'TERA',

  // ── 2026-05-17: Bigpara BIST TÜM listesinden eklenenler (~250 yeni) ──
  // Bankacılık & Finans (ek)
  'QNBFK', 'QNBTR', 'VAKFA', 'ISBIR', 'ISGLK', 'ISGSY',
  // Sigorta & Emeklilik (ek)
  'AGESA',
  // Holding & Yatırım (ek)
  'AVHOL', 'EUHOL', 'GRTHO', 'KLRHO', 'LYDHO', 'MZHLD', 'PAHOL', 'RALYH', 'TRHOL', 'VANGD',
  // Havacılık, Savunma & Ulaştırma (ek)
  'AVTUR', 'ATAGY', 'ATAKP', 'AHSGY', 'BAHKM', 'BESLR', 'HOROZ',
  // Enerji & Yenilenebilir (ek)
  'AKFYE', 'AKYHO', 'ENERY', 'ENPRA', 'ENSRI', 'ENTRA', 'EUKYO', 'EUREN',
  'GWIND', 'RUZYE', 'TATEN', 'TGSAS', 'ZERGY',
  // Otomotiv & Makine (ek)
  'ALCAR', 'EPLAS', 'KBORU', 'KLKIM', 'KONKA', 'KOPOL', 'KRONT', 'KUTPO',
  'MNDTR', 'MTRKS', 'OTTO', 'TEZOL', 'TMPOL', 'TRMET', 'TUREX',
  // Perakende & Tüketici (ek)
  'ADESE', 'AYGAZ', 'BIGCH', 'KOTON', 'LILAK', 'MARKA', 'MERIT', 'MEYSU',
  'PENTA', 'PKENT', 'SMART', 'SOKE', 'TABGD', 'TBORG', 'UNLU',
  // Gıda & İçecek (ek)
  'BALAT', 'BALSU', 'CASA', 'ETYAT', 'HATSN', 'KRVGD', 'MERKO', 'MOPAS',
  'PNLSN', 'PNSUT', 'SELVA', 'SUMAS', 'TNZTP', 'TUCLK',
  // Teknoloji & Yazılım (ek)
  'ARTMS', 'BLCYT', 'DCTTR', 'EDATA', 'EKOS', 'ESCOM', 'INGRM', 'INTEK',
  'INVES', 'LINK', 'LMKDC', 'NETCD', 'OBASE', 'PCILT', 'SDTTR', 'SEGMN',
  'SKYMD', 'TLMAN', 'TURGG', 'VBTYZ', 'VSNMD',
  // Demir-Çelik & Maden (ek)
  'ALVES', 'BMSTL', 'CELHA', 'CVKMD', 'DOCO', 'ERCB', 'ISDMR', 'KRDMB',
  'MAALT', 'OZATD', 'TRALT', 'UCAYM', 'ZGOLD',
  // Çimento & Yapı Malzemeleri (ek)
  'BASCM', 'BYDNR', 'CEMZY', 'CMBTN', 'KOCMT', 'KTSKR', 'MARMR', 'SODSN',
  // Cam, Kimya & Plastik (ek)
  'ALKLC', 'ALTNY', 'AZTEK', 'CRDFA', 'EFOR', 'ESCAR', 'ETILR',
  'KIMMR', 'KLNMA', 'SANKO', 'TARKM', 'ULAS',
  // GYO & İnşaat (ek)
  'AAGYO', 'ADGYO', 'AGYO', 'AVGYO', 'AVPGY', 'BEGYO', 'DARDL', 'DGNMO',
  'EUYO', 'GATEG', 'GLCVY', 'GRNYO', 'IZINV',
  'KGYO', 'KRGYO', 'KZBGY', 'KZGYO', 'LXGYO', 'MHRGY', 'OFSYM', 'OPTGY',
  'ORCAY', 'OSMEN', 'OYAYO', 'OYYAT', 'OZRDN', 'OZSUB', 'OZYSR',
  'PSGYO', 'SAFKR', 'SEGYO', 'SRVGY', 'SVGYO', 'TEHOL',
  'TSGYO', 'VKFYO', 'VRGYO', 'YGGYO', 'YYAPI', 'ZEDUR', 'ZELOT', 'ZGYO', 'ZRGYO',
  // Sanayi & Üretim (ek)
  'ANELE', 'ANGEN', 'ARASE', 'ARENA', 'ARFYE', 'ARMGD', 'ARSAN', 'ATSYH',
  'BEYAZ', 'BIENY', 'BIGEN', 'BIGTK', 'BINBN', 'BINHO', 'BLUME', 'BMSCH',
  'BOBET', 'BORSK', 'BRKO', 'BRKSN', 'BRKVY', 'BRLSM', 'BRYAT', 'BULGS',
  'CATES', 'CEOEM', 'CGCAM', 'DERHL', 'DESPC', 'DMRGD', 'DOFER', 'DOFRB',
  'DOGUB', 'DUNYH', 'DURDO', 'DURKN', 'EBEBK', 'ECOGR', 'EGEPO', 'EGGUB',
  'EGPRO', 'EKIZ', 'EKSUN', 'EMPAE', 'ENDAE', 'FMIZP', 'FORTE', 'FRIGO',
  'FRMPL', 'GENKM', 'GENTS', 'GIPTA', 'GLDTR', 'GLRMK', 'GMSTR', 'GOKNR',
  'GZNMI', 'HKTM', 'HUBVC', 'ICUGS', 'IHAAS', 'IZENR', 'IZMDC',
  'KAYSE', 'KCAER', 'KERVN', 'KFEIN', 'KLSER', 'KLSYN', 'KLYPV', 'KRPLS',
  'KRSTL', 'KRTEK', 'KSTUR', 'KTLEV', 'KUVVA', 'LRSHO', 'LYDYE', 'MACKO',
  'MAGEN', 'MANAS', 'MARBL', 'MCARD', 'MEGMT', 'MEPET', 'MERCN', 'MIATK',
  'MMCAS', 'MOGAN', 'ODINE', 'ORMA', 'PAMEL', 'PAPIL', 'REEDR', 'RNPOL',
  'RUBNS', 'SANFM', 'SEKFK', 'SEKUR', 'SERNT', 'SKYLP', 'SMRVA', 'SUNTK',
  'SURGY', 'TCKRC', 'TRENJ', 'ULUSE', 'YAPRK', 'YAYLA', 'YBTAS', 'YESIL', 'YIGIT',
  // Tekstil (ek)
  'BESTE',
  // Sağlık & İlaç (ek)
  'ATATP', 'ATATR',
  // Finans Teknoloji & Diğer (ek)
  'A1CAP', 'A1YEN', 'AKFIS', 'AKSUE',
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
  hedef_fiyat?: number | null;
  created_at: string;
}

export interface PortfolyoPozisyonWithStats extends PortfolyoPozisyon {
  guncel_fiyat: number | null;
  maliyet: number;
  guncel_deger: number | null;
  kar_zarar: number | null;
  kar_zarar_yuzde: number | null;
}
