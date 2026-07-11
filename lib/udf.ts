/**
 * UDF (Universal Data Feed) yardımcıları — TradingView Advanced Charting Library için.
 *
 * TradingView Charting Library, verisini bir "datafeed"den alır. UDF, kütüphaneyle gelen
 * `UDFCompatibleDatafeed` yardımcısının konuştuğu basit REST protokolüdür. Bu modül,
 * KENDİ OHLCV verimizi (Yahoo, 619 BIST + US) UDF formatına çevirir → TradingView'in tam
 * profesyonel arayüzü BIST veri-lisansı sorunu OLMADAN çalışır (veri bizden gelir).
 *
 * Endpoint'ler: /api/udf/config, /symbols, /search, /history, /time (app/api/udf/[action]).
 */

import { fetchOHLCV, fetchOHLCVByTimeframe, type YahooTimeframe } from './yahoo';
import { fetchOHLCVUS } from './yahoo-us';
import { isUSSymbol, US_SYMBOL_LIST } from './us-symbols';
import { BIST_SYMBOLS } from '@/types';
import type { OHLCVCandle } from '@/types';

/** TradingView çözünürlüğü → iç timeframe. Desteklenmeyen → null. */
export function resolutionToTimeframe(resolution: string): YahooTimeframe | null {
  switch (resolution) {
    case '15': return '15m';
    case '30': return '30m';
    case '60': return '1h';
    case '1D':
    case 'D': return '1d';
    case '1W':
    case 'W': return '1wk';
    case '1M':
    case 'M': return '1mo';
    default: return null;
  }
}

export const BIST_RESOLUTIONS = ['15', '30', '60', 'D', 'W', 'M'];
export const US_RESOLUTIONS = ['D', 'W', 'M'];

/** UDF /config yanıtı. */
export function udfConfig() {
  return {
    supported_resolutions: BIST_RESOLUTIONS,
    supports_group_request: false,
    supports_marks: false,
    supports_search: true,
    supports_timescale_marks: false,
    supports_time: true,
  };
}

/** candle.date → unix saniye (UDF bar zamanı). */
function candleToSeconds(date: string | number): number {
  if (typeof date === 'number') return date; // intraday zaten saniye
  return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000);
}

export interface UdfSymbolInfo {
  name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  listed_exchange: string;
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  supported_resolutions: string[];
  volume_precision: number;
  data_status: string;
  currency_code: string;
}

/** Sembol için UDF /symbols meta bilgisi. */
export function udfSymbolInfo(symbol: string): UdfSymbolInfo {
  const raw = symbol.trim().toUpperCase();
  const us = isUSSymbol(raw);
  return {
    name: raw,
    ticker: raw,
    description: raw,
    type: 'stock',
    session: us ? '0930-1600' : '0930-1800',
    timezone: us ? 'America/New_York' : 'Europe/Istanbul',
    exchange: us ? 'US' : 'BIST',
    listed_exchange: us ? 'US' : 'BIST',
    minmov: 1,
    pricescale: 100, // 2 ondalık
    has_intraday: !us, // US intraday'i tek kaynakla sağlamıyoruz → yalnız BIST
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: us ? US_RESOLUTIONS : BIST_RESOLUTIONS,
    volume_precision: 0,
    data_status: 'delayed_streaming',
    currency_code: us ? 'USD' : 'TRY',
  };
}

export interface UdfBars {
  s: 'ok' | 'no_data' | 'error';
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
  nextTime?: number;
  errmsg?: string;
}

/**
 * UDF /history — belirtilen sembol + çözünürlük için [from,to] aralığındaki barlar.
 * Kendi OHLCV kaynağımızdan çeker (BIST: fetchOHLCVByTimeframe, US: fetchOHLCVUS/günlük).
 */
export async function udfHistory(
  symbol: string,
  resolution: string,
  from: number,
  to: number,
): Promise<UdfBars> {
  const tf = resolutionToTimeframe(resolution);
  if (!tf) return { s: 'error', errmsg: 'Desteklenmeyen çözünürlük' };

  const raw = symbol.trim().toUpperCase();
  const us = isUSSymbol(raw);

  let candles: OHLCVCandle[] = [];
  try {
    if (us) {
      // US: yalnız günlük+ (fetchOHLCVUS interval=1d). Haftalık/aylık günlükten türetilir.
      const { candles: c } = await fetchOHLCVUS(raw, 730);
      candles = c;
    } else if (tf === '1d') {
      const { candles: c } = await fetchOHLCV(raw, 1825); // ~5y
      candles = c;
    } else {
      candles = await fetchOHLCVByTimeframe(raw, tf);
    }
  } catch (e) {
    return { s: 'error', errmsg: e instanceof Error ? e.message : 'fetch hatası' };
  }

  if (!candles.length) return { s: 'no_data' };

  // Zaman filtreleme + sıralama
  const rows = candles
    .map((c) => ({ t: candleToSeconds(c.date), o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume ?? 0 }))
    .filter((r) => Number.isFinite(r.t) && r.t >= from && r.t <= to)
    .sort((a, b) => a.t - b.t);

  if (!rows.length) {
    // Aralıkta veri yok — en eski barın zamanını nextTime olarak ver (TradingView geri kaydırma)
    const earliest = Math.min(...candles.map((c) => candleToSeconds(c.date)));
    return { s: 'no_data', nextTime: Number.isFinite(earliest) ? earliest : undefined };
  }

  return {
    s: 'ok',
    t: rows.map((r) => r.t),
    o: rows.map((r) => r.o),
    h: rows.map((r) => r.h),
    l: rows.map((r) => r.l),
    c: rows.map((r) => r.c),
    v: rows.map((r) => r.v),
  };
}

export interface UdfSearchItem {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  ticker: string;
  type: string;
}

/** UDF /search — sembol arama (BIST + US evreni). */
export function udfSearch(query: string, limit = 30): UdfSearchItem[] {
  const q = (query || '').trim().toUpperCase();
  const all: { sym: string; ex: string }[] = [
    ...BIST_SYMBOLS.map((s) => ({ sym: s, ex: 'BIST' })),
    ...US_SYMBOL_LIST.map((s) => ({ sym: s.toUpperCase(), ex: 'US' })),
  ];
  const matched = q
    ? all.filter((x) => x.sym.includes(q))
    : all;
  return matched.slice(0, limit).map((x) => ({
    symbol: x.sym,
    full_name: `${x.ex}:${x.sym}`,
    description: x.sym,
    exchange: x.ex,
    ticker: x.sym,
    type: 'stock',
  }));
}
