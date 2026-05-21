/**
 * US Borsası Sembol Listesi — InvestableEdge APEX US / Aegis US
 *
 * 3 kategori:
 *  large_cap   → Top 80 S&P 500 (likit, kurumsal)
 *  growth      → Nasdaq mid-cap büyüme (yarı iletken, AI, SaaS)
 *  speculative → Momentum / tematik / yüksek beta
 *
 * Penny / micro-cap yok. Sonradan genişletilebilir.
 */

export interface USSymbol {
  symbol: string;
  sector: string;
  type:   'large_cap' | 'growth' | 'speculative';
}

export const US_SYMBOLS: USSymbol[] = [

  // ── Large Cap — Technology ───────────────────────────────────────────
  { symbol: 'AAPL',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'MSFT',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'NVDA',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'GOOGL', sector: 'Technology',  type: 'large_cap' },
  { symbol: 'META',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'AVGO',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'CRM',   sector: 'Technology',  type: 'large_cap' },
  { symbol: 'ORCL',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'ADBE',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'NOW',   sector: 'Technology',  type: 'large_cap' },
  { symbol: 'TXN',   sector: 'Technology',  type: 'large_cap' },
  { symbol: 'QCOM',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'INTC',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'IBM',   sector: 'Technology',  type: 'large_cap' },
  { symbol: 'AMAT',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'KLAC',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'LRCX',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'ADI',   sector: 'Technology',  type: 'large_cap' },
  { symbol: 'MU',    sector: 'Technology',  type: 'large_cap' },
  { symbol: 'ASML',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'ACN',   sector: 'Technology',  type: 'large_cap' },
  { symbol: 'CDNS',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'SNPS',  sector: 'Technology',  type: 'large_cap' },
  { symbol: 'SAP',   sector: 'Technology',  type: 'large_cap' },

  // ── Large Cap — Consumer ─────────────────────────────────────────────
  { symbol: 'AMZN',  sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'TSLA',  sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'HD',    sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'MCD',   sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'COST',  sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'SBUX',  sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'NKE',   sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'LOW',   sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'WMT',   sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'PG',    sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'MDLZ',  sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'NFLX',  sector: 'Consumer',    type: 'large_cap' },
  { symbol: 'BKNG',  sector: 'Consumer',    type: 'large_cap' },

  // ── Large Cap — Healthcare ───────────────────────────────────────────
  { symbol: 'LLY',   sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'UNH',   sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'JNJ',   sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'MRK',   sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'ABBV',  sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'PFE',   sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'TMO',   sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'ABT',   sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'AMGN',  sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'GILD',  sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'BMY',   sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'REGN',  sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'ISRG',  sector: 'Healthcare',  type: 'large_cap' },
  { symbol: 'DHR',   sector: 'Healthcare',  type: 'large_cap' },

  // ── Large Cap — Finance ──────────────────────────────────────────────
  { symbol: 'JPM',   sector: 'Finance',     type: 'large_cap' },
  { symbol: 'V',     sector: 'Finance',     type: 'large_cap' },
  { symbol: 'MA',    sector: 'Finance',     type: 'large_cap' },
  { symbol: 'BAC',   sector: 'Finance',     type: 'large_cap' },
  { symbol: 'GS',    sector: 'Finance',     type: 'large_cap' },
  { symbol: 'MS',    sector: 'Finance',     type: 'large_cap' },
  { symbol: 'AXP',   sector: 'Finance',     type: 'large_cap' },
  { symbol: 'PYPL',  sector: 'Finance',     type: 'large_cap' },

  // ── Large Cap — Energy / Industrial ─────────────────────────────────
  { symbol: 'XOM',   sector: 'Energy',      type: 'large_cap' },
  { symbol: 'CVX',   sector: 'Energy',      type: 'large_cap' },
  { symbol: 'GE',    sector: 'Industrial',  type: 'large_cap' },
  { symbol: 'HON',   sector: 'Industrial',  type: 'large_cap' },
  { symbol: 'BA',    sector: 'Industrial',  type: 'large_cap' },
  { symbol: 'CAT',   sector: 'Industrial',  type: 'large_cap' },
  { symbol: 'LMT',   sector: 'Industrial',  type: 'large_cap' },
  { symbol: 'RTX',   sector: 'Industrial',  type: 'large_cap' },

  // ── Growth — Semiconductor / AI ──────────────────────────────────────
  { symbol: 'AMD',   sector: 'Technology',  type: 'growth' },
  { symbol: 'ARM',   sector: 'Technology',  type: 'growth' },
  { symbol: 'SMCI',  sector: 'Technology',  type: 'growth' },  // kullanıcı talebi
  { symbol: 'MRVL',  sector: 'Technology',  type: 'growth' },
  { symbol: 'ON',    sector: 'Technology',  type: 'growth' },
  { symbol: 'NXPI',  sector: 'Technology',  type: 'growth' },

  // ── Growth — Cybersecurity / Cloud ───────────────────────────────────
  { symbol: 'PANW',  sector: 'Technology',  type: 'growth' },
  { symbol: 'CRWD',  sector: 'Technology',  type: 'growth' },
  { symbol: 'FTNT',  sector: 'Technology',  type: 'growth' },
  { symbol: 'ZS',    sector: 'Technology',  type: 'growth' },
  { symbol: 'DDOG',  sector: 'Technology',  type: 'growth' },
  { symbol: 'SNOW',  sector: 'Technology',  type: 'growth' },
  { symbol: 'PLTR',  sector: 'Technology',  type: 'growth' },
  { symbol: 'TWLO',  sector: 'Technology',  type: 'growth' },
  { symbol: 'NTNX',  sector: 'Technology',  type: 'growth' },

  // ── Growth — E-commerce / Consumer Tech ─────────────────────────────
  { symbol: 'SHOP',  sector: 'Consumer',    type: 'growth' },
  { symbol: 'MELI',  sector: 'Consumer',    type: 'growth' },
  { symbol: 'ROKU',  sector: 'Technology',  type: 'growth' },
  { symbol: 'SNAP',  sector: 'Technology',  type: 'growth' },
  { symbol: 'PINS',  sector: 'Technology',  type: 'growth' },
  { symbol: 'RBLX',  sector: 'Technology',  type: 'growth' },

  // ── Growth — Fintech ────────────────────────────────────────────────
  { symbol: 'HOOD',  sector: 'Finance',     type: 'growth' },
  { symbol: 'SOFI',  sector: 'Finance',     type: 'growth' },
  { symbol: 'AFRM',  sector: 'Finance',     type: 'growth' },
  { symbol: 'UPST',  sector: 'Finance',     type: 'growth' },
  { symbol: 'NU',    sector: 'Finance',     type: 'growth' },
  { symbol: 'MSTR',  sector: 'Finance',     type: 'growth' },
  { symbol: 'COIN',  sector: 'Finance',     type: 'growth' },

  // ── Growth — EV / Mobility ──────────────────────────────────────────
  { symbol: 'RIVN',  sector: 'Consumer',    type: 'growth' },
  { symbol: 'NIO',   sector: 'Consumer',    type: 'growth' },
  { symbol: 'XPEV',  sector: 'Consumer',    type: 'growth' },
  { symbol: 'LI',    sector: 'Consumer',    type: 'growth' },

  // ── Speculative — Quantum Computing ─────────────────────────────────
  { symbol: 'RGTI',  sector: 'Technology',  type: 'speculative' }, // kullanıcı talebi
  { symbol: 'IONQ',  sector: 'Technology',  type: 'speculative' },
  { symbol: 'QBTS',  sector: 'Technology',  type: 'speculative' },
  { symbol: 'ARQQ',  sector: 'Technology',  type: 'speculative' },

  // ── Speculative — AI / Software ─────────────────────────────────────
  { symbol: 'AI',    sector: 'Technology',  type: 'speculative' },
  { symbol: 'BBAI',  sector: 'Technology',  type: 'speculative' },
  { symbol: 'SOUN',  sector: 'Technology',  type: 'speculative' },
  { symbol: 'MTTR',  sector: 'Technology',  type: 'speculative' },

  // ── Speculative — Space / eVTOL ─────────────────────────────────────
  { symbol: 'RKLB',  sector: 'Industrial',  type: 'speculative' },
  { symbol: 'ASTS',  sector: 'Technology',  type: 'speculative' },
  { symbol: 'JOBY',  sector: 'Industrial',  type: 'speculative' },
  { symbol: 'ACHR',  sector: 'Industrial',  type: 'speculative' },
  { symbol: 'LUNR',  sector: 'Technology',  type: 'speculative' },

  // ── Speculative — Crypto / Mining ───────────────────────────────────
  { symbol: 'MARA',  sector: 'Finance',     type: 'speculative' },
  { symbol: 'RIOT',  sector: 'Finance',     type: 'speculative' },
  { symbol: 'CLSK',  sector: 'Finance',     type: 'speculative' },
  { symbol: 'BITF',  sector: 'Finance',     type: 'speculative' },
  { symbol: 'CIFR',  sector: 'Finance',     type: 'speculative' },

  // ── Speculative — Consumer / Healthcare ─────────────────────────────
  { symbol: 'HIMS',  sector: 'Healthcare',  type: 'speculative' },
  { symbol: 'PTON',  sector: 'Consumer',    type: 'speculative' },
  { symbol: 'BYND',  sector: 'Consumer',    type: 'speculative' },
  { symbol: 'LCID',  sector: 'Consumer',    type: 'speculative' },
  { symbol: 'FVRR',  sector: 'Consumer',    type: 'speculative' },
  { symbol: 'UPWK',  sector: 'Consumer',    type: 'speculative' },
  { symbol: 'ETSY',  sector: 'Consumer',    type: 'speculative' },

  // ── Speculative — Latam Fintech ──────────────────────────────────────
  { symbol: 'DLO',   sector: 'Finance',     type: 'speculative' },
  { symbol: 'STNE',  sector: 'Finance',     type: 'speculative' },
  { symbol: 'PAGS',  sector: 'Finance',     type: 'speculative' },
];

// ── Yardımcılar ──────────────────────────────────────────────────────────

const US_SYMBOL_SET = new Set(US_SYMBOLS.map((s) => s.symbol.toUpperCase()));

/** Sembolün US borsasına ait olup olmadığını kontrol et */
export function isUSSymbol(sembol: string): boolean {
  return US_SYMBOL_SET.has(sembol.trim().toUpperCase());
}

/** Tüm US sembollerini string array olarak döndür */
export const US_SYMBOL_LIST: string[] = US_SYMBOLS.map((s) => s.symbol);

/** Tip bazında filtrele */
export function getUSSymbolsByType(type: USSymbol['type']): string[] {
  return US_SYMBOLS.filter((s) => s.type === type).map((s) => s.symbol);
}
