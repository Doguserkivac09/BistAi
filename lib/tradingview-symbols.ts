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
 * TradingView'in ÜCRETSİZ embed widget'ında güvenilir biçimde VERİ gösterdiği likit BIST
 * hisseleri (≈ BIST30/50 çekirdeği). Bu listedekiler + endeks + US → TradingView varsayılan;
 * gerisi (küçük/az-işlemli) → kendi grafiğimiz (SignalChart, Yahoo verisiyle tam kapsam).
 *
 * ⚠️ Widget bulamadığı sembolde sessizce Apple'a düşüyor (yanıltıcı) ve bunu cross-origin
 * tespit edemiyoruz → bu yüzden yalnız GÜVENİLİR bilinen likit isimler burada. Eksik büyük
 * hisse olursa kullanıcı modaldaki toggle ile TradingView'e geçebilir (zarar yok).
 */
const BIST_TV_LIQUID = new Set([
  // Bankalar
  'AKBNK', 'GARAN', 'ISCTR', 'YKBNK', 'VAKBN', 'HALKB', 'TSKB',
  // Holding
  'KCHOL', 'SAHOL', 'ENKAI', 'ALARK', 'GSDHO', 'DOHOL',
  // Havacılık & savunma
  'THYAO', 'PGSUS', 'ASELS', 'TAVHL', 'OTKAR',
  // Enerji & kimya
  'TUPRS', 'PETKM', 'SASA', 'AKSEN', 'ENJSA', 'ODAS', 'GUBRF', 'HEKTS', 'AKSA', 'KONTR', 'ASTOR', 'EUPWR',
  // Metal & sanayi
  'EREGL', 'KRDMD', 'SISE', 'OYAKC', 'CIMSA', 'KOZAL', 'KOZAA', 'CEMTS',
  // Otomotiv
  'FROTO', 'TOASO', 'DOAS', 'TTRAK',
  // Perakende & tüketici
  'BIMAS', 'MGROS', 'SOKM', 'ULKER', 'CCOLA', 'MAVI', 'BIZIM',
  // Beyaz eşya & dayanıklı
  'ARCLK', 'VESTL', 'TKFEN',
  // Telekom & teknoloji
  'TCELL', 'TTKOM', 'KAREL', 'LOGO',
  // GYO & inşaat
  'EKGYO', 'ISGYO',
]);

/**
 * Bu sembol için TradingView ücretsiz widget'ı güvenilir mi (veri gösterir mi)?
 * true → TradingView varsayılan; false → kendi grafiğimiz (SignalChart) varsayılan.
 */
export function isTradingViewReliable(symbol: string): boolean {
  const raw = symbol.trim().toUpperCase();
  if (BIST_INDEX_CODES.has(raw)) return true;          // endeksler
  if (isUSSymbol(raw)) return true;                     // US hisseleri
  if (BIST_TV_LIQUID.has(raw)) return true;             // likit büyük BIST
  return false;                                         // gerisi → kendi grafik
}

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
