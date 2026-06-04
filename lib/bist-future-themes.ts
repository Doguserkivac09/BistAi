/**
 * BIST "Geleceği Parlak Şirketler" tema haritası.
 *
 * US tarafı us-symbols.ts'teki SYMBOL_THEMES'i kullanır; BIST'in kendi
 * tematik grupları burada tanımlıdır. Semboller BIST_SYMBOLS (types/index.ts)
 * evreninden seçilmiştir.
 *
 * Yahoo Finance BIST hisselerini `.IS` suffix ile destekler (GARAN.IS vb.)
 * ama coverage ~%60-70'tir; institutionalPct/insider çoğunlukla null gelir
 * (future-score-runner null → nötr 50 yapar, veri yetersizse skorlamaz).
 */

export const BIST_FUTURE_THEMES = {
  'Savunma & Teknoloji': [
    'ASELS', 'RODRG', 'KATMR', 'LOGO', 'ARDYZ',
    'NETAS', 'DGATE', 'INVES', 'LINK', 'ARTMS', 'BLCYT',
  ],
  'Enerji & Yenilenebilir': [
    'AKSEN', 'AKENR', 'ENKAI', 'TUPRS', 'AKFYE', 'GWIND',
    'ZERGY', 'RUZYE', 'TATEN', 'ENJSA', 'AYDEM', 'ODAS',
    'EUPWR', 'BIOEN', 'CWENE',
  ],
  'Finans & Fintech': [
    'GARAN', 'AKBNK', 'ISCTR', 'YKBNK', 'HALKB', 'VAKBN',
    'SKBNK', 'QNBFK', 'ISBIR', 'GEDIK', 'TSKB',
  ],
  'İhracat Liderleri': [
    'FROTO', 'TOASO', 'ARCLK', 'EREGL', 'OTKAR', 'TTRAK',
    'KCHOL', 'SAHOL', 'BIMAS', 'CCOLA', 'AEFES',
  ],
  'Sağlık & Biyoteknoloji': [
    'DEVA', 'SELEC', 'ATATP', 'ONCSM', 'GUBRF', 'ECZYT',
  ],
} as const

export type BistFutureTheme = keyof typeof BIST_FUTURE_THEMES

export const BIST_FUTURE_THEME_LIST = Object.keys(BIST_FUTURE_THEMES) as BistFutureTheme[]

/**
 * İhracat / döviz geliri bonusu — TL değer kaybından korunan şirketler.
 * Yahoo'dan döviz geliri çekilemediği için hardcoded. pegScore'a eklenir (max +20).
 */
export const EXPORT_BONUS: Record<string, number> = {
  // Otomotiv / sanayi ihracatçıları
  FROTO: 20,
  TOASO: 15,
  ARCLK: 18,
  EREGL: 20,
  OTKAR: 15,
  KCHOL: 10,
  TTRAK: 12,
  CCOLA: 10,
  AEFES: 8,
  // Savunma ihracatçıları (USD/EUR sözleşmeli — TL kaybından korunur)
  ASELS: 18,
  KATMR: 8,
}

/** Belirli BIST temasına ait sembolleri döndür. */
export function getBistSymbolsByTheme(theme: string): string[] {
  return (BIST_FUTURE_THEMES as Record<string, readonly string[]>)[theme]
    ? [...(BIST_FUTURE_THEMES as Record<string, readonly string[]>)[theme]]
    : []
}

/** Tüm BIST tema sembollerinin benzersiz birleşimi. */
export function getAllBistFutureSymbols(): string[] {
  const set = new Set<string>()
  for (const theme of BIST_FUTURE_THEME_LIST) {
    for (const s of BIST_FUTURE_THEMES[theme]) set.add(s)
  }
  return [...set]
}

/** Bir BIST temasının geçerli olup olmadığı. */
export function isBistFutureTheme(theme: string): theme is BistFutureTheme {
  return theme in BIST_FUTURE_THEMES
}
