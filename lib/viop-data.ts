/**
 * VIOP veri adaptörü — kaynak-agnostik TEK arayüz (FAZ V0).
 *
 * Üst katman (viop-engine, cron) YALNIZ bu arayüzü tüketir. Kaynak değişse
 * (MVP spot proxy → broker API AlgoLab/Midas/Matriks) SADECE bu dosya değişir.
 *
 * MVP implementasyon: spot XU030 endeks OHLCV (mevcut Yahoo kaynağı) + tahmini baz →
 * proxy vadeli seri. Her yanıt `dataQuality` + `asOf` taşır.
 *
 * ⚠️ Redistribüsyon: ham broker verisi kullanıcıya AKTARILAMAZ (veri lisansı). Yalnız
 * TÜRETİLMİŞ analiz/skor servis edilir. MVP proxy bu kısıtı doğal olarak çözer (kamuya
 * açık spot endeksten türetilir).
 */

import type { OHLCVCandle } from '@/types';
import { fetchOHLCV } from './yahoo';
import { getActiveViopContracts, daysToExpiry, type ViopContract } from './viop-symbols';
import { deriveProxyFutures, estimateBasis, basisRegime } from './viop-basis';

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

/** Kod → aktif kontrat meta (yoksa null). */
function resolveContract(code: string, now: Date = new Date()): ViopContract | null {
  const active = getActiveViopContracts(now);
  return active.find((c) => c.code.toUpperCase() === code.trim().toUpperCase()) ?? null;
}

/**
 * VIOP kontratı için anlık kotasyon (proxy).
 * @param code Kontrat kodu (ör. "F_XU0300825").
 */
export async function getViopQuote(code: string): Promise<ViopQuote | null> {
  const now = new Date();
  const contract = resolveContract(code, now);
  if (!contract) return null;

  const { candles, currentPrice } = await fetchOHLCV(contract.underlying, 5);
  const spot = currentPrice ?? candles[candles.length - 1]?.close;
  if (!spot || !Number.isFinite(spot)) return null;

  const dte = daysToExpiry(contract, now);
  const basis = estimateBasis(spot, dte);
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

  const { candles } = await fetchOHLCV(contract.underlying, days);
  if (!candles.length) return null;

  const proxy = deriveProxyFutures(candles, contract);
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

/** Aktif kontratların kodlarını döndürür (cron/UI için). */
export function getActiveViopCodes(now: Date = new Date()): string[] {
  return getActiveViopContracts(now).map((c) => c.code);
}
