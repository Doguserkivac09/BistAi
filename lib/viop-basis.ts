/**
 * Spot ↔ vadeli baz (basis) hesabı + proxy vadeli seri türetme (FAZ V0).
 *
 * Cost-of-carry modeli:  F = S · e^{(r − q)·T}  ≈  S · (1 + (r − q)·T)
 *   F = vadeli fiyat, S = spot, r = risksiz faiz (yıllık), q = temettü verimi (yıllık),
 *   T = vadeye kalan süre (yıl).  Vade yaklaştıkça (T→0) baz sıfıra yakınsar (convergence).
 *
 * MVP proxy: gerçek vadeli feed yerine spot XU030 + tahmini baz ile vadeli seri türetilir.
 * Sonuç `proxy: true` bayrağı taşır; UI "gecikmeli/proxy" rozeti gösterir.
 */

import type { OHLCVCandle } from '@/types';
import type { ViopContract } from './viop-symbols';

/** TR risksiz faiz yıllık varsayımı (proxy baz için) — makro motorundan beslenebilir. */
export const DEFAULT_ANNUAL_RATE = 0.45;
/** Endeks temettü verimi yıllık varsayımı. */
export const DEFAULT_DIV_YIELD = 0.03;

/**
 * Basit (doğrusal) cost-of-carry bazı: F − S = S · (r − q) · T.
 * @param spot Spot fiyat.
 * @param daysToExpiry Vadeye kalan takvim günü.
 * @param annualRate Yıllık risksiz faiz (ondalık, ör. 0.45).
 * @param divYield Yıllık temettü verimi (ondalık).
 * @returns Baz (₺/puan cinsinden F − S). Vade geçmişse (gün ≤ 0) 0.
 */
export function estimateBasis(
  spot: number,
  daysToExpiry: number,
  annualRate: number = DEFAULT_ANNUAL_RATE,
  divYield: number = DEFAULT_DIV_YIELD
): number {
  if (!Number.isFinite(spot) || spot <= 0) return 0;
  if (daysToExpiry <= 0) return 0; // convergence: vade günü baz = 0
  const T = daysToExpiry / 365;
  return spot * (annualRate - divYield) * T;
}

/** Spot fiyattan tahmini vadeli fiyat. */
export function spotToFutures(
  spot: number,
  daysToExpiry: number,
  annualRate: number = DEFAULT_ANNUAL_RATE,
  divYield: number = DEFAULT_DIV_YIELD
): number {
  return spot + estimateBasis(spot, daysToExpiry, annualRate, divYield);
}

/**
 * Contango mu backwardation mı? (proxy baz her zaman r>q iken contango üretir;
 * gerçek feed geldiğinde bu fonksiyon ham bazı sınıflandırmak için kullanılır.)
 */
export function basisRegime(basis: number): 'contango' | 'backwardation' | 'flat' {
  if (basis > 0.01) return 'contango';
  if (basis < -0.01) return 'backwardation';
  return 'flat';
}

const TROY_OUNCE_GRAMS = 31.1034768;

/**
 * Ons-USD emtia serisini (altın/gümüş) TRY/gram serisine çevirir:
 * gramTRY = (onsUSD ÷ 31.1034768) × usdtry.
 *
 * VIOP altın/gümüş kontratları gram-TL bazlıdır — ons-USD fiyatını doğrudan "TL"
 * gibi kullanmak yanlış birim/para birimi olurdu (~40x sapma). Tarihe göre INNER
 * JOIN yapılır (yalnız iki seride de bulunan tarihler); emtia vadeli takvimi ile
 * kur takvimi tam örtüşmeyebilir (farklı borsa tatilleri) — bu doğal ve zararsız.
 */
export function deriveGramTryFromOns(onsCandles: OHLCVCandle[], usdtryCandles: OHLCVCandle[]): OHLCVCandle[] {
  const fxByDate = new Map<string, OHLCVCandle>();
  for (const c of usdtryCandles) fxByDate.set(String(c.date), c);

  const out: OHLCVCandle[] = [];
  for (const c of onsCandles) {
    const fx = fxByDate.get(String(c.date));
    if (!fx) continue;
    const toGramTry = (v: number) => (v / TROY_OUNCE_GRAMS) * fx.close;
    out.push({
      date: c.date,
      open: toGramTry(c.open),
      high: toGramTry(c.high),
      low: toGramTry(c.low),
      close: toGramTry(c.close),
      volume: c.volume,
    });
  }
  return out;
}

export interface ProxyFuturesSeries {
  candles: OHLCVCandle[];
  proxy: true;
  /** Son mumdaki tahmini baz (₺/puan). */
  lastBasis: number;
  /** Baz rejimi. */
  regime: 'contango' | 'backwardation' | 'flat';
}

/** candle.date'i ms'e çevir (YYYY-MM-DD | unix saniye). */
function candleMs(date: string | number): number {
  return typeof date === 'number' ? date * 1000 : new Date(date).getTime();
}

/**
 * Spot endeks OHLCV serisinden proxy vadeli seri türetir.
 * Her mumun bazı, O MUMUN tarihinden kontrat vadesine kalan güne göre hesaplanır
 * (tarihsel convergence doğru modellenir — eski mumlarda baz büyük, vadeye yakın küçük).
 *
 * @param spotCandles Spot endeks (ör. XU030) günlük mumları.
 * @param contract VIOP kontratı (vade tarihi baz için).
 * @param annualRate/divYield Baz parametreleri.
 */
export function deriveProxyFutures(
  spotCandles: OHLCVCandle[],
  contract: ViopContract,
  annualRate: number = DEFAULT_ANNUAL_RATE,
  divYield: number = DEFAULT_DIV_YIELD
): ProxyFuturesSeries {
  const expiryMs = contract.expiry.getTime();
  const candles: OHLCVCandle[] = spotCandles.map((c) => {
    const dte = Math.max(0, Math.round((expiryMs - candleMs(c.date)) / 86_400_000));
    const adj = (v: number) => v + estimateBasis(v, dte, annualRate, divYield);
    return {
      date: c.date,
      open: adj(c.open),
      high: adj(c.high),
      low: adj(c.low),
      close: adj(c.close),
      volume: c.volume, // proxy: spot hacmi (gerçek vadeli hacim yok)
    };
  });

  const last = candles[candles.length - 1];
  const lastSpot = spotCandles[spotCandles.length - 1];
  let lastBasis = 0;
  if (last && lastSpot) lastBasis = last.close - lastSpot.close;

  return {
    candles,
    proxy: true,
    lastBasis,
    regime: basisRegime(lastBasis),
  };
}
