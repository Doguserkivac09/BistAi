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
    name: 'Cam & Kimya',
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
  // Bankacılık & Finans
  AKBNK: 'banka', GARAN: 'banka', HALKB: 'banka', ISCTR: 'banka',
  VAKBN: 'banka', YKBNK: 'banka', SKBNK: 'banka', ALBRK: 'banka',
  QNBFB: 'banka', TSKB: 'banka',

  // Holding
  KCHOL: 'holding', SAHOL: 'holding', DOHOL: 'holding',
  TAVHL: 'holding', TKFEN: 'holding',

  // Havacılık & Savunma
  THYAO: 'havacilik_savunma', PGSUS: 'havacilik_savunma', ASELS: 'havacilik_savunma',

  // Enerji & Petrol
  TUPRS: 'enerji', AKSEN: 'enerji', AKENR: 'enerji', AKSA: 'enerji',
  ENKAI: 'enerji', ODAS: 'enerji', KONTR: 'enerji', ENJSA: 'enerji',

  // Otomotiv
  FROTO: 'otomotiv', TOASO: 'otomotiv', OTKAR: 'otomotiv', DOAS: 'otomotiv',

  // Perakende & Tüketici
  BIMAS: 'perakende', MGROS: 'perakende', SOKM: 'perakende',
  ULKER: 'perakende', CCOLA: 'perakende', TATGD: 'perakende',
  BIZIM: 'perakende', MAVI: 'perakende',

  // Telekomünikasyon & Teknoloji
  TCELL: 'telekom_teknoloji', TTKOM: 'telekom_teknoloji',
  ASTOR: 'telekom_teknoloji', LOGO: 'telekom_teknoloji',
  ARDYZ: 'telekom_teknoloji', NETAS: 'telekom_teknoloji',

  // Demir-Çelik & Madencilik
  EREGL: 'demir_celik_madencilik', KRDMD: 'demir_celik_madencilik',
  KOZAL: 'demir_celik_madencilik', KOZAA: 'demir_celik_madencilik',
  IPEKE: 'demir_celik_madencilik',

  // Cam & Kimya
  SISE: 'cam_kimya', TRKCM: 'cam_kimya', SODA: 'cam_kimya',
  GUBRF: 'cam_kimya', PETKM: 'cam_kimya',

  // İnşaat & GYO
  EKGYO: 'insaat_gyo', ENKA: 'insaat_gyo', KLGYO: 'insaat_gyo',
  ALGYO: 'insaat_gyo', ISGYO: 'insaat_gyo',

  // Sigorta & Finansal Hizmetler
  HEKTS: 'sigorta_finans', ANHYT: 'sigorta_finans',
  AGROT: 'sigorta_finans', ISMEN: 'sigorta_finans',

  // Sanayi & Üretim
  ARCLK: 'sanayi', VESBE: 'sanayi', VESTL: 'sanayi', BRISA: 'sanayi',
  CIMSA: 'sanayi', OYAKC: 'sanayi', GESAN: 'sanayi', EGEEN: 'sanayi',

  // Ulaştırma & Lojistik
  CLEBI: 'ulastirma', RYSAS: 'ulastirma',

  // Sağlık & İlaç
  SELEC: 'saglik', DEVA: 'saglik',

  // Diğer
  ALFAS: 'sanayi', BERA: 'perakende', BTCIM: 'sanayi', BUCIM: 'sanayi',
  CEMAS: 'sanayi', ECILC: 'cam_kimya', GLYHO: 'holding',
  KARSN: 'sanayi', MPARK: 'perakende', PEKGY: 'insaat_gyo',
  SARKY: 'sanayi', SMRTG: 'telekom_teknoloji', TMSN: 'sanayi',
  TURSG: 'sigorta_finans', ALARK: 'holding', AEFES: 'perakende',
  BAGFS: 'cam_kimya', CWENE: 'enerji', EUPWR: 'enerji',
  HBCAG: 'sigorta_finans', INDES: 'telekom_teknoloji',
  KORDS: 'sanayi', MEGAP: 'perakende', OBAMS: 'sanayi',
  SILVR: 'demir_celik_madencilik', ZOREN: 'enerji',
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
  holding:                  ['KCHOL', 'SAHOL', 'DOHOL', 'TKFEN'],
  havacilik_savunma:        ['THYAO', 'PGSUS', 'ASELS'],
  enerji:                   ['TUPRS', 'AKSEN', 'ENJSA', 'ODAS', 'ZOREN'],
  otomotiv:                 ['FROTO', 'TOASO', 'ARCLK', 'OTKAR'],
  perakende:                ['BIMAS', 'MGROS', 'SOKM', 'ULKER', 'CCOLA'],
  telekom_teknoloji:        ['TCELL', 'TTKOM', 'LOGO', 'ARDYZ'],
  demir_celik_madencilik:   ['EREGL', 'KRDMD', 'KOZAL', 'KOZAA'],
  cam_kimya:                ['SISE', 'TRKCM', 'PETKM', 'SODA'],
  insaat_gyo:               ['EKGYO', 'ENKA', 'ISGYO', 'KLGYO'],
  sanayi:                   ['ARCLK', 'VESTL', 'BRISA', 'CIMSA'],
  sigorta_finans:           ['AKGRT', 'ANHYT', 'ISMEN'],
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
