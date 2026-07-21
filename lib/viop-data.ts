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
import {
  getAllActiveViopContracts,
  daysToExpiry,
  VIOP_UNDERLYINGS,
  type ViopContract,
  type ViopUnderlyingKey,
} from './viop-symbols';
import { deriveProxyFutures, deriveGramTryFromOns, estimateBasis, basisRegime, DEFAULT_ANNUAL_RATE } from './viop-basis';

export type ViopDataQuality = 'proxy' | 'delayed' | 'realtime';

export interface ViopQuote {
  code: string;
  underlying: string;
  /** Tahmini vadeli fiyat. */
  price: number;
  /** Dayanak spot fiyatı. */
  spot: number;
  /** Baz (F − S). */
  basis: number;
  regime: 'contango' | 'backwardation' | 'flat';
  daysToExpiry: number;
  dataQuality: ViopDataQuality;
  asOf: string; // ISO timestamp
}

export interface ViopOhlcv {
  code: string;
  underlying: string;
  candles: OHLCVCandle[];
  lastBasis: number;
  regime: 'contango' | 'backwardation' | 'flat';
  dataQuality: ViopDataQuality;
  asOf: string;
}

/** Kod → aktif kontrat meta (yoksa null). Tüm varlık sınıfları taranır. */
function resolveContract(code: string, now: Date = new Date()): ViopContract | null {
  const active = getAllActiveViopContracts(now);
  return active.find((c) => c.code.toUpperCase() === code.trim().toUpperCase()) ?? null;
}

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

/**
 * VIOP kontratı için anlık kotasyon (proxy).
 * @param code Kontrat kodu (ör. "F_XU0300825").
 */
export async function getViopQuote(code: string): Promise<ViopQuote | null> {
  const now = new Date();
  const contract = resolveContract(code, now);
  if (!contract) return null;

  const def = VIOP_UNDERLYINGS[contract.underlying];
  const candles = await fetchUnderlyingCandles(contract.underlying, 5);
  const spot = candles[candles.length - 1]?.close;
  if (!spot || !Number.isFinite(spot)) return null;

  const dte = daysToExpiry(contract, now);
  const basis = estimateBasis(spot, dte, DEFAULT_ANNUAL_RATE, def.carryYield);
  return {
    code: contract.code,
    underlying: contract.underlying,
    price: spot + basis,
    spot,
    basis,
    regime: basisRegime(basis),
    daysToExpiry: dte,
    dataQuality: 'proxy',
    asOf: now.toISOString(),
  };
}

/**
 * VIOP kontratı için proxy OHLCV serisi (spot + baz türetme).
 * @param code Kontrat kodu.
 * @param days Kaç günlük geçmiş (varsayılan 180).
 */
export async function getViopOhlcv(code: string, days = 180): Promise<ViopOhlcv | null> {
  const now = new Date();
  const contract = resolveContract(code, now);
  if (!contract) return null;

  const def = VIOP_UNDERLYINGS[contract.underlying];
  const candles = await fetchUnderlyingCandles(contract.underlying, days);
  if (!candles.length) return null;

  const proxy = deriveProxyFutures(candles, contract, DEFAULT_ANNUAL_RATE, def.carryYield);
  return {
    code: contract.code,
    underlying: contract.underlying,
    candles: proxy.candles,
    lastBasis: proxy.lastBasis,
    regime: proxy.regime,
    dataQuality: 'proxy',
    asOf: now.toISOString(),
  };
}

/** Aktif kontratların kodlarını döndürür (tüm varlık sınıfları). */
export function getActiveViopCodes(now: Date = new Date()): string[] {
  return getAllActiveViopContracts(now).map((c) => c.code);
}
