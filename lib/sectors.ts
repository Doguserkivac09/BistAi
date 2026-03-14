/**
 * BIST sektör tanımları ve üye sembolleri.
 * Tarama sayfasındaki BIST_SYMBOLS ile uyumlu.
 */

export interface SectorDefinition {
  id: string;
  name: string;
  symbols: readonly string[];
}

export const SECTORS: readonly SectorDefinition[] = [
  {
    id: 'bankacilik',
    name: 'Bankacılık & Finans',
    symbols: ['AKBNK', 'GARAN', 'HALKB', 'ISCTR', 'VAKBN', 'YKBNK', 'SKBNK', 'ALBRK', 'QNBFB', 'TSKB'],
  },
  {
    id: 'enerji',
    name: 'Enerji & Petrol',
    symbols: ['TUPRS', 'AKSEN', 'AKENR', 'AKSA', 'ENKAI', 'ODAS', 'KONTR', 'ENJSA', 'CWENE', 'EUPWR', 'ZOREN'],
  },
  {
    id: 'teknoloji',
    name: 'Teknoloji & Telekom',
    symbols: ['TCELL', 'TTKOM', 'ASTOR', 'LOGO', 'ARDYZ', 'NETAS', 'INDES'],
  },
  {
    id: 'sanayi',
    name: 'Sanayi & Üretim',
    symbols: ['ARCLK', 'VESBE', 'VESTL', 'BRISA', 'CIMSA', 'OYAKC', 'GESAN', 'EGEEN', 'KORDS', 'SARKY'],
  },
  {
    id: 'otomotiv',
    name: 'Otomotiv & Ulaşım',
    symbols: ['FROTO', 'TOASO', 'OTKAR', 'DOAS', 'CLEBI', 'RYSAS'],
  },
  {
    id: 'perakende',
    name: 'Perakende & Tüketici',
    symbols: ['BIMAS', 'MGROS', 'SOKM', 'ULKER', 'CCOLA', 'TATGD', 'BIZIM', 'MAVI', 'AEFES'],
  },
  {
    id: 'holding',
    name: 'Holding & Yatırım',
    symbols: ['KCHOL', 'SAHOL', 'DOHOL', 'TAVHL', 'TKFEN', 'GLYHO', 'HBCAG'],
  },
  {
    id: 'madencilik',
    name: 'Madencilik & Metal',
    symbols: ['EREGL', 'KRDMD', 'KOZAL', 'KOZAA', 'IPEKE', 'SISE', 'TRKCM', 'SODA', 'PETKM'],
  },
] as const;

/** Sembolden sektör ID'si bul */
export function getSectorBySymbol(symbol: string): SectorDefinition | null {
  return SECTORS.find((s) => s.symbols.includes(symbol)) ?? null;
}

/** Tüm sektör sembollerini düz liste olarak döndür */
export function getAllSectorSymbols(): string[] {
  return SECTORS.flatMap((s) => [...s.symbols]);
}
