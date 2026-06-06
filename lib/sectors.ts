/**
 * BIST Sektör Mapping — Hisseleri sektörlere gruplandırır.
 * Makro-sektör uyum kuralları ve sektör bazlı analiz için temel modül.
 *
 * Phase 5.1
 */

// ── Sektör Tanımları ────────────────────────────────────────────────

export type SectorId =
  | 'banka'
  | 'holding'
  | 'havacilik_savunma'
  | 'enerji'
  | 'otomotiv'
  | 'perakende'
  | 'telekom_teknoloji'
  | 'demir_celik_madencilik'
  | 'cam_kimya'
  | 'insaat_gyo'
  | 'sigorta_finans'
  | 'sanayi'
  | 'ulastirma'
  | 'saglik'
  | 'diger';

export interface SectorInfo {
  id: SectorId;
  name: string;
  shortName: string;       // UI'da kısa gösterim
  macroSensitivity: MacroSensitivity;
}

/**
 * Sektörün makro koşullara duyarlılığı.
 * Phase 6'da kompozit sinyalde kullanılacak.
 */
export interface MacroSensitivity {
  /** Faiz düşüşünde fayda görür mü? (bankalar, GYO) */
  benefitsFromRateCut: number;    // -1 ile +1 arası
  /** TL zayıflamasında fayda görür mü? (ihracatçılar) */
  benefitsFromWeakTRY: number;
  /** Defansif mi? (risk-off ortamda dayanıklı) */
  defensive: number;
  /** Global büyümeye duyarlı mı? */
  globalGrowthSensitive: number;
  /** Emtia fiyatlarına duyarlı mı? */
  commoditySensitive: number;
}

// ── Sektör Veritabanı ───────────────────────────────────────────────

export const SECTORS: Record<SectorId, SectorInfo> = {
  banka: {
    id: 'banka',
    name: 'Bankacılık & Finans',
    shortName: 'Banka',
    macroSensitivity: {
      benefitsFromRateCut: 0.8,      // Faiz indirimi → kredi büyümesi
      benefitsFromWeakTRY: -0.5,     // TL zayıflaması → NPL riski
      defensive: -0.3,               // Döngüsel
      globalGrowthSensitive: 0.4,
      commoditySensitive: 0.1,
    },
  },
  holding: {
    id: 'holding',
    name: 'Holding',
    shortName: 'Holding',
    macroSensitivity: {
      benefitsFromRateCut: 0.5,
      benefitsFromWeakTRY: 0.0,
      defensive: 0.2,
      globalGrowthSensitive: 0.5,
      commoditySensitive: 0.2,
    },
  },
  havacilik_savunma: {
    id: 'havacilik_savunma',
    name: 'Havacılık & Savunma',
    shortName: 'Havacılık',
    macroSensitivity: {
      benefitsFromRateCut: 0.2,
      benefitsFromWeakTRY: 0.6,      // Döviz geliri yüksek (THY, ASELS)
      defensive: 0.3,                 // Savunma kısmı defansif
      globalGrowthSensitive: 0.6,
      commoditySensitive: -0.3,       // Jet yakıtı maliyeti
    },
  },
  enerji: {
    id: 'enerji',
    name: 'Enerji & Petrol',
    shortName: 'Enerji',
    macroSensitivity: {
      benefitsFromRateCut: 0.2,
      benefitsFromWeakTRY: -0.3,     // Enerji ithalatı TL maliyeti artar
      defensive: 0.4,                // Zorunlu tüketim
      globalGrowthSensitive: 0.5,
      commoditySensitive: 0.8,       // Petrol/doğalgaz fiyatlarına çok duyarlı
    },
  },
  otomotiv: {
    id: 'otomotiv',
    name: 'Otomotiv',
    shortName: 'Otomotiv',
    macroSensitivity: {
      benefitsFromRateCut: 0.6,      // Krediyle satış
      benefitsFromWeakTRY: 0.7,      // İhracat ağırlıklı (FROTO, TOASO)
      defensive: -0.5,               // Döngüsel
      globalGrowthSensitive: 0.7,
      commoditySensitive: 0.3,
    },
  },
  perakende: {
    id: 'perakende',
    name: 'Perakende & Tüketici',
    shortName: 'Perakende',
    macroSensitivity: {
      benefitsFromRateCut: 0.4,
      benefitsFromWeakTRY: -0.4,     // İthal ürün maliyeti
      defensive: 0.6,                // Gıda perakende defansif
      globalGrowthSensitive: 0.2,
      commoditySensitive: 0.3,
    },
  },
  telekom_teknoloji: {
    id: 'telekom_teknoloji',
    name: 'Telekomünikasyon & Teknoloji',
    shortName: 'Telekom/Tech',
    macroSensitivity: {
      benefitsFromRateCut: 0.3,
      benefitsFromWeakTRY: -0.2,
      defensive: 0.5,               // Abonelik modeli
      globalGrowthSensitive: 0.3,
      commoditySensitive: 0.0,
    },
  },
  demir_celik_madencilik: {
    id: 'demir_celik_madencilik',
    name: 'Demir-Çelik & Madencilik',
    shortName: 'Çelik/Maden',
    macroSensitivity: {
      benefitsFromRateCut: 0.2,
      benefitsFromWeakTRY: 0.5,      // İhracat geliri
      defensive: -0.4,               // Çok döngüsel
      globalGrowthSensitive: 0.8,    // Çin talebi kritik
      commoditySensitive: 0.9,       // Emtia fiyatlarına çok duyarlı
    },
  },
  cam_kimya: {
    id: 'cam_kimya',
    name: 'Cam & Kimya Sanayi',
    shortName: 'Cam/Kimya',
    macroSensitivity: {
      benefitsFromRateCut: 0.2,
      benefitsFromWeakTRY: 0.4,
      defensive: 0.0,
      globalGrowthSensitive: 0.5,
      commoditySensitive: 0.6,
    },
  },
  insaat_gyo: {
    id: 'insaat_gyo',
    name: 'İnşaat & GYO',
    shortName: 'İnşaat/GYO',
    macroSensitivity: {
      benefitsFromRateCut: 0.9,      // Mortgage faizi düşer → talep artar
      benefitsFromWeakTRY: -0.5,     // İnşaat maliyeti artar
      defensive: -0.3,
      globalGrowthSensitive: 0.3,
      commoditySensitive: 0.4,
    },
  },
  sigorta_finans: {
    id: 'sigorta_finans',
    name: 'Sigorta & Finansal Hizmetler',
    shortName: 'Sigorta',
    macroSensitivity: {
      benefitsFromRateCut: 0.4,
      benefitsFromWeakTRY: -0.2,
      defensive: 0.5,
      globalGrowthSensitive: 0.2,
      commoditySensitive: 0.0,
    },
  },
  sanayi: {
    id: 'sanayi',
    name: 'Sanayi & Üretim',
    shortName: 'Sanayi',
    macroSensitivity: {
      benefitsFromRateCut: 0.3,
      benefitsFromWeakTRY: 0.5,      // İhracat avantajı
      defensive: -0.2,
      globalGrowthSensitive: 0.6,
      commoditySensitive: 0.4,
    },
  },
  ulastirma: {
    id: 'ulastirma',
    name: 'Ulaştırma & Lojistik',
    shortName: 'Lojistik',
    macroSensitivity: {
      benefitsFromRateCut: 0.2,
      benefitsFromWeakTRY: 0.3,
      defensive: 0.1,
      globalGrowthSensitive: 0.6,
      commoditySensitive: -0.4,      // Yakıt maliyeti
    },
  },
  saglik: {
    id: 'saglik',
    name: 'Sağlık & İlaç',
    shortName: 'Sağlık',
    macroSensitivity: {
      benefitsFromRateCut: 0.1,
      benefitsFromWeakTRY: -0.3,     // İthal ilaç/ekipman
      defensive: 0.8,                // Çok defansif
      globalGrowthSensitive: 0.1,
      commoditySensitive: 0.0,
    },
  },
  diger: {
    id: 'diger',
    name: 'Diğer',
    shortName: 'Diğer',
    macroSensitivity: {
      benefitsFromRateCut: 0.3,
      benefitsFromWeakTRY: 0.0,
      defensive: 0.0,
      globalGrowthSensitive: 0.3,
      commoditySensitive: 0.2,
    },
  },
};

// ── Hisse → Sektör Mapping ──────────────────────────────────────────

const SYMBOL_SECTOR_MAP: Record<string, SectorId> = {
  // ── Bankacılık ────────────────────────────────────────────────────
  AKBNK: 'banka', GARAN: 'banka', HALKB: 'banka', ISCTR: 'banka',
  VAKBN: 'banka', YKBNK: 'banka', SKBNK: 'banka', ALBRK: 'banka',
  QNBFB: 'banka', TSKB: 'banka',

  // ── Sigorta & Finansal Hizmetler ─────────────────────────────────
  HEKTS: 'sigorta_finans', ANHYT: 'sigorta_finans', AGROT: 'sigorta_finans',
  ISMEN: 'sigorta_finans', ANSGR: 'sigorta_finans', AKGRT: 'sigorta_finans',
  RAYSG: 'sigorta_finans', ISFIN: 'sigorta_finans', HBCAG: 'sigorta_finans',
  TURSG: 'sigorta_finans', LIDER: 'sigorta_finans', HEDEF: 'sigorta_finans',

  // ── Holding ───────────────────────────────────────────────────────
  KCHOL: 'holding', SAHOL: 'holding', DOHOL: 'holding',
  TAVHL: 'holding', TKFEN: 'holding', IHLAS: 'holding',
  PEHOL: 'holding', GLYHO: 'holding', ALARK: 'holding',

  // ── Havacılık & Savunma ───────────────────────────────────────────
  THYAO: 'havacilik_savunma', PGSUS: 'havacilik_savunma', ASELS: 'havacilik_savunma',
  KATMR: 'havacilik_savunma', // Katmerciler — zırhlı araç / savunma

  // ── Enerji & Petrokimya ───────────────────────────────────────────
  TUPRS: 'enerji', AKSEN: 'enerji', AKENR: 'enerji', AKSA: 'enerji',
  ODAS: 'enerji', KONTR: 'enerji', ENJSA: 'enerji',
  ORGE: 'enerji', NATEN: 'enerji', AYDEM: 'enerji',
  CWENE: 'enerji', EUPWR: 'enerji', ZOREN: 'enerji',
  PETKM: 'enerji', // Petkim — petrokimya rafinerisi

  // ── Otomotiv & Makine ─────────────────────────────────────────────
  FROTO: 'otomotiv', TOASO: 'otomotiv', OTKAR: 'otomotiv', DOAS: 'otomotiv',
  TTRAK: 'otomotiv', // Türk Traktör
  KARSN: 'otomotiv', // Karsan — otobüs/hafif ticari araç üreticisi

  // ── Perakende & Tüketici ──────────────────────────────────────────
  BIMAS: 'perakende', MGROS: 'perakende', SOKM: 'perakende',
  ULKER: 'perakende', CCOLA: 'perakende', TATGD: 'perakende',
  BIZIM: 'perakende', MAVI: 'perakende', KENT: 'perakende',
  ADEL: 'perakende', AEFES: 'perakende', BERA: 'perakende',
  MPARK: 'perakende', MEGAP: 'perakende', METRO: 'perakende',
  OYLUM: 'perakende', // Oylum Sınai Yatırım — tarım/gıda ticaret
  TKNSA: 'perakende', // Teknosa — elektronik perakende
  // Gıda üreticileri
  PENGD: 'perakende', PETUN: 'perakende', TUKAS: 'perakende',

  // ── Telekomünikasyon & Teknoloji ──────────────────────────────────
  TCELL: 'telekom_teknoloji', TTKOM: 'telekom_teknoloji',
  LOGO: 'telekom_teknoloji', ARDYZ: 'telekom_teknoloji',
  NETAS: 'telekom_teknoloji', MARTI: 'telekom_teknoloji',
  KAREL: 'telekom_teknoloji', // Karel Elektronik
  SMRTG: 'telekom_teknoloji', INDES: 'telekom_teknoloji',

  // ── Demir-Çelik & Madencilik ──────────────────────────────────────
  EREGL: 'demir_celik_madencilik', KRDMD: 'demir_celik_madencilik',
  KRDMA: 'demir_celik_madencilik', KRDMC: 'demir_celik_madencilik',
  KOZAL: 'demir_celik_madencilik', KOZAA: 'demir_celik_madencilik',
  IPEKE: 'demir_celik_madencilik', SILVR: 'demir_celik_madencilik',
  BRSAN: 'demir_celik_madencilik', // Borusan Mannesmann — çelik boru
  CEMTS: 'demir_celik_madencilik', // Çemtaş — çelik döküm
  PARSN: 'demir_celik_madencilik', // Parsan — çelik dökme parça

  // ── Cam & Kimya ───────────────────────────────────────────────────
  SISE: 'cam_kimya', TRKCM: 'cam_kimya', SODA: 'cam_kimya',
  ECILC: 'cam_kimya', ALKIM: 'cam_kimya', // Alkim Kimya
  PIMAS: 'cam_kimya', // Pimas Plastik

  // ── İnşaat & GYO ─────────────────────────────────────────────────
  EKGYO: 'insaat_gyo', ENKA: 'insaat_gyo', KLGYO: 'insaat_gyo',
  ALGYO: 'insaat_gyo', ISGYO: 'insaat_gyo', TRGYO: 'insaat_gyo',
  HLGYO: 'insaat_gyo', OZGYO: 'insaat_gyo', RGYAS: 'insaat_gyo',
  PAGYO: 'insaat_gyo', NIBAS: 'insaat_gyo', PEKGY: 'insaat_gyo',
  INTEM: 'insaat_gyo', // İntema — yapı malzemeleri/inşaat

  // ── Sanayi & Üretim ───────────────────────────────────────────────
  ARCLK: 'sanayi', VESBE: 'sanayi', VESTL: 'sanayi', BRISA: 'sanayi',
  OYAKC: 'sanayi', GESAN: 'sanayi', EGEEN: 'sanayi',
  SANEL: 'sanayi', GEREL: 'sanayi', ALFAS: 'sanayi',
  BTCIM: 'sanayi', BUCIM: 'sanayi', CEMAS: 'sanayi',
  SARKY: 'sanayi', TMSN: 'sanayi', KORDS: 'sanayi',
  OBAMS: 'sanayi', KARTN: 'sanayi', // Kartonsan — kağıt/ambalaj
  JANTS: 'sanayi', // Jantsa — jant üretimi
  MAKIM: 'sanayi', // Makina Takım — takım tezgahı
  OSTIM: 'sanayi', // Ostim — sanayi sitesi yönetim/yatırım
  // Çimento & Yapı Malzemeleri → Sanayi altında
  CIMSA: 'sanayi', AKCNS: 'sanayi', AFYON: 'sanayi', BOLUC: 'sanayi',
  BURVA: 'sanayi', KONYA: 'sanayi', UNYEC: 'sanayi', IZOCM: 'sanayi',
  // Tekstil
  MNDRS: 'sanayi', SUWEN: 'sanayi', SONME: 'sanayi',
  YUNSA: 'sanayi', DAGI: 'sanayi', EDIP: 'sanayi',
  // Tarımsal kimya/gübre
  GUBRF: 'sanayi', BAGFS: 'sanayi',

  // ── Ulaştırma & Lojistik ──────────────────────────────────────────
  CLEBI: 'ulastirma', RYSAS: 'ulastirma', ULASL: 'ulastirma',
  TEKTU: 'ulastirma', // Tek-Art Turizm & Otelcilik veya ulaşım

  // ── Sağlık & İlaç ─────────────────────────────────────────────────
  SELEC: 'saglik', DEVA: 'saglik', ONCSM: 'saglik',

  // ── Diğer (Spor Kulüpleri vb.) ────────────────────────────────────
  BJKAS: 'diger', FENER: 'diger', GSRAY: 'diger', TSPOR: 'diger',

  // ── 2026-05-17: Yeni eklenen tüm semboller ──────────────────────────

  // Bankacılık & Finans
  QNBFK: 'banka', QNBTR: 'banka', ICBCT: 'banka', GEDIK: 'banka',
  GARFA: 'banka', GSDHO: 'banka', GSDDE: 'banka', VAKFN: 'banka',
  VAKFA: 'sigorta_finans', ISBIR: 'sigorta_finans',
  ISGLK: 'sigorta_finans', ISGSY: 'sigorta_finans',
  A1CAP: 'sigorta_finans', A1YEN: 'sigorta_finans',
  AKFIS: 'sigorta_finans', AKSUE: 'sigorta_finans', ATLAS: 'sigorta_finans',
  AGESA: 'sigorta_finans',

  // Holding & Yatırım
  AVHOL: 'holding', EUHOL: 'holding', GRTHO: 'holding', GOZDE: 'holding',
  IEYHO: 'holding', KLRHO: 'holding', LYDHO: 'holding', MZHLD: 'holding',
  NTHOL: 'holding', PAHOL: 'holding', POLHO: 'holding', POLTK: 'holding',
  RALYH: 'holding', TRHOL: 'holding', VANGD: 'holding', YYLGD: 'holding',

  // Havacılık & Savunma
  ATAGY: 'havacilik_savunma', ATAKP: 'havacilik_savunma', AVTUR: 'havacilik_savunma',

  // Enerji & Yenilenebilir
  AKFYE: 'enerji', AKYHO: 'enerji', AYEN: 'enerji',
  AYCES: 'enerji', AYGAZ: 'enerji', BASGZ: 'enerji',
  BIOEN: 'enerji', EGEGY: 'enerji', ENERY: 'enerji', ENPRA: 'enerji',
  ENSRI: 'enerji', ENTRA: 'enerji', EUKYO: 'enerji', EUREN: 'enerji',
  GWIND: 'enerji', RUZYE: 'enerji', SASA: 'enerji', TATEN: 'enerji',
  TGSAS: 'enerji', ZERGY: 'enerji',

  // Otomotiv & Makine
  ALCAR: 'otomotiv', ASUZU: 'otomotiv', BFREN: 'otomotiv', DITAS: 'otomotiv',
  DMSAS: 'otomotiv', EMKEL: 'otomotiv', EPLAS: 'otomotiv', ERBOS: 'otomotiv',
  GOODY: 'otomotiv', KAPLM: 'otomotiv', KBORU: 'otomotiv', KLKIM: 'otomotiv',
  KNFRT: 'otomotiv', KONKA: 'otomotiv', KOPOL: 'otomotiv', KRONT: 'otomotiv',
  KUTPO: 'otomotiv', MNDTR: 'otomotiv', MTRKS: 'otomotiv', OTTO: 'otomotiv',
  TEZOL: 'otomotiv', TMPOL: 'otomotiv', TRMET: 'otomotiv', TUREX: 'otomotiv',

  // Perakende & Tüketici
  ADESE: 'perakende', BIGCH: 'perakende', KOTON: 'perakende', LILAK: 'perakende',
  MARKA: 'perakende', MERIT: 'perakende', MEYSU: 'perakende', PENTA: 'perakende',
  PKENT: 'perakende', SMART: 'perakende', SOKE: 'perakende', TABGD: 'perakende',
  TBORG: 'perakende', UNLU: 'perakende',
  // Gida
  BALAT: 'perakende', BALSU: 'perakende', CASA: 'perakende', ETYAT: 'perakende',
  HATSN: 'perakende', KRVGD: 'perakende', MERKO: 'perakende', MOPAS: 'perakende',
  PNLSN: 'perakende', PNSUT: 'perakende', SELVA: 'perakende', SUMAS: 'perakende',
  TNZTP: 'perakende', TUCLK: 'perakende',

  // Telekomünikasyon & Teknoloji
  ARTMS: 'telekom_teknoloji', BLCYT: 'telekom_teknoloji', DCTTR: 'telekom_teknoloji',
  EDATA: 'telekom_teknoloji', EKOS: 'telekom_teknoloji', ESCOM: 'telekom_teknoloji',
  INGRM: 'telekom_teknoloji', INTEK: 'telekom_teknoloji', INVES: 'telekom_teknoloji',
  LINK: 'telekom_teknoloji', LMKDC: 'telekom_teknoloji', NETCD: 'telekom_teknoloji',
  OBASE: 'telekom_teknoloji', PCILT: 'telekom_teknoloji', SDTTR: 'telekom_teknoloji',
  SEGMN: 'telekom_teknoloji', SKYMD: 'telekom_teknoloji', TLMAN: 'telekom_teknoloji',
  TURGG: 'telekom_teknoloji', VBTYZ: 'telekom_teknoloji', VSNMD: 'telekom_teknoloji',

  // Demir-Çelik & Madencilik
  ALVES: 'demir_celik_madencilik', BMSTL: 'demir_celik_madencilik',
  CELHA: 'demir_celik_madencilik', CVKMD: 'demir_celik_madencilik',
  DOCO: 'demir_celik_madencilik', ERCB: 'demir_celik_madencilik',
  ISDMR: 'demir_celik_madencilik', KRDMB: 'demir_celik_madencilik',
  MAALT: 'demir_celik_madencilik', OZATD: 'demir_celik_madencilik',
  TRALT: 'demir_celik_madencilik', UCAYM: 'demir_celik_madencilik',
  ZGOLD: 'demir_celik_madencilik',

  // Çimento & Yapı → Sanayi
  BASCM: 'sanayi', BYDNR: 'sanayi', CEMZY: 'sanayi', CMBTN: 'sanayi',
  KOCMT: 'sanayi', KTSKR: 'sanayi', MARMR: 'sanayi', SODSN: 'sanayi',

  // Cam, Kimya & Plastik
  ALKLC: 'cam_kimya', ALTNY: 'cam_kimya', AZTEK: 'cam_kimya',
  CRDFA: 'cam_kimya', EFOR: 'cam_kimya', ESCAR: 'cam_kimya',
  ETILR: 'cam_kimya', KIMMR: 'cam_kimya', KLNMA: 'cam_kimya',
  SANKO: 'cam_kimya', TARKM: 'cam_kimya', ULAS: 'cam_kimya',

  // GYO & İnşaat
  AAGYO: 'insaat_gyo', ADGYO: 'insaat_gyo', AGYO: 'insaat_gyo',
  AVGYO: 'insaat_gyo', AVPGY: 'insaat_gyo', BEGYO: 'insaat_gyo',
  DARDL: 'insaat_gyo', DGNMO: 'insaat_gyo', EUYO: 'insaat_gyo',
  GATEG: 'insaat_gyo', GLCVY: 'insaat_gyo', GRNYO: 'insaat_gyo',
  IZINV: 'insaat_gyo', KGYO: 'insaat_gyo', KRGYO: 'insaat_gyo',
  KZBGY: 'insaat_gyo', KZGYO: 'insaat_gyo', LXGYO: 'insaat_gyo',
  MHRGY: 'insaat_gyo', OFSYM: 'insaat_gyo', OPTGY: 'insaat_gyo',
  ORCAY: 'insaat_gyo', OSMEN: 'insaat_gyo', OYAYO: 'insaat_gyo',
  OYYAT: 'insaat_gyo', OZRDN: 'insaat_gyo', OZSUB: 'insaat_gyo',
  OZYSR: 'insaat_gyo', PSGYO: 'insaat_gyo', SAFKR: 'insaat_gyo',
  SEGYO: 'insaat_gyo', SRVGY: 'insaat_gyo', SVGYO: 'insaat_gyo',
  TEHOL: 'insaat_gyo', TSGYO: 'insaat_gyo', VKFYO: 'insaat_gyo',
  VRGYO: 'insaat_gyo', YGGYO: 'insaat_gyo', YYAPI: 'insaat_gyo',
  ZEDUR: 'insaat_gyo', ZELOT: 'insaat_gyo', ZGYO: 'insaat_gyo', ZRGYO: 'insaat_gyo',

  // Ulaştırma & Lojistik
  AHSGY: 'ulastirma', BAHKM: 'ulastirma', BESLR: 'ulastirma', HOROZ: 'ulastirma',

  // Sağlık & İlaç
  ATATP: 'saglik', ATATR: 'saglik', MIATK: 'saglik',

  // Medya & Yayın
  DNISI: 'diger', HURGZ: 'diger', IHYAY: 'diger',

  // Sanayi & Üretim (geniş)
  ANELE: 'sanayi', ANGEN: 'sanayi', ARASE: 'sanayi', ARENA: 'sanayi',
  ARFYE: 'sanayi', ARMGD: 'sanayi', ARSAN: 'sanayi', ATSYH: 'sanayi',
  BESTE: 'sanayi', BEYAZ: 'sanayi', BIENY: 'sanayi', BIGEN: 'sanayi',
  BIGTK: 'sanayi', BINBN: 'sanayi', BINHO: 'sanayi', BLUME: 'sanayi',
  BMSCH: 'sanayi', BOBET: 'sanayi', BORSK: 'sanayi', BRKO: 'sanayi',
  BRKSN: 'sanayi', BRKVY: 'sanayi', BRLSM: 'sanayi', BRYAT: 'sanayi',
  BULGS: 'sanayi', CATES: 'sanayi', CEOEM: 'sanayi', CGCAM: 'sanayi',
  DERHL: 'sanayi', DESPC: 'sanayi', DMRGD: 'sanayi', DOFER: 'sanayi',
  DOFRB: 'sanayi', DOGUB: 'sanayi', DUNYH: 'sanayi', DURDO: 'sanayi',
  DURKN: 'sanayi', EBEBK: 'sanayi', ECOGR: 'sanayi', EGEPO: 'sanayi',
  EGGUB: 'sanayi', EGPRO: 'sanayi', EKIZ: 'sanayi', EKSUN: 'sanayi',
  EMPAE: 'sanayi', ENDAE: 'sanayi', FMIZP: 'sanayi', FORTE: 'sanayi',
  FRIGO: 'sanayi', FRMPL: 'sanayi', GENKM: 'sanayi', GENTS: 'sanayi',
  GIPTA: 'sanayi', GLDTR: 'sanayi', GLRMK: 'sanayi', GMSTR: 'sanayi',
  GOKNR: 'sanayi', GZNMI: 'sanayi', HKTM: 'sanayi', HUBVC: 'sanayi',
  ICUGS: 'sanayi', IHAAS: 'sanayi', IZENR: 'sanayi', IZMDC: 'sanayi',
  KAYSE: 'sanayi', KCAER: 'sanayi', KERVN: 'sanayi', KFEIN: 'sanayi',
  KLSER: 'sanayi', KLSYN: 'sanayi', KLYPV: 'sanayi', KRPLS: 'sanayi',
  KRSTL: 'sanayi', KRTEK: 'sanayi', KSTUR: 'sanayi', KTLEV: 'sanayi',
  KUVVA: 'sanayi', LRSHO: 'sanayi', LYDYE: 'sanayi', MACKO: 'sanayi',
  MAGEN: 'sanayi', MANAS: 'sanayi', MARBL: 'sanayi', MCARD: 'sanayi',
  MEGMT: 'sanayi', MEPET: 'sanayi', MERCN: 'sanayi', MMCAS: 'sanayi',
  MOGAN: 'sanayi', ODINE: 'sanayi', PAMEL: 'sanayi', PAPIL: 'sanayi',
  REEDR: 'sanayi', RNPOL: 'sanayi', RUBNS: 'sanayi', SANFM: 'sanayi',
  SEKFK: 'sanayi', SEKUR: 'sanayi', SERNT: 'sanayi', SKYLP: 'sanayi',
  SMRVA: 'sanayi', SUNTK: 'sanayi', SURGY: 'sanayi', TCKRC: 'sanayi',
  TRENJ: 'sanayi', ULUSE: 'sanayi', YAPRK: 'sanayi', YAYLA: 'sanayi',
  YBTAS: 'sanayi', YESIL: 'sanayi', YIGIT: 'sanayi',

  // ── 2026-06-05: Mynet tam liste farkı (yeni eklenenler) ──
  AKHAN: 'sanayi', AYES: 'demir_celik_madencilik', DSTKF: 'sigorta_finans',
  EKDMR: 'demir_celik_madencilik', INFO: 'sigorta_finans', MEDTR: 'saglik',
  PASEU: 'ulastirma', QUAGR: 'sanayi', UFUK: 'holding', UMPAS: 'holding',
  VERUS: 'holding', YONGA: 'sanayi',
  ISATR: 'banka', ISBTR: 'banka', ISKUR: 'banka', ISSEN: 'sanayi',
};

// ── Public API ──────────────────────────────────────────────────────

/**
 * Bir hissenin sektörünü döndürür.
 */
export function getSector(symbol: string): SectorInfo {
  const normalized = symbol.trim().toUpperCase().replace(/\.IS$/i, '');
  const sectorId = SYMBOL_SECTOR_MAP[normalized] ?? 'diger';
  return SECTORS[sectorId];
}

/**
 * Bir sektördeki tüm hisseleri döndürür.
 */
export function getSymbolsBySector(sectorId: SectorId): string[] {
  return Object.entries(SYMBOL_SECTOR_MAP)
    .filter(([, sid]) => sid === sectorId)
    .map(([symbol]) => symbol);
}

/**
 * Tüm sektörlerin listesini döndürür (hisse sayıları ile).
 */
export function getAllSectors(): Array<SectorInfo & { symbolCount: number; symbols: string[] }> {
  const sectorIds = Object.keys(SECTORS) as SectorId[];
  return sectorIds.map((id) => {
    const symbols = getSymbolsBySector(id);
    return {
      ...SECTORS[id],
      symbolCount: symbols.length,
      symbols,
    };
  }).filter((s) => s.symbolCount > 0);
}

/**
 * Bir hissenin sektör ID'sini döndürür.
 */
export function getSectorId(symbol: string): SectorId {
  const normalized = symbol.trim().toUpperCase().replace(/\.IS$/i, '');
  return SYMBOL_SECTOR_MAP[normalized] ?? 'diger';
}

/**
 * Hisse listesini sektörlere göre gruplar.
 */
export function groupBySector(symbols: string[]): Record<SectorId, string[]> {
  const groups = {} as Record<SectorId, string[]>;
  for (const symbol of symbols) {
    const sectorId = getSectorId(symbol);
    if (!groups[sectorId]) groups[sectorId] = [];
    groups[sectorId].push(symbol.trim().toUpperCase().replace(/\.IS$/i, ''));
  }
  return groups;
}

// ── Sektör Temsilci Hisseleri ────────────────────────────────────────
// Her sektörden seçilen likit ve temsil edici hisseler (sektör sayfası için)

export const SECTOR_REPRESENTATIVES: Partial<Record<SectorId, string[]>> = {
  banka:                    ['GARAN', 'AKBNK', 'YKBNK', 'HALKB', 'ISCTR'],
  sigorta_finans:           ['AKGRT', 'ANHYT', 'ANSGR', 'ISMEN'],
  holding:                  ['KCHOL', 'SAHOL', 'DOHOL', 'TKFEN'],
  havacilik_savunma:        ['THYAO', 'PGSUS', 'ASELS', 'KATMR'],
  enerji:                   ['TUPRS', 'AKSEN', 'ENJSA', 'PETKM', 'ODAS'],
  otomotiv:                 ['FROTO', 'TOASO', 'OTKAR', 'TTRAK', 'KARSN'],
  perakende:                ['BIMAS', 'MGROS', 'SOKM', 'ULKER', 'CCOLA'],
  telekom_teknoloji:        ['TCELL', 'TTKOM', 'LOGO', 'ARDYZ', 'KAREL'],
  demir_celik_madencilik:   ['EREGL', 'KRDMD', 'KOZAL', 'KOZAA', 'BRSAN'],
  cam_kimya:                ['SISE', 'SODA', 'ECILC', 'ALKIM'],
  insaat_gyo:               ['EKGYO', 'ENKA', 'ISGYO', 'KLGYO', 'TRGYO'],
  sanayi:                   ['ARCLK', 'VESTL', 'BRISA', 'CIMSA', 'AKCNS'],
  ulastirma:                ['CLEBI', 'RYSAS', 'THYAO'],
  saglik:                   ['SELEC', 'DEVA', 'ONCSM'],
};

// ── Sektör Momentum ─────────────────────────────────────────────────

import type { OHLCVCandle } from '@/types';

export interface SectorMomentum {
  sectorId: SectorId;
  name: string;          // kısa sektör adı
  score: number;         // ortalama 20 günlük getiri (%)
  direction: 'yukari' | 'asagi' | 'nötr';
  stockCount: number;    // hesaplamaya giren hisse sayısı
}

/** Son 20 işlem gününün getirisini hesaplar (volume > 0 filtreli) */
function get20DReturn(candles: OHLCVCandle[]): number | null {
  const td = candles.filter((c) => (c.volume ?? 0) > 0);
  if (td.length < 5) return null;
  const last = td[td.length - 1]!.close;
  const base = td[Math.max(0, td.length - 20)]!.close;
  if (base === 0) return null;
  return ((last - base) / base) * 100;
}

/**
 * Tarama sonuçlarından sektör momentum haritası üretir.
 * Her sektör için mevcut hisselerin ortalama 20 günlük getirisini hesaplar.
 * Ekstra API isteği yok — mevcut candle verisi kullanılır.
 */
export function computeSectorMomentum(
  scanResults: Array<{ sembol: string; candles: OHLCVCandle[] }>
): Map<string, SectorMomentum> {
  const accum = new Map<string, { sum: number; count: number; sectorId: SectorId; name: string }>();

  for (const { sembol, candles } of scanResults) {
    const info = getSector(sembol);
    if (info.id === 'diger') continue; // bilinmeyen sektörleri atla
    const ret = get20DReturn(candles);
    if (ret === null) continue;
    const key = info.id;
    const prev = accum.get(key) ?? { sum: 0, count: 0, sectorId: info.id, name: info.shortName };
    accum.set(key, { ...prev, sum: prev.sum + ret, count: prev.count + 1 });
  }

  const result = new Map<string, SectorMomentum>();
  accum.forEach(({ sum, count, sectorId, name }, key) => {
    if (count < 1) return;
    const score = Math.round((sum / count) * 100) / 100;
    const direction: SectorMomentum['direction'] =
      score >= 2  ? 'yukari' :
      score <= -2 ? 'asagi'  : 'nötr';
    result.set(key, { sectorId, name, score, direction, stockCount: count });
  });

  return result;
}
