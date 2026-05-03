/**
 * lib/formation-content.ts
 *
 * Eğitim sayfası için formasyon içerikleri.
 * Bulkowski "Encyclopedia of Chart Patterns" (2. baskı) referansları.
 * Tüm istatistikler BIST bağlamında yorumlanmıştır.
 */

export interface TradeRule {
  entry: string;
  stop: string;
  target: string;
  rr: string;
}

export interface FormationContent {
  id: string;
  name: string;
  englishName: string;
  emoji: string;
  /** Formasyonun yönü — grafiğin gittiği yön */
  direction: 'bullish' | 'bearish' | 'both';
  directionLabel: string;
  directionDetail: string;          // "grafik hangi yöne gidebilir?" cevabı
  directionPercentage: string;      // %X olasılık
  /** Bulkowski başarı oranı */
  successRate: number;
  successNote: string;
  type: 'reversal' | 'continuation';
  typeLabel: string;
  vade: string;
  description: string;
  howToSpot: string[];
  tradeRule: TradeRule;
  commonMistakes: string[];
  bistaiNote: string;
  /** SVG path verileri */
  svgData: {
    viewBox: string;
    paths: Array<{ d: string; stroke: string; strokeWidth?: number; fill?: string; strokeDasharray?: string }>;
    texts?: Array<{ x: number; y: number; text: string; fill?: string; fontSize?: number }>;
    circles?: Array<{ cx: number; cy: number; r: number; fill: string }>;
  };
}

export const FORMATIONS: FormationContent[] = [
  {
    id: 'cift-dip',
    name: 'Çift Dip',
    englishName: 'Double Bottom (W)',
    emoji: '📈',
    direction: 'bullish',
    directionLabel: '↑ Yukarı Yönlü',
    directionPercentage: '%78 yukarı kırılım',
    directionDetail:
      'Grafik büyük ihtimalle YUKARI gider. İki eşit dipten sonra fiyat boyun seviyesini kırarsa, ' +
      'kupa derinliği kadar yükseliş beklenir. Boyun kırılmazsa formasyon başarısız sayılır ve ' +
      'aşağı hareket devam edebilir.',
    successRate: 78,
    successNote: 'Bulkowski: %78 (n=933, yukarı kırılım). Türkiye piyasasında momentum güçlüyse başarı oranı artar.',
    type: 'reversal',
    typeLabel: 'Dönüş Formasyonu',
    vade: '14 gün',
    description:
      'Çift Dip (W formasyonu), bir düşüş trendinin sonunda oluşan güçlü bir dönüş formasyonudur. ' +
      'Fiyat yaklaşık aynı seviyede iki kez dip yapar ve her ikisinden de toparlanır. ' +
      'Bu yapı, alıcıların o fiyat seviyesini güçlü bir destek olarak gördüğünü gösterir. ' +
      'İkinci dipten sonra boyun seviyesi kırıldığında formasyon onaylanır.',
    howToSpot: [
      'İki dip yaklaşık aynı fiyat seviyesinde (±%3 tolerans)',
      'Diplar arası en az 10-20 iş günü mesafe',
      'İkinci dipte hacim birinci dipten düşük (sıkışma)',
      'Boyun kırılımında hacim belirgin artmalı',
      "Kupa derinliği en az %10-15 (BIST'te %8+ yeterli)",
    ],
    tradeRule: {
      entry: 'Boyun seviyesinin %0.5-1 üstünde kapanış',
      stop: 'İkinci dipin %1-2 altı',
      target: 'Giriş fiyatı + kupa derinliği (%)',
      rr: '2:1 – 3:1 (tipik)',
    },
    commonMistakes: [
      'Boyun kırılmadan önce girmek — formasyon onaysız',
      'Diplar arasındaki mesafe çok kısa (<5 gün) — gerçek çift dip değil',
      'KAP duyurusu döneminde oluşan dipler — manipülasyon riski',
      'Hacim onayı olmadan kırılım — zayıf sinyal',
    ],
    bistaiNote:
      `BistAI'da "Çift Dip" sinyali geldiğinde hisse detay sayfasında grafik üstüne 📐 Formasyon toggle ile kupa şeklini ve boyun çizgisini görebilirsin. Stage "kırılım" olduğunda 🚨 email bildirimi gelir.`,
    svgData: {
      viewBox: '0 0 200 120',
      paths: [
        // W şekli — ana fiyat hareketi
        { d: 'M10 20 L40 80 L80 50 L120 80 L160 30', stroke: '#60a5fa', strokeWidth: 2.5, fill: 'none' },
        // Boyun çizgisi
        { d: 'M40 50 L180 50', stroke: '#ef4444', strokeWidth: 1.5, fill: 'none', strokeDasharray: '5 3' },
        // Kırılım sonrası yükseliş
        { d: 'M160 30 L190 10', stroke: '#22c55e', strokeWidth: 2.5, fill: 'none' },
      ],
      texts: [
        { x: 37, y: 95, text: '1', fill: '#60a5fa', fontSize: 12 },
        { x: 117, y: 95, text: '2', fill: '#60a5fa', fontSize: 12 },
        { x: 185, y: 50, text: 'Boyun', fill: '#ef4444', fontSize: 9 },
        { x: 165, y: 8, text: '↑', fill: '#22c55e', fontSize: 14 },
      ],
      circles: [
        { cx: 40, cy: 80, r: 4, fill: '#22c55e' },
        { cx: 120, cy: 80, r: 4, fill: '#22c55e' },
      ],
    },
  },

  {
    id: 'cift-tepe',
    name: 'Çift Tepe',
    englishName: 'Double Top (M)',
    emoji: '📉',
    direction: 'bearish',
    directionLabel: '↓ Aşağı Yönlü',
    directionPercentage: '%83 aşağı kırılım',
    directionDetail:
      'Grafik büyük ihtimalle AŞAĞI gider. İki eşit tepeden sonra boyun kırılırsa, ' +
      'tepe-boyun mesafesi kadar düşüş beklenir. Kullanıcı için aksiyon: ' +
      'AL pozisyon varsa azalt, yeni AL alımı yapma.',
    successRate: 83,
    successNote: 'Bulkowski: %83 (n=1,121, aşağı kırılım). En güvenilir bearish reversal formasyonlarından.',
    type: 'reversal',
    typeLabel: 'Dönüş Formasyonu',
    vade: '14 gün',
    description:
      'Çift Tepe (M formasyonu), bir yükseliş trendinin sonunda oluşan güçlü bir dönüş formasyonudur. ' +
      'Fiyat yaklaşık aynı dirençte iki kez tepe yapar ve her seferinde geri çekilir. ' +
      'Bu yapı, satıcıların o fiyat seviyesini güçlü direnç olarak gördüğünü gösterir. ' +
      'Boyun seviyesi (iki tepe arası dip) kırıldığında formasyon teyitlenir.',
    howToSpot: [
      'İki tepe yaklaşık aynı fiyat seviyesinde (±%3)',
      'Tepeler arası en az 10-20 iş günü',
      'İkinci tepede hacim azalıyor (momentum kaybı)',
      'Boyun kırılımında hacim artışı',
    ],
    tradeRule: {
      entry: 'Boyun seviyesinin %0.5-1 altında kapanış',
      stop: 'İkinci tepenin %1-2 üstü',
      target: 'Giriş − tepe-boyun mesafesi',
      rr: '2:1 – 3:1',
    },
    commonMistakes: [
      'Boyun kırılmadan önce short açmak',
      'Çok geniş tepeler (>%5 fark) — gerçek çift tepe değil',
      'Dip olarak indikatörden gelen yükselişte M görmek (yanıltıcı)',
    ],
    bistaiNote:
      'BistAI SAT sinyali olarak gösterir. Stage "kırılım" = boyun kırıldı. ' +
      'Elinde hisse varsa Ters Portföy sayfasında bu sinyal sektörle birlikte değerlendirilir.',
    svgData: {
      viewBox: '0 0 200 120',
      paths: [
        { d: 'M10 100 L50 30 L90 60 L130 30 L170 100', stroke: '#f87171', strokeWidth: 2.5, fill: 'none' },
        { d: 'M50 60 L190 60', stroke: '#ef4444', strokeWidth: 1.5, fill: 'none', strokeDasharray: '5 3' },
        { d: 'M170 100 L190 115', stroke: '#ef4444', strokeWidth: 2.5, fill: 'none' },
      ],
      texts: [
        { x: 45, y: 22, text: '1', fill: '#f87171', fontSize: 12 },
        { x: 125, y: 22, text: '2', fill: '#f87171', fontSize: 12 },
        { x: 185, y: 58, text: 'Boyun', fill: '#ef4444', fontSize: 9 },
        { x: 183, y: 118, text: '↓', fill: '#ef4444', fontSize: 14 },
      ],
      circles: [
        { cx: 50, cy: 30, r: 4, fill: '#ef4444' },
        { cx: 130, cy: 30, r: 4, fill: '#ef4444' },
      ],
    },
  },

  {
    id: 'bull-flag',
    name: 'Yükselen Bayrak',
    englishName: 'Bull Flag',
    emoji: '🚩',
    direction: 'bullish',
    directionLabel: '↑ Yukarı Devam',
    directionPercentage: '%67 yukarı kırılım',
    directionDetail:
      'Grafik büyük ihtimalle YUKARI gitmeye devam eder. Trend duraksadı, enerji topluyor. ' +
      'Bayrak kanal alt sınırından aşağı kırılırsa formasyon başarısız — stop-loss devreye girer. ' +
      'Hedef: bayrak direği uzunluğu kadar yükseliş.',
    successRate: 67,
    successNote: 'Bulkowski: %67 (n=486). Kısa vadeli momentum stratejisi için çok kullanılan format.',
    type: 'continuation',
    typeLabel: 'Devam Formasyonu',
    vade: '14 gün',
    description:
      'Bull Flag, güçlü bir yükseliş (bayrak direği) ardından gelen dar konsolidasyon (bayrak) sonrası ' +
      'trendin devam etmesi beklentisiyle oluşur. Alıcılar nefes aldıktan sonra yeniden devreye girer. ' +
      'Kısa vadeli swing trade için çok kullanılan klasik formasyondur.',
    howToSpot: [
      'Bayrak direği: 5-15 günde %15+ güçlü yükseliş',
      'Bayrak: 5-15 gün dar konsolidasyon (max %10 geri çekilme)',
      'Bayrakta hacim belirgin azalmalı (enerji birikimi)',
      'Kırılımda hacim güçlü artmalı',
    ],
    tradeRule: {
      entry: 'Bayrak üst sınırının üzerine çıkış',
      stop: 'Bayrak alt sınırının %1 altı',
      target: 'Giriş + bayrak direği uzunluğu',
      rr: '2:1 – 4:1',
    },
    commonMistakes: [
      'Bayrak çok uzun (>20 gün) — genişleme değil, konsolidasyon bitmiş',
      'Bayrak direği zayıf (<10%) — sinyal güçsüz',
      'Hacim onayı olmadan giriş',
    ],
    bistaiNote:
      'BistAI Bull Flag tespitinde oluşum/kırılım stage\'ini de raporlar. ' +
      'Kırılım stage\'inde 🚨 email gelir. Grafik toggle ile bayrak kanalı görünür.',
    svgData: {
      viewBox: '0 0 200 120',
      paths: [
        { d: 'M10 100 L70 25', stroke: '#22c55e', strokeWidth: 3, fill: 'none' },
        { d: 'M70 25 L120 40', stroke: '#94a3b8', strokeWidth: 1.5, fill: 'none', strokeDasharray: '3 2' },
        { d: 'M70 35 L120 50', stroke: '#94a3b8', strokeWidth: 1.5, fill: 'none', strokeDasharray: '3 2' },
        { d: 'M120 40 L180 5', stroke: '#22c55e', strokeWidth: 2.5, fill: 'none' },
      ],
      texts: [
        { x: 30, y: 68, text: 'Direk', fill: '#22c55e', fontSize: 9 },
        { x: 85, y: 60, text: 'Bayrak', fill: '#94a3b8', fontSize: 9 },
        { x: 150, y: 12, text: '↑', fill: '#22c55e', fontSize: 14 },
      ],
    },
  },

  {
    id: 'bear-flag',
    name: 'Düşen Bayrak',
    englishName: 'Bear Flag',
    emoji: '🏴',
    direction: 'bearish',
    directionLabel: '↓ Aşağı Devam',
    directionPercentage: '%67 aşağı devam',
    directionDetail:
      'Grafik büyük ihtimalle AŞAĞI gitmeye devam eder. Düşüş trendi ara verdi, enerji yeniden birikti. ' +
      'Bayrak kanal üst sınırından yukarı kırılırsa trend tersine dönmüş olabilir — stop-loss önemli.',
    successRate: 67,
    successNote: 'Bulkowski: %67 (n=412). Düşüş trendinde satış baskısının devam edeceği sinyal.',
    type: 'continuation',
    typeLabel: 'Devam Formasyonu',
    vade: '14 gün',
    description:
      'Bear Flag, güçlü bir düşüş (bayrak direği) ardından gelen küçük toparlama (bayrak) sonrası ' +
      'düşüşün devam etmesi beklentisiyle oluşur. Kısa vadeli düşüş devam formasyonudur. ' +
      'Elinde hisse varsa azaltma veya çıkış için sinyal sayılabilir.',
    howToSpot: [
      'Bayrak direği: 5-15 günde %15+ güçlü düşüş',
      'Toparlama: 5-15 gün dar aralıkta hafif yükseliş (max %10)',
      'Toparlamada hacim azalmalı',
      'Kırılımda (aşağı) hacim artmalı',
    ],
    tradeRule: {
      entry: 'Bayrak alt sınırının altına kırılış',
      stop: 'Bayrak üst sınırının %1 üstü',
      target: 'Kırılım − bayrak direği uzunluğu',
      rr: '2:1 – 3:1',
    },
    commonMistakes: [
      'Toparlamanın çok büyük olması (>%15) — trend tersiyebilir',
      'Hacim onayı olmadan kırılım',
      'Düşüş trendinin zaten çok uzamış olması',
    ],
    bistaiNote:
      'BistAI SAT yönlü formasyon olarak gösterir. Elindeki hissede Bear Flag görüyorsa ' +
      'portföy sayfasında uyarı çıkar. Kırılım email\'i 🚨 KIRILIM prefixi ile gelir.',
    svgData: {
      viewBox: '0 0 200 120',
      paths: [
        { d: 'M10 20 L70 95', stroke: '#ef4444', strokeWidth: 3, fill: 'none' },
        { d: 'M70 95 L120 80', stroke: '#94a3b8', strokeWidth: 1.5, fill: 'none', strokeDasharray: '3 2' },
        { d: 'M70 105 L120 90', stroke: '#94a3b8', strokeWidth: 1.5, fill: 'none', strokeDasharray: '3 2' },
        { d: 'M120 90 L180 115', stroke: '#ef4444', strokeWidth: 2.5, fill: 'none' },
      ],
      texts: [
        { x: 25, y: 55, text: 'Direk', fill: '#ef4444', fontSize: 9 },
        { x: 82, y: 75, text: 'Bayrak', fill: '#94a3b8', fontSize: 9 },
        { x: 160, y: 118, text: '↓', fill: '#ef4444', fontSize: 14 },
      ],
    },
  },

  {
    id: 'cup-handle',
    name: 'Kupa-Kulp',
    englishName: 'Cup & Handle',
    emoji: '☕',
    direction: 'bullish',
    directionLabel: '↑ Güçlü Yukarı',
    directionPercentage: '%62 başarı oranı (uzun vade)',
    directionDetail:
      'Grafik kulp üst sınırı kırılınca YUKARI gider. En güvenilir uzun vadeli bullish formasyondur. ' +
      'Kupa derinliği kadar yükseliş potansiyeli. Kulp kırılmadan girmek risklidir — ' +
      'formasyon başarısız olursa %10-15 kayıp olabilir.',
    successRate: 62,
    successNote: 'Bulkowski: %62 (n=326). O\'Neil\'in en çok kullandığı formasyon. Uzun vadede daha güvenilir.',
    type: 'continuation',
    typeLabel: 'Uzun Vadeli Devam',
    vade: '30 gün',
    description:
      'Kupa-Kulp, William O\'Neil\'in "How to Make Money in Stocks" kitabında tanımladığı ' +
      'en güvenilir uzun vadeli yükseliş formasyonudur. U şeklinde yumuşak bir dip (kupa) ' +
      'ardından sığ bir geri çekilme (kulp) ve kırılım gelir. ' +
      'BIST\'te birkaç aylık formasyon olarak ortaya çıkabilir.',
    howToSpot: [
      'Kupa: 4-26 hafta U şeklinde yumuşak dip (V değil U)',
      'Kupa derinliği %12-50 arası',
      'Sol ve sağ kenarlar yaklaşık eşit yükseklikte (±%5)',
      'Kulp: kupa derinliğinin max 1/3\'ü kadar geri çekilme',
      'Kulp süresi 5-25 iş günü',
      'Kırılımda hacim belirgin artış',
    ],
    tradeRule: {
      entry: 'Kulp üst sınırının (pivot nokta) üzerine kırılış',
      stop: 'Kulp ortasının altı veya kupa dibinin üstü',
      target: 'Kırılım + kupa derinliği',
      rr: '3:1 – 5:1',
    },
    commonMistakes: [
      'V şeklindeki dipi kupa saymak — yumuşak U olmali',
      'Kulp çok derin (>kupa 1/3) — formasyon bozulmuş',
      'Hacim onayı olmadan kırılım — zayıf giriş',
      'Kırılım gerçekleşmeden "ucuz" bulmak',
    ],
    bistaiNote:
      'BistAI 80 günlük pencerede kupa-kulp arar. "Kupa Derinliği %X, Kulp Kırılım Y₺" ' +
      'detaylarını gösterir. Grafik toggle ile kupa U eğrisi ve kulp dikdörtgeni görünür.',
    svgData: {
      viewBox: '0 0 220 120',
      paths: [
        // Kupa — U eğrisi (quadratic bezier ile yaklaşık)
        { d: 'M10 20 C10 20 30 85 80 90 C130 95 150 20 150 20', stroke: '#f59e0b', strokeWidth: 2.5, fill: 'none' },
        // Kulp — küçük geri çekilme
        { d: 'M150 20 L170 40 L190 25', stroke: '#94a3b8', strokeWidth: 1.5, fill: 'none', strokeDasharray: '4 2' },
        // Kırılım yükseliş
        { d: 'M190 25 L215 5', stroke: '#22c55e', strokeWidth: 2.5, fill: 'none' },
        // Pivot çizgisi
        { d: 'M150 20 L200 20', stroke: '#22c55e', strokeWidth: 1, fill: 'none', strokeDasharray: '3 2' },
      ],
      texts: [
        { x: 70, y: 110, text: 'Kupa', fill: '#f59e0b', fontSize: 11 },
        { x: 168, y: 52, text: 'Kulp', fill: '#94a3b8', fontSize: 9 },
        { x: 208, y: 4, text: '↑', fill: '#22c55e', fontSize: 14 },
      ],
      circles: [
        { cx: 80, cy: 90, r: 3, fill: '#f59e0b' },
        { cx: 190, cy: 25, r: 3, fill: '#22c55e' },
      ],
    },
  },

  {
    id: 'ters-obo',
    name: 'Ters Omuz-Baş-Omuz',
    englishName: 'Inverse Head & Shoulders',
    emoji: '🧠',
    direction: 'bullish',
    directionLabel: '↑ Güçlü Yukarı',
    directionPercentage: '%88 yukarı kırılım',
    directionDetail:
      'Grafik büyük ihtimalle YUKARI gider. Bulkowski\'nin araştırdığı formasyonlar arasında ' +
      'en yüksek başarı oranına sahip. Boyun kırılınca hedef: boyun-baş mesafesi kadar yükseliş. ' +
      'Boyun kırılmazsa formasyon başarısız — fiyat tekrar aşağı gidebilir.',
    successRate: 88,
    successNote: 'Bulkowski: %88 (n=547). Kitapta "best-performing" formasyon olarak geçer. Kırılım %88 yukarı.',
    type: 'reversal',
    typeLabel: 'Dönüş Formasyonu',
    vade: '30 gün',
    description:
      'Ters Omuz-Baş-Omuz, bir düşüş trendinin sonunda oluşan en güçlü dönüş formasyonudur. ' +
      'Üç dip: sol omuz, baş (en derin dip), sağ omuz. Omuzlar yaklaşık aynı seviyede, ' +
      'baş daha derinde. Boyun (neckline) kırılınca dönüş teyitlenir. ' +
      'BIST\'te sektör dönemleri veya şirket haberleri sonrası sık görülür.',
    howToSpot: [
      'Baş, omuzlardan en az %3-5 daha derin',
      'Sol ve sağ omuz ±%5 aynı seviyede',
      'Boyun (neckline): sol tepe ile sağ tepe arasındaki çizgi',
      'Sağ omuzda hacim soldan düşük',
      'Kırılımda hacim güçlü artış',
    ],
    tradeRule: {
      entry: 'Boyun kırılımı + hacim onayı',
      stop: 'Sağ omuzun altı',
      target: 'Kırılım + boyun-baş mesafesi',
      rr: '3:1 – 5:1',
    },
    commonMistakes: [
      'Omuzları aynı görmeden boyun çizmek',
      'Tek dip görmek (Ters OBO değil, sadece dip)',
      'Hacim onayı olmadan girmek',
      'Kırılım sonrası geri test sırasında paniklemek (normal davranış)',
    ],
    bistaiNote:
      'BistAI "L.S / Baş / R.S" marker\'ları ve neckline yatay çizgisi ile gösterir. ' +
      'Kırılım aşamasında yüksek öncelikli 🚨 email gelir.',
    svgData: {
      viewBox: '0 0 220 120',
      paths: [
        // Sol omuz
        { d: 'M10 30 L40 80 L70 40', stroke: '#a78bfa', strokeWidth: 2, fill: 'none' },
        // Baş
        { d: 'M70 40 L100 105 L130 40', stroke: '#a78bfa', strokeWidth: 2.5, fill: 'none' },
        // Sağ omuz
        { d: 'M130 40 L160 80 L190 30', stroke: '#a78bfa', strokeWidth: 2, fill: 'none' },
        // Neckline
        { d: 'M10 40 L210 40', stroke: '#22c55e', strokeWidth: 1.5, fill: 'none', strokeDasharray: '6 3' },
        // Kırılım yükseliş
        { d: 'M190 30 L215 10', stroke: '#22c55e', strokeWidth: 2.5, fill: 'none' },
      ],
      texts: [
        { x: 32, y: 95, text: 'L.S', fill: '#a78bfa', fontSize: 9 },
        { x: 95, y: 118, text: 'Baş', fill: '#a78bfa', fontSize: 10 },
        { x: 152, y: 95, text: 'R.S', fill: '#a78bfa', fontSize: 9 },
        { x: 185, y: 38, text: 'Boyun', fill: '#22c55e', fontSize: 8 },
        { x: 208, y: 9, text: '↑', fill: '#22c55e', fontSize: 14 },
      ],
      circles: [
        { cx: 40, cy: 80, r: 3, fill: '#a78bfa' },
        { cx: 100, cy: 105, r: 4, fill: '#a78bfa' },
        { cx: 160, cy: 80, r: 3, fill: '#a78bfa' },
      ],
    },
  },

  {
    id: 'yukselen-ucgen',
    name: 'Yükselen Üçgen',
    englishName: 'Ascending Triangle',
    emoji: '📐',
    direction: 'both',
    directionLabel: '↑ Genelde Yukarı (dikkat: iki yönlü)',
    directionPercentage: '%71 yukarı, %29 aşağı kırılım',
    directionDetail:
      'Grafik BÜYÜK İHTİMALLE YUKARI kırar (%71) ama %29 ihtimalle aşağı da kırılabilir. ' +
      'Bu formasyon "iki yönlü" kabul edilir — yön teyit edilene kadar kesin söylemek zordur. ' +
      'Kırılım yönüne göre pozisyon al: yukarı kırılım = AL, aşağı kırılım = SAT veya dikkat.',
    successRate: 71,
    successNote: 'Bulkowski: %71 yukarı kırılım (n=811). Fakat %29 aşağı kırılım da var — dikkatli ol.',
    type: 'continuation',
    typeLabel: 'Devam / Kırılım',
    vade: '14 gün',
    description:
      'Yükselen Üçgen, yatay bir üst direnç ile yükselen bir alt destek arasında sıkışmadan oluşur. ' +
      'Alıcılar giderek daha yüksek fiyattan alım yapıyor (Higher Lows) ama direnç aşılamıyor. ' +
      'Sıkışmanın çözümüyle birlikte güçlü bir kırılım beklenir. ' +
      'Yön belirsizdir ama çoğunlukla yukarı kırar.',
    howToSpot: [
      'Yatay üst direnç: en az 2 tepe aynı seviyede (±%3)',
      'Yükselen alt destek: Higher Lows yapısı',
      'Üçgen daralıyor — pivot noktasına yaklaşıyor',
      'Hacim kırılım öncesi azalıyor (enerji birikimi)',
      'Kırılımda hacim patlaması',
    ],
    tradeRule: {
      entry: 'Yukarı kırılım: direncin %1 üstü · Aşağı kırılım: alt sınırın %1 altı',
      stop: 'Üçgen içine geri dönüşte çık',
      target: 'Üçgen yüksekliği kadar hareket',
      rr: '2:1 – 3:1',
    },
    commonMistakes: [
      'Yönü tahmin etmeye çalışmak — kırılımı bekle',
      'Üçgen içinde pozisyon almak (çok erken)',
      'Hacim onayı olmadan kırılım — fake-out riski yüksek',
      'Üçgen çok dar (pivot noktasına yakın) — geç kalınmış',
    ],
    bistaiNote:
      'BistAI yatay direnç ve yükselen alt destek çizgisini grafik üstünde gösterir. ' +
      'Kırılım yönüne göre AL veya SAT etiketi belirlenir.',
    svgData: {
      viewBox: '0 0 200 120',
      paths: [
        // Yatay direnç
        { d: 'M10 35 L180 35', stroke: '#06b6d4', strokeWidth: 1.5, fill: 'none', strokeDasharray: '5 3' },
        // Yükselen alt destek
        { d: 'M10 100 L160 45', stroke: '#06b6d4', strokeWidth: 1.5, fill: 'none', strokeDasharray: '5 3' },
        // Fiyat zigzag
        { d: 'M10 100 L40 35 L60 70 L100 35 L120 55 L155 35', stroke: '#60a5fa', strokeWidth: 2, fill: 'none' },
        // Yukarı kırılım
        { d: 'M155 35 L190 10', stroke: '#22c55e', strokeWidth: 2.5, fill: 'none' },
        // Aşağı kırılım (alternatif — kesikli)
        { d: 'M155 35 L185 60', stroke: '#ef4444', strokeWidth: 1, fill: 'none', strokeDasharray: '3 3' },
      ],
      texts: [
        { x: 170, y: 28, text: 'Direnç', fill: '#06b6d4', fontSize: 9 },
        { x: 5, y: 115, text: 'HL', fill: '#06b6d4', fontSize: 9 },
        { x: 183, y: 8, text: '↑%71', fill: '#22c55e', fontSize: 9 },
        { x: 178, y: 68, text: '↓%29', fill: '#ef4444', fontSize: 9 },
      ],
    },
  },
];

/** ID'ye göre formasyon bul */
export function getFormation(id: string): FormationContent | undefined {
  return FORMATIONS.find((f) => f.id === id);
}

/** Tüm formasyon ID'leri (static paths için) */
export const FORMATION_IDS = FORMATIONS.map((f) => f.id);
