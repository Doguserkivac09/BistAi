/**
 * lib/signal-content.ts
 *
 * Eğitim sayfası için tüm klasik + pre-signal içerikleri.
 * Formasyonlar zaten lib/formation-content.ts'te mevcut.
 */

export interface SignalContent {
  id: string;
  name: string;
  emoji: string;
  category: 'klasik' | 'pre-signal' | 'leading';
  categoryLabel: string;
  direction: 'bullish' | 'bearish' | 'both' | 'neutral';
  directionLabel: string;
  directionDetail: string;
  indicator: string;
  vade: string;
  reliability: 'leading' | 'coincident' | 'lagging';
  reliabilityLabel: string;
  description: string;
  howItWorks: string;
  whenToAct: string[];
  tradeRule: { entry: string; stop: string; target: string };
  commonMistakes: string[];
  bistaiNote: string;
}

/** Sinyal adı → URL ID */
export const SIGNAL_URL_MAP: Record<string, string> = {
  'RSI Uyumsuzluğu':        'rsi-uyumsuzlugu',
  'Hacim Anomalisi':         'hacim-anomalisi',
  'Trend Başlangıcı':        'trend-baslangici',
  'Destek/Direnç Kırılımı': 'destek-direnc-kirilimi',
  'MACD Kesişimi':           'macd-kesisimi',
  'RSI Seviyesi':            'rsi-seviyesi',
  'Altın Çapraz':            'altin-capraz',
  'Bollinger Sıkışması':     'bollinger-sikismasi',
  'Higher Lows':             'higher-lows',
  'Altın Çapraz Yaklaşıyor': 'altin-capraz-yaklasıyor',
  'Trend Olgunlaşıyor':      'trend-olgunlasiyor',
  'Direnç Testi':            'direnc-testi',
  'MACD Daralıyor':          'macd-daraliyor',
};

/** Formasyon adı → URL ID (app/yardim/formasyonlar/[id] için) */
export const FORMATION_URL_MAP: Record<string, string> = {
  'Çift Dip':              'cift-dip',
  'Çift Tepe':             'cift-tepe',
  'Bull Flag':             'bull-flag',
  'Bear Flag':             'bear-flag',
  'Cup & Handle':          'cup-handle',
  'Ters Omuz-Baş-Omuz':   'ters-obo',
  'Yükselen Üçgen':        'yukselen-ucgen',
};

/** Sinyal adından yardım sayfası URL'i üret */
export function signalHelpUrl(type: string): string | null {
  if (FORMATION_URL_MAP[type]) return `/yardim/formasyonlar/${FORMATION_URL_MAP[type]}`;
  if (SIGNAL_URL_MAP[type])    return `/yardim/sinyaller/${SIGNAL_URL_MAP[type]}`;
  return null;
}

export const SIGNALS: SignalContent[] = [
  {
    id: 'rsi-uyumsuzlugu',
    name: 'RSI Uyumsuzluğu',
    emoji: '📊',
    category: 'leading',
    categoryLabel: '⚡ Öncü Gösterge (Leading)',
    direction: 'both',
    directionLabel: 'Hem AL hem SAT sinyali verebilir',
    directionDetail:
      'Fiyat yeni yüksek yaptı ama RSI yapmadıysa → AŞAĞI dönüş beklenir (bearish divergence). ' +
      'Fiyat yeni düşük yaptı ama RSI yapmadıysa → YUKARI dönüş beklenir (bullish divergence). ' +
      'Grafik henüz hareket etmemiştir — dönüşü önceden haber verir.',
    indicator: 'RSI (14 Periyot)',
    vade: '7 gün',
    reliability: 'leading',
    reliabilityLabel: 'Öncü — hareketten önce uyarır',
    description:
      'RSI Uyumsuzluğu (Divergence), fiyat ile RSI göstergesinin zıt yönde hareket etmesidir. ' +
      'Fiyat yeni zirve yaparken RSI daha düşük zirve yapıyorsa momentum kaybı var — yakında düşüş. ' +
      'Fiyat yeni dip yaparken RSI daha yüksek dip yapıyorsa momentum artıyor — yakında yükseliş.',
    howItWorks:
      'RSI(14), son 14 mumun ortalama kazanç/kayıp oranına dayanır. ' +
      'Fiyat yükseliyor ama RSI düşüyorsa alıcıların gücü azalıyor demektir — ' +
      'fiyat yakında geri çekilecektir. Bu "klasik trend sonu" sinyalidir.',
    whenToAct: [
      'Bearish divergence: RSI 70 üstündeyken düşük zirve + fiyat yüksek zirve → SAT düşün',
      'Bullish divergence: RSI 30 altındayken yüksek dip + fiyat düşük dip → AL düşün',
      'Ek onay: hacim düşüyorsa divergence daha güçlü',
      'MTF onayı: haftalık grafikte de uyumsuzluk varsa çok güçlü sinyal',
    ],
    tradeRule: {
      entry: 'Divergence onaylandıktan sonra 1-2 mum bekle, fiyat yönünü teyit et',
      stop: 'Divergence zirvesinin/dibinin ötesi',
      target: 'Önceki destek/direnç seviyesi',
    },
    commonMistakes: [
      '"Gizli uyumsuzluk" ile karıştırmak — farklı sinyal, farklı yorum',
      'RSI 30-70 bandındayken divergence aramak — aşırı bölgelerde daha güvenilir',
      'Güçlü trend sırasında divergence sinyalini tutmak — trend hakim olabilir',
    ],
    bistaiNote:
      'BistAI son 7 günlük pencerede RSI divergence arar. ' +
      '"Güçlü" şiddetindeyse zirve/dip farkı büyük demektir. ' +
      'Hisse detay sayfasında RSI grafiği üstünde divergence anında görülür.',
  },

  {
    id: 'hacim-anomalisi',
    name: 'Hacim Anomalisi',
    emoji: '📈',
    category: 'klasik',
    categoryLabel: '📊 Klasik Sinyal',
    direction: 'neutral',
    directionLabel: 'Yön belirsiz — dikkat sinyali',
    directionDetail:
      'Hacim patlaması bir şeylerin olduğunu söyler ama YÖN SÖYLEMEZ. ' +
      'Fiyat yükselirken hacim patlarsa → YUKARI güçlü trend. ' +
      'Fiyat düşerken hacim patlarsa → AŞAĞI güçlü baskı. ' +
      'Fiyat yatayken hacim artarsa → büyük hareket hazırlığı (yön bilinmiyor).',
    indicator: 'Hacim + Ortalama Hacim (20g)',
    vade: '3 gün',
    reliability: 'coincident',
    reliabilityLabel: 'Eş Zamanlı — harekete eşlik eder',
    description:
      'Hacim Anomalisi, günlük işlem hacminin 20 günlük ortalamasının belirgin üstüne çıkmasıdır. ' +
      'Kurumsal yatırımcılar pozisyon alırken veya çıkarken büyük hacimler oluşur. ' +
      'Normal yatırımcıdan önce "büyük para" girmiş ya da çıkmış demektir.',
    howItWorks:
      'Son 5 günün ortalama hacmi, son 20 günün ortalamasıyla kıyaslanır. ' +
      'Oran 1.5x üstünde → anormal. 2x+ → güçlü anomali. ' +
      'Üst üste 3+ gün hacim artışı → sistematik birikim/dağıtım.',
    whenToAct: [
      'Yükseliş + yüksek hacim → trend güçlü, AL sinyalini destekler',
      'Düşüş + yüksek hacim → satış baskısı yoğun, SAT',
      'Yatay + yüksek hacim → büyük hareket yakın, hazır ol',
      'Hacim düşüşte + fiyat yatay → momentum kaybı, dikkat',
    ],
    tradeRule: {
      entry: 'Fiyat yönüne ve diğer sinyallere bakarak karar ver',
      stop: 'Son 3 günün düşük noktasının altı',
      target: 'Diğer sinyallerle kombine et',
    },
    commonMistakes: [
      'Sadece hacime bakarak işlem yapmak — yön analizi şart',
      'Temettü/KAP duyurusu günlerinde hacim artışını sinyal saymak',
      'İnce piyasalarda (ADV<10M₺) hacim anomalisi daha az anlamlı',
    ],
    bistaiNote:
      'BistAI relVol5 (5g/20g oran) hesaplar. ' +
      '"Güçlü" = 3 ardışık gün hacim artışı + %50 üstü relVol. ' +
      'Screener sayfasında "relVol 1.5x+" filtresi ile bu sinyalleri bulabilirsin.',
  },

  {
    id: 'trend-baslangici',
    name: 'Trend Başlangıcı',
    emoji: '🚀',
    category: 'klasik',
    categoryLabel: '📊 Klasik Sinyal (Lagging)',
    direction: 'both',
    directionLabel: '↑ AL veya ↓ SAT — yöne göre',
    directionDetail:
      'EMA9, EMA21\'i yukarı kestiyse → YUKARI trend başladı. ' +
      'EMA9, EMA21\'i aşağı kestiyse → AŞAĞI trend başladı. ' +
      'ÖNEMLİ: Kesişim oluştuğunda fiyat zaten %5-10 hareket etmiş olabilir. ' +
      'Geç ama güvenilir bir onay sinyalidir.',
    indicator: 'EMA9 × EMA21 Kesişimi',
    vade: '14 gün',
    reliability: 'lagging',
    reliabilityLabel: 'Gecikmeli — trend başladıktan sonra onaylar',
    description:
      'Trend Başlangıcı sinyali, kısa vadeli (EMA9) ve orta vadeli (EMA21) hareketli ortalamaların ' +
      'birbirini kesmesiyle tetiklenir. EMA9 EMA21\'in üstüne geçince yükseliş trendi başlıyor, ' +
      'altına geçince düşüş trendi. BIST\'te çok kullanılan klasik sistem.',
    howItWorks:
      'EMA9 son 9 günün ağırlıklı ortalaması, EMA21 son 21 günün. ' +
      'Hızlı EMA yavaş EMA\'yı kestikten sonra 1-5 mum içinde sinyal tetiklenir. ' +
      '"Güçlü" = kesişim son 1 mum önce. "Orta" = 2 mum. "Zayıf" = 3-5 mum.',
    whenToAct: [
      'Kesişim güçlüyse (1 mum önce) ve hacim eşlik ediyorsa → güvenilir',
      'MTF onayı: haftalık trend de aynı yöndeyse çok güçlü',
      'Kesişim zayıfsa (5 mum önce) → geç kalmış olabilirsin',
      'Yan trend piyasasında whipsaw (yalancı kesişim) riski yüksek',
    ],
    tradeRule: {
      entry: 'Kesişim onaylandıktan sonra açılışta gir',
      stop: 'EMA21\'in altı (AL sinyali için)',
      target: 'R/R 2:1 minimum, önceki direnç seviyesi',
    },
    commonMistakes: [
      'Yatay piyasada çok fazla whipsaw — EMA9-21 yan piyasaya uygun değil',
      'Gecikmiş kesişimde (5+ mum) girmek — momentum bitti olabilir',
      'Tek başına kullanmak — RSI veya hacim onayı ekle',
    ],
    bistaiNote:
      'BistAI son 5 mum içindeki kesişimi yakalar. "candlesAgo=1" en taze. ' +
      '⚡ Pre-signal "Trend Olgunlaşıyor" sinyali ile daha erken uyarı alabilirsin.',
  },

  {
    id: 'destek-direnc-kirilimi',
    name: 'Destek/Direnç Kırılımı',
    emoji: '🔓',
    category: 'klasik',
    categoryLabel: '📊 Klasik Sinyal (Lagging)',
    direction: 'both',
    directionLabel: '↑ Yükseliş veya ↓ Düşüş',
    directionDetail:
      'Fiyat 50 günlük zirveyi kırıp yukarı geçtiyse → YUKARI güçlü momentum. ' +
      'Fiyat 50 günlük dibi kırıp aşağı geçtiyse → AŞAĞI güçlü satış. ' +
      'Kırılım gerçek ise %10-30 ek hareket beklenir. ' +
      'Sahte kırılım (fakeout) riski var — hacim onayı kritik!',
    indicator: '50 Günlük Yüksek/Düşük Seviyeleri',
    vade: '14 gün',
    reliability: 'lagging',
    reliabilityLabel: 'Gecikmeli — kırılım oluşunca tetiklenir',
    description:
      'Destek/Direnç Kırılımı, fiyatın 50 günlük en yüksek (direnç) veya ' +
      'en düşük (destek) seviyesini geçmesiyle oluşur. Bu seviyeler piyasadaki ' +
      '"duvar"lardır — aşılması güçlü momentum işaretidir.',
    howItWorks:
      'Son 50 mumun yükseklerinin maksimumu ve düşüklerinin minimumu hesaplanır. ' +
      'Fiyat bu seviyelerin en az %0.3 ötesine geçip hacim onayı (0.8x+ ortalama) varsa sinyal. ' +
      '"Güçlü" = hacim 1.5x+ ve kırılım %1.5+.',
    whenToAct: [
      'Kırılım günü hacim ortalamanın 1.5x üstündeyse güvenilir',
      'Gün kapanışında kırılım varsa daha güçlü (intraday sahte olabilir)',
      'İlk gün kırılım sonrası geri test (retest) beklentisi var — çok agresif girme',
      'KAP duyurusu günlerindeki kırılımlar yapay olabilir',
    ],
    tradeRule: {
      entry: 'Kırılım kapanışında veya geri test sırasında',
      stop: 'Kırılan seviyenin %1 içi (altı/üstü)',
      target: 'Önceki konsolidasyon genişliği kadar ek hareket',
    },
    commonMistakes: [
      'Hacim onayı olmadan kırılım — fakeout riski yüksek',
      'Aşırı alım/satım bölgesindeki kırılım — geri çekilme yakın',
      'Sabah açılışındaki gap kırılımı — sahte olabilir, kapanışı bekle',
    ],
    bistaiNote:
      'BistAI en az %0.3 kırılım ve 0.8x hacim şartı arar. ' +
      '⚡ Pre-signal "Direnç Testi" ile direncin %2 yakınındaki hisseleri önceden görebilirsin.',
  },

  {
    id: 'macd-kesisimi',
    name: 'MACD Kesişimi',
    emoji: '📉',
    category: 'klasik',
    categoryLabel: '📊 Klasik Sinyal (Lagging)',
    direction: 'both',
    directionLabel: '↑ AL veya ↓ SAT',
    directionDetail:
      'MACD çizgisi sinyal çizgisini YUKARI kestiyse → yükseliş momentumu artıyor (AL). ' +
      'MACD çizgisi sinyal çizgisini AŞAĞI kestiyse → düşüş momentumu artıyor (SAT). ' +
      'Sıfır çizgisi üstündeki kesişimler daha güçlü. ' +
      '⚡ "MACD Daralıyor" pre-signal ile önceden hazırlan.',
    indicator: 'MACD(12,26,9) — EMA12−EMA26 + 9 Periyot Sinyal',
    vade: '7 gün',
    reliability: 'lagging',
    reliabilityLabel: 'Gecikmeli — EMA tabanlı hesaplama',
    description:
      'MACD (Moving Average Convergence/Divergence), iki EMA arasındaki farkı ve ' +
      'bu farkın ortalamasını (sinyal çizgisi) kıyaslar. Kesişimler momentum değişimini ' +
      'gösterir. Gerald Appel tarafından 1970\'lerde geliştirilmiş, hala çok kullanılır.',
    howItWorks:
      'MACD Çizgisi = EMA(12) − EMA(26). Sinyal Çizgisi = EMA(9) uygulanmış MACD. ' +
      'Histogram = MACD − Sinyal. Histogram pozitif → yükseliş momentumu, ' +
      'negatif → düşüş momentumu. Histogramın sıfırı geçmesi = MACD kesişimi.',
    whenToAct: [
      'Sıfır çizgisi üstünde bullish kesişim → daha güçlü (trend içinde)',
      'Histogramın genişlediği kesişimler daha güvenilir',
      'Hacim onayıyla birlikte güç artar',
      'Yatay piyasada çok false signal — trend sinyalidir',
    ],
    tradeRule: {
      entry: 'Kesişim teyitlenince gün kapanışında',
      stop: 'Son swing düşüğü/yükseği',
      target: 'R/R 2:1, önceki direnç/destek',
    },
    commonMistakes: [
      'Yan piyasada MACD sinyali çok tutarsız',
      'Sıfır çizgisi altındaki bullish kesişim — daha az güvenilir',
      'Küçük zaman dilimlerinde (15dk) çok noise var',
    ],
    bistaiNote:
      'BistAI MACD(12,26,9) kullanır. Son 10 mum içinde kesişimi yakalar. ' +
      '"Abovezer0" (sıfır üstü) kontrolü ve histogramın genişleme teyidi yapılır. ' +
      '⚡ "MACD Daralıyor" pre-signal ile önceden uyarı alırsın.',
  },

  {
    id: 'rsi-seviyesi',
    name: 'RSI Seviyesi',
    emoji: '🎯',
    category: 'leading',
    categoryLabel: '⚡ Öncü Gösterge (Leading)',
    direction: 'both',
    directionLabel: 'Aşırı Alım (SAT) veya Aşırı Satım (AL)',
    directionDetail:
      'RSI 70 üstü → AŞIRI ALIM → fiyat geri çekilebilir (SAT veya bekle). ' +
      'RSI 30 altı → AŞIRI SATIM → fiyat toparlanabilir (AL fırsatı). ' +
      'BIST\'e özel eşik: RSI 32 altı aşırı satım, RSI 68 üstü aşırı alım. ' +
      'Güçlü trendde RSI uzun süre aşırı bölgede kalabilir — tek başına kullanma!',
    indicator: 'RSI (14 Periyot) — Wilder Smoothing',
    vade: '3 gün',
    reliability: 'leading',
    reliabilityLabel: 'Öncü — dönüş öncesi erken uyarı',
    description:
      'RSI (Relative Strength Index), son 14 günün kazanç/kayıp oranına dayalı ' +
      '0-100 arası bir momentum göstergesidir. 70 üstü = aşırı alım, ' +
      '30 altı = aşırı satım. BistAI BIST\'e özel BIST eşiklerini (68/32) kullanır.',
    howItWorks:
      'Son 14 mumun ortalama yükseliş büyüklüğü / ortalama düşüş büyüklüğü oranlanır. ' +
      'Oran yüksekse RSI yüksek (alıcılar baskın). Düşükse RSI düşük (satıcılar baskın). ' +
      'Wilder smoothing ile ani spike\'ların etkisi azaltılır.',
    whenToAct: [
      'RSI <30 + fiyat önemli destek seviyesinde + hacim artışı → güçlü AL fırsatı',
      'RSI >70 + fiyat dirençte + KAP yoksa → SAT/azalt düşün',
      'RSI bölgeden ÇIKTI (30\'u yukarı kesti) = daha güçlü sinyal',
      'Güçlü yükseliş trendinde RSI 40 altına düşerse giriş fırsatı',
    ],
    tradeRule: {
      entry: 'RSI 30\'un altından 30\'un üstüne çıkışında',
      stop: 'Son düşüğün altı',
      target: 'RSI 50-70 bölgesi',
    },
    commonMistakes: [
      'Güçlü trendde aşırı alım sinyalinde SAT — yanlış, trend devam edebilir',
      'RSI diverjansı olmadan sadece seviyeye bakarak işlem yapmak',
      'BIST için 70/30 yerine 68/32 eşiği daha uygun (BistAI kullanır)',
    ],
    bistaiNote:
      'BistAI BIST\'e özel 68/32 eşik kullanır. "Bölgeden çıkış" (exit detection) ' +
      'ile RSI aşırı bölgeden çıktığı anda uyarı verir — seviyede değil, ' +
      'dinamik hareketine bakılır.',
  },

  {
    id: 'altin-capraz',
    name: 'Altın Çapraz',
    emoji: '✨',
    category: 'klasik',
    categoryLabel: '📊 Klasik Sinyal (Çok Lagging)',
    direction: 'bullish',
    directionLabel: '↑ Güçlü Uzun Vadeli Yükseliş',
    directionDetail:
      'EMA50, EMA200\'ü yukarı kestikten sonra grafik YUKARI gitme eğilimindedir. ' +
      'Uzun vadeli pozitif sinyal — ama genelde fiyat zaten %20-40 yükselmiştir. ' +
      'Kurumsal yatırımcılar için kriter, bireysel yatırımcı için "geç ama güvenli" onay. ' +
      'Ters olan "Ölüm Çaprazı" ise %20-40 düştükten sonra oluşur.',
    indicator: 'EMA50 × EMA200 Kesişimi',
    vade: '30 gün',
    reliability: 'lagging',
    reliabilityLabel: 'Çok Gecikmeli — en yavaş trend sinyali',
    description:
      'Altın Çapraz (Golden Cross), kısa-orta vadeli EMA50\'nin uzun vadeli EMA200\'ü ' +
      'yukarı kesmesiyle oluşur. Uzun vadeli yükseliş trendinin başlangıcını onaylar. ' +
      'Wall Street\'te çok takip edilen klasik sinyal. Ters versiyonu Ölüm Çaprazı güçlü düşüş işareti.',
    howItWorks:
      'EMA50 son 50 günün, EMA200 son 200 günün ağırlıklı ortalaması. ' +
      '252 günlük (≈1 yıllık) veri gerekir. Yavaş hareketli oldukları için ' +
      'whipsaw az ama zaman gecikmesi büyük. "Separasyon" (iki EMA arası mesafe) ' +
      'artıkça trend güçleniyor demektir.',
    whenToAct: [
      'Altın Çapraz oluştuktan sonra ilk geri teste AL fırsatı',
      'Sektör de güçlüyse daha güvenilir',
      'EMA50 hızla yükseliyorsa (slope güçlü) daha iyi sinyal',
      '⚡ "Altın Çapraz Yaklaşıyor" pre-signal ile önceden gir',
    ],
    tradeRule: {
      entry: 'Çapraz oluşumu + ilk geri test onayında',
      stop: 'EMA50\'nin altı',
      target: 'Uzun vadeli trend hedefi — önceki zirvelerin üstü',
    },
    commonMistakes: [
      'Çapraz oluştuktan çok sonra girmek — momentum bitti olabilir',
      'Yan piyasada çapraz — anlamsız whipsaw',
      'Ölüm Çaprazından sonra hemen Altın Çapraz beklemek — zaman alır',
    ],
    bistaiNote:
      'BistAI 252 günlük veriyle hesaplar. Son 10 mum içindeki kesişimi yakalar. ' +
      '⚡ "Altın Çapraz Yaklaşıyor" pre-signal: EMA50, EMA200\'e %3 içine girince ' +
      've EMA50 yukarı eğimliyse çaprazdan önce uyarır.',
  },

  {
    id: 'bollinger-sikismasi',
    name: 'Bollinger Sıkışması',
    emoji: '🎯',
    category: 'leading',
    categoryLabel: '⚡ Öncü Gösterge (Leading)',
    direction: 'both',
    directionLabel: 'İki Yönlü — patlama yakın ama yön bilinmez',
    directionDetail:
      'Bollinger bantları daraldıysa büyük bir fiyat hareketi yakındır — ama yön belirsiz! ' +
      'EMA9 > EMA21 + kapanış SMA20 üstü ise YUKARI patlama daha olası. ' +
      'EMA9 < EMA21 + kapanış SMA20 altı ise AŞAĞI patlama daha olası. ' +
      'Kırılım yönüne bekle, önceden pozisyon açma.',
    indicator: 'Bollinger Bandı Genişliği (20,2) + SMA20 + EMA9-21',
    vade: '7 gün',
    reliability: 'leading',
    reliabilityLabel: 'Öncü — volatilite patlamasından önce uyarır',
    description:
      'Bollinger Sıkışması (Squeeze), Bollinger bantlarının son 50 günün en dar noktasına ' +
      'daralmasıyla oluşur. Piyasa sessizleşmiş, enerji birikmiş demektir. ' +
      'John Bollinger bu durumu "kalmadan önce fırtına" olarak tanımlar.',
    howItWorks:
      'Bollinger bant genişliği = (Üst Bant − Alt Bant) / SMA20. ' +
      'Mevcut genişlik, son 50 günün en düşük genişliğinin %110\'u altındaysa sıkışma. ' +
      '"Güçlü" = genişlik %3 altı. Yön için EMA9-21 ve SMA20 pozisyonu kullanılır.',
    whenToAct: [
      'Sıkışma teyit edildi → Kırılım yönünü izle',
      'Kırılım yukarı + hacim artışı → AL',
      'Kırılım aşağı + hacim artışı → SAT veya dikkat',
      'Sıkışma ne kadar uzun sürerse patlama o kadar güçlü olur',
    ],
    tradeRule: {
      entry: 'Kırılım yönü belirlenince gir (sıkışmada değil)',
      stop: 'Bantların karşı tarafı',
      target: 'Bant genişliğinin hedef mesafe olarak eklenmesi',
    },
    commonMistakes: [
      'Sıkışmada yön tahminiyle pozisyon açmak — her iki yön olabilir',
      'Sahte kırılım (fakeout) — ilk kapanışı bekle',
      'Hacim onayı olmayan kırılım güvensiz',
    ],
    bistaiNote:
      'BistAI 50 günlük minimum genişlikle kıyaslar. ' +
      '"Güçlü" = %3 altı genişlik + EMA9-21 yön onayı. ' +
      'Hem Bollinger Sıkışması hem Direnç Testi aynı anda gelirse çok güçlü kurulum.',
  },

  {
    id: 'higher-lows',
    name: 'Higher Lows (Yükselen Dipler)',
    emoji: '⚡',
    category: 'leading',
    categoryLabel: '⚡ Öncü Gösterge (Leading)',
    direction: 'both',
    directionLabel: 'Yükselen Dipler ↑ veya Alçalan Tepeler ↓',
    directionDetail:
      'Son 30 mumda her yeni dip bir öncekinden yüksekse → YUKARI trend dönüşü başlıyor. ' +
      'Her yeni tepe bir öncekinden alçaksa → AŞAĞI trend devam veya dönüş. ' +
      'EMA kesişiminden önce bu yapısal değişimi yakalar — DAHA ERKEN sinyal!',
    indicator: 'Fiyat Pivot Noktaları (son 30 mum)',
    vade: '14 gün',
    reliability: 'leading',
    reliabilityLabel: 'Öncü — trend dönüşünü yapısal olarak yakalar',
    description:
      'Higher Lows, fiyatın giderek daha yüksek diplere ulaşmasıyla oluşan bir trend dönüş sinyalidir. ' +
      'EMA tabanlı sinyaller (Trend Başlangıcı) bu yapıyı çok daha geç fark eder. ' +
      'BistAI 5-mum pivot penceresiyle local dipleri bulur ve her birini öncekiyle kıyaslar.',
    howItWorks:
      'Son 30 mumda her 5 mumun minimum noktası "local pivot dip" sayılır. ' +
      '2+ dip tespit edilip her biri öncekinden %1+ yüksekse sinyal tetiklenir. ' +
      '3+ pivot + %3+ yükseliş → "güçlü" şiddet.',
    whenToAct: [
      'Higher Lows + Hacim Anomalisi aynı anda → çok güçlü kombinasyon',
      'Higher Lows + RSI Aşırı Satımdan çıkış → dip dönüş',
      'Higher Lows + Bollinger Sıkışması → büyük yükseliş yakın',
      '3+ pivot noktası → tek başına aksiyon alınabilir seviye',
    ],
    tradeRule: {
      entry: 'Üçüncü dip onaylandıktan sonra, önceki pivot tepesini kırınca',
      stop: 'Son pivot dibinin altı',
      target: 'Önceki direnç seviyesi',
    },
    commonMistakes: [
      '2 pivotla yetinmek — 3+ daha güvenilir',
      'Pivot aralarının çok kısa olması (<5 gün) — gerçek yapı değil',
      'Düşüş trendinde Higher Lows aramak — context önemli',
    ],
    bistaiNote:
      'BistAI BIST\'e özgü eklenen yeni leading sinyal. ' +
      'EMA kesişiminden ortalama 3-7 gün önce oluşur. ' +
      '"liftPct" alanı diplerin ne kadar yükseldiğini gösterir.',
  },

  // ── Pre-Sinyaller ─────────────────────────────────────────────────────────

  {
    id: 'altin-capraz-yaklasıyor',
    name: 'Altın Çapraz Yaklaşıyor',
    emoji: '⚡',
    category: 'pre-signal',
    categoryLabel: '⚡ Pre-Signal (Erken Uyarı)',
    direction: 'bullish',
    directionLabel: '↑ Yakında Altın Çapraz oluşabilir',
    directionDetail:
      'EMA50 ile EMA200 arasındaki mesafe %3\'e indi ve EMA50 yukarı eğimde. ' +
      'Birkaç gün/hafta içinde Altın Çapraz oluşabilir. ' +
      'Klasik Altın Çaprazdan önce pozisyon almak için fırsat.',
    indicator: 'EMA50 / EMA200 Mesafe + EMA50 Eğim',
    vade: '30 gün',
    reliability: 'leading',
    reliabilityLabel: 'Öncü — Altın Çaprazdan önce uyarır',
    description:
      'Altın Çapraz oluştuktan sonra girmek genelde geç kalındığı anlamına gelir. ' +
      'Bu pre-signal, EMA50\'nin EMA200\'e yaklaştığını ve yukarı eğimli olduğunu tespit eder. ' +
      'Çapraz gerçekleşmeden pozisyon alan yatırımcı daha düşük fiyattan girer.',
    howItWorks:
      'EMA50 EMA200\'ün altında + gap %0.3-%3 arasında + EMA50 son 10 günde yukarı eğimli + ' +
      'EMA200 yatay veya yukarı → pre-signal tetiklenir.',
    whenToAct: [
      'Pre-signal görünce aşamalı alım başla (%25-%50 pozisyon)',
      'Altın Çapraz oluşunca pozisyonu tamamla',
      'EMA50 eğimi bozulursa sinyal geçersiz',
    ],
    tradeRule: {
      entry: 'Pre-signal sonrası aşamalı, Altın Çapraz onayında tamamla',
      stop: 'EMA50\'nin altı',
      target: 'Uzun vadeli trend hedefi',
    },
    commonMistakes: [
      'Çapraz olmadan tam pozisyon açmak — riski yönet',
      'EMA200 aşağı eğimliyse pre-signal geçersiz',
    ],
    bistaiNote:
      'BistAI gapPct ve ema50Slope verilerini gösterir. "Güçlü" = gap ≤%1 + slope ≥%3. ' +
      'Hisse detayında Altın Çapraz Yaklaşıyor sinyali, Teknik Profil yükseliş eğimini destekliyorsa kombinasyon güçlü.',
  },

  {
    id: 'trend-olgunlasiyor',
    name: 'Trend Olgunlaşıyor',
    emoji: '⚡',
    category: 'pre-signal',
    categoryLabel: '⚡ Pre-Signal (Erken Uyarı)',
    direction: 'bullish',
    directionLabel: '↑ EMA Kesişimi yakın — trend değişiyor',
    directionDetail:
      'EMA9 ile EMA21 arasındaki mesafe kapanıyor, EMA9 yukarı yönelmiş ve ' +
      'hacim artıyor. Birkaç mum içinde Trend Başlangıcı sinyali gelebilir. ' +
      'Klasik Trend Başlangıcından 2-5 gün önce bu sinyali alırsın.',
    indicator: 'EMA9 / EMA21 Mesafe + EMA9 Eğim + Hacim',
    vade: '14 gün',
    reliability: 'leading',
    reliabilityLabel: 'Öncü — EMA kesişiminden önce uyarır',
    description:
      'EMA9 EMA21\'i kesmeden önce yaklaşma fazı vardır. Bu pre-signal, ' +
      'yaklaşmayı + yükseliş eğimini + hacim artışını kombine eder. ' +
      'Trend Başlangıcı sinyalinden ortalama 2-5 gün önce görünür.',
    howItWorks:
      'EMA9 EMA21\'in altında + gap %0.1-%1.5 + EMA9 son 3 günde %0.5+ yükseliş + ' +
      'opsiyonel hacim onayı (1.2x+) → tetiklenir.',
    whenToAct: [
      'Pre-signal görünce küçük pozisyon aç, EMA kesişimi bekle',
      'Hacim eşlik ediyorsa daha güvenilir',
      'EMA9 eğimi bozulursa sinyal geçersiz',
    ],
    tradeRule: {
      entry: 'Pre-signal + aşamalı giriş; kesişim onayında tamamla',
      stop: 'EMA21\'in altı',
      target: 'Önceki direnç',
    },
    commonMistakes: [
      'Yatay piyasada whipsaw riski — trend bağlamını kontrol et',
    ],
    bistaiNote:
      'BistAI gapPct, ema9Slope ve volRatio verilerini gösterir. ' +
      'Higher Lows ile birleşirse trend dönüşü erken yakalanır.',
  },

  {
    id: 'direnc-testi',
    name: 'Direnç Testi',
    emoji: '⚡',
    category: 'pre-signal',
    categoryLabel: '⚡ Pre-Signal (Erken Uyarı)',
    direction: 'bullish',
    directionLabel: '↑ Direnç yakın — kırılım potansiyeli',
    directionDetail:
      'Fiyat, 50 günlük direncin %2 altında ve hacim biriktiriyor. ' +
      'Klasik D/R Kırılımı sinyalinden önce bu pre-signali alırsın. ' +
      'Kırılım gerçekleşirse güçlü yükseliş gelebilir, gerçekleşmezse geri çekilme.',
    indicator: '50 Günlük Direnç + Son 5g/20g Hacim Ortalaması',
    vade: '14 gün',
    reliability: 'leading',
    reliabilityLabel: 'Öncü — kırılımdan önce uyarır',
    description:
      'Fiyat önemli bir direncin çok yakınında gezinirken hacim artıyorsa ' +
      'büyük alıcıların birikim yaptığına işaret eder. ' +
      'D/R Kırılımı sinyali geldiğinde fiyat zaten direnç üstüne geçmiştir. ' +
      'Bu pre-signal, direncin %2 içindeyken hazır olmak için uyarır.',
    howItWorks:
      'Son 50 mumun maksimum yüksekliği direnç. Fiyat bu seviyenin %0-2 altında + ' +
      'son 5g hacim ortalaması, son 20g ortalamasının 0.8x+ üstünde → tetiklenir.',
    whenToAct: [
      'Pre-signal + hacim artışı → stop-loss hazırla ve kırılımı izle',
      'Kırılım oluşursa büyük al, oluşmazsa küçük pozisyonla çık',
      'Kırılım olmadan 3+ gün direnç altında kalırsa sinyal zayıf',
    ],
    tradeRule: {
      entry: 'Kırılım onayında (kapanış direnç üstünde)',
      stop: 'Direnç seviyesinin %1 altı',
      target: 'D/R mesafesi kadar ek yükseliş',
    },
    commonMistakes: [
      'Direnç kırılmadan tam pozisyon açmak',
      'KAP duyurusu günlerinde sahte kırılım riski yüksek',
    ],
    bistaiNote:
      'BistAI distancePct ve volTrend değerlerini gösterir. ' +
      '"Güçlü" = distancePct ≤%0.5 + volTrend ≥1.3. ' +
      'D/R Kırılımı + Bollinger Sıkışması aynı anda → çok güçlü kombinasyon.',
  },

  {
    id: 'macd-daraliyor',
    name: 'MACD Daralıyor',
    emoji: '⚡',
    category: 'pre-signal',
    categoryLabel: '⚡ Pre-Signal (Erken Uyarı)',
    direction: 'both',
    directionLabel: 'MACD Kesişimi yakın',
    directionDetail:
      'Histogram daralıyor (sıfıra yaklaşıyor) → MACD Kesişimi birkaç mum içinde gelebilir. ' +
      'Histogram negatif ama yükseliyorsa → YUKARI kesişim yakın (bullish). ' +
      'Histogram pozitif ama düşüyorsa → AŞAĞI kesişim yakın (bearish). ' +
      'Klasik MACD Kesişiminden 1-3 mum önce bu sinyali alırsın.',
    indicator: 'MACD Histogram Eğimi + Sıfıra Yakınlık',
    vade: '7 gün',
    reliability: 'leading',
    reliabilityLabel: 'Öncü — MACD kesişiminden önce uyarır',
    description:
      'MACD histogramı ardışık olarak yükseliyorsa (negatif bölgeden) veya ' +
      'düşüyorsa (pozitif bölgeden), yakında MACD Kesişimi oluşacak demektir. ' +
      'Bu pre-signal, histogramın sıfıra yakınlığını ve eğim yönünü kullanır.',
    howItWorks:
      'Histogram ardışık 3+ mum aynı yönde + mevcut değer ortalama mutlak ' +
      'değerin %50 altında → "yakında kesişim" pre-signal.',
    whenToAct: [
      'Bullish pre-signal → MACD Kesişimi bekle, hazır ol',
      'Bearish pre-signal → mevcut AL pozisyonunda stop-loss sıkıştır',
      'proximityRatio < %20 → kesişim çok yakın (1-2 mum)',
    ],
    tradeRule: {
      entry: 'MACD Kesişimi onaylanınca gir (pre-signalde değil)',
      stop: 'Son swing düşüğü/yükseği',
      target: 'R/R 2:1',
    },
    commonMistakes: [
      'Pre-signalde pozisyon açmak — kesişim gerçekleşmeyebilir',
      'Tek başına kullanmak — fiyat aksiyonu da kontrol et',
    ],
    bistaiNote:
      'BistAI proximityRatio değerini gösterir (0.2 altı = çok yakın). ' +
      'MACD Daralıyor + Trend Olgunlaşıyor aynı anda → çok güçlü yakın dönem sinyal.',
  },
];

/** ID'ye göre sinyal bul */
export function getSignal(id: string): SignalContent | undefined {
  return SIGNALS.find((s) => s.id === id);
}

export const SIGNAL_IDS = SIGNALS.map((s) => s.id);
