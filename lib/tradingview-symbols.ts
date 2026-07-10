/**
 * İç sembol → TradingView sembolü eşlemesi.
 *
 * TradingView Advanced Chart widget'ı "EXCHANGE:SYMBOL" formatında sembol bekler.
 * - BIST hisseleri:  GARAN → BIST:GARAN
 * - BIST endeksleri: XU030 → BIST:XU030,  XU100 → BIST:XU100
 * - US hisseleri:    AAPL  → NASDAQ:AAPL (borsa belirsizse sade "AAPL" → TV çözer)
 * - VIOP kontratları: TV'de doğrudan karşılığı olmayabilir → underlying spot endekse
 *   düşülür ve `proxy: true` döndürülür (UI "gecikmeli/proxy" rozeti gösterir).
 *
 * FAZ TV (VIOP-TRADINGVIEW-PLAN.md). Salt fonksiyon; harici bağımlılık yok.
 */

import { isUSSymbol } from './us-symbols';

export interface TradingViewSymbol {
  /** Widget'a verilecek tam sembol (ör. "BIST:GARAN"). */
  tvSymbol: string;
  /** Gerçek kontrat yerine spot/endeks karşılığı gösteriliyorsa true. */
  proxy: boolean;
  /** Proxy ise kullanıcıya gösterilecek kısa not. */
  proxyNote?: string;
}

/** BIST endeks kodları — TradingView'de BIST: önekiyle bulunur. */
const BIST_INDEX_CODES = new Set([
  'XU030', 'XU100', 'XU050', 'XBANK', 'XUSIN', 'XUTEK', 'XUHIZ', 'XUMAL',
]);

/**
 * VIOP vadeli kontrat kodu → underlying spot sembolü.
 * TradingView'de VIOP kontratlarının çoğunun temiz karşılığı yok; underlying'e düşeriz.
 * Örn. "F_XU0300825" (XU030 Ağustos vadeli) → "XU030" spot endeksi.
 */
const VIOP_UNDERLYING: Record<string, string> = {
  XU030: 'XU030',
  XU100: 'XU100',
};

/** Bir kodun VIOP vadeli kontrat kodu olup olmadığını kaba tahmin eder. */
export function isViopContract(code: string): boolean {
  return /^F_/i.test(code.trim());
}

/**
 * VIOP kontrat kodundan underlying'i çıkarır.
 * "F_XU0300825" → "XU030", "F_GARAN0825" → "GARAN".
 */
export function viopUnderlying(code: string): string {
  const body = code.trim().replace(/^F_/i, '').toUpperCase();
  // Bilinen endeks önekleri
  for (const key of Object.keys(VIOP_UNDERLYING)) {
    if (body.startsWith(key)) return key;
  }
  // Hisse vadelileri: sonundaki vade eki (MMYY / 4 hane) at
  return body.replace(/\d{3,6}$/, '');
}

/**
 * İç sembolü TradingView sembolüne çevirir.
 *
 * @param symbol İç sembol (ör. "GARAN", "XU030", "AAPL", "F_XU0300825").
 */
export function toTradingViewSymbol(symbol: string): TradingViewSymbol {
  const raw = symbol.trim().toUpperCase();

  // 1) VIOP vadeli kontrat → underlying spot endekse/hisseye düş (proxy)
  if (isViopContract(raw)) {
    const underlying = viopUnderlying(raw);
    const inner = toTradingViewSymbol(underlying);
    return {
      tvSymbol: inner.tvSymbol,
      proxy: true,
      proxyNote: `${raw} vadeli kontratının TradingView karşılığı yok — ${underlying} spot verisi gösteriliyor (gecikmeli/proxy).`,
    };
  }

  // 2) BIST endeksi
  if (BIST_INDEX_CODES.has(raw)) {
    return { tvSymbol: `BIST:${raw}`, proxy: false };
  }

  // 3) US hissesi
  if (isUSSymbol(raw)) {
    // Borsa öneki verilmezse TradingView otomatik çözer; sade sembol yeterli.
    return { tvSymbol: raw, proxy: false };
  }

  // 4) Varsayılan: BIST hissesi
  return { tvSymbol: `BIST:${raw}`, proxy: false };
}
