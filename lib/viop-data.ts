/**
 * VIOP veri adaptörü — kaynak-agnostik TEK arayüz (FAZ V0 → çok-varlıklı genişleme).
 *
 * Üst katman (viop-engine, cron) YALNIZ bu arayüzü tüketir. Kaynak değişse
 * (MVP spot proxy → broker API AlgoLab/Midas/Matriks) SADECE bu dosya değişir.
 *
 * MVP implementasyon: spot OHLCV (mevcut Yahoo kaynağı) + tahmini baz → proxy vadeli
 * seri. Emtia (Altın/Gümüş) için ons-USD + USD/TRY iki seriden gram-TL sentezlenir
 * (VIOP_UNDERLYINGS.yahoo iki elemanlıysa). Her yanıt `dataQuality` + `asOf` taşır.
 *
 * ⚠️ Redistribüsyon: ham broker verisi kullanıcıya AKTARILAMAZ (veri lisansı). Yalnız
 * TÜRETİLMİŞ analiz/skor servis edilir. MVP proxy bu kısıtı doğal olarak çözer (kamuya
 * açık spot/kur serilerinden türetilir).
 */

import type { OHLCVCandle } from '@/types';
import { fetchOHLCV } from './yahoo';
import { VIOP_UNDERLYINGS, type ViopUnderlyingKey } from './viop-symbols';
import { deriveGramTryFromOns } from './viop-basis';

export type ViopDataQuality = 'proxy' | 'delayed' | 'realtime';

/**
 * Dayanağın spot OHLCV serisini döndürür. Emtia (2 Yahoo sembollü) için ons-USD +
 * USD/TRY serilerinden gram-TL sentezlenir; diğerlerinde doğrudan tek seri.
 */
export async function fetchUnderlyingCandles(underlying: ViopUnderlyingKey, days: number): Promise<OHLCVCandle[]> {
  const def = VIOP_UNDERLYINGS[underlying];
  if (def.yahoo.length === 1) {
    const { candles } = await fetchOHLCV(def.yahoo[0], days);
    return candles;
  }
  const [onsSym, fxSym] = def.yahoo;
  const [ons, fx] = await Promise.all([fetchOHLCV(onsSym, days), fetchOHLCV(fxSym, days)]);
  return deriveGramTryFromOns(ons.candles, fx.candles);
}

