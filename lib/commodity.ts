/**
 * Emtia ve döviz kuru verileri (Yahoo Finance).
 * BIST sembollerinden farklı olarak .IS suffix kullanmaz.
 */

import type { OHLCVCandle } from '@/types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: CommodityQuote; expiry: number }>();

export interface CommodityQuote {
  symbol: string;
  label: string;
  unit: string;        // $/oz, $/bbl, ₺, vb.
  lastPrice: number | null;
  change1d: number | null;   // % günlük değişim
  change20d: number | null;  // % 20 günlük değişim
  candles: OHLCVCandle[];
}

export const COMMODITY_LIST: Array<{ symbol: string; label: string; unit: string }> = [
  { symbol: 'GC=F',     label: 'Altın',    unit: '$/oz' },
  { symbol: 'SI=F',     label: 'Gümüş',   unit: '$/oz' },
  { symbol: 'CL=F',     label: 'Ham Petrol', unit: '$/bbl' },
  { symbol: 'USDTRY=X', label: 'USD/TRY', unit: '₺' },
  { symbol: 'EURTRY=X', label: 'EUR/TRY', unit: '₺' },
  { symbol: 'XU100.IS', label: 'BIST 100', unit: '' },
];

async function fetchYahoo(symbol: string, days: number): Promise<OHLCVCandle[]> {
  const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : '6mo';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> };
        }>;
      };
    };
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const candles: OHLCVCandle[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const close = q.close?.[i];
      if (close == null || isNaN(close)) continue;
      const date = new Date((timestamps[i]!) * 1000).toISOString().slice(0, 10);
      candles.push({
        date,
        open:   q.open?.[i]   ?? close,
        high:   q.high?.[i]   ?? close,
        low:    q.low?.[i]    ?? close,
        close,
        volume: q.volume?.[i] ?? 0,
      });
    }
    return candles;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function calcChange(candles: OHLCVCandle[], lookback: number): number | null {
  const valid = candles.filter((c) => c.close > 0);
  if (valid.length < 2) return null;
  const last  = valid[valid.length - 1]!.close;
  const base  = valid[Math.max(0, valid.length - lookback - 1)]!.close;
  if (base === 0) return null;
  return Math.round(((last - base) / base) * 10000) / 100;
}

export async function fetchAllCommodities(): Promise<CommodityQuote[]> {
  const results = await Promise.allSettled(
    COMMODITY_LIST.map(async ({ symbol, label, unit }) => {
      const cached = cache.get(symbol);
      if (cached && Date.now() < cached.expiry) return cached.data;

      const candles = await fetchYahoo(symbol, 30);
      const valid = candles.filter((c) => c.close > 0);
      const lastPrice = valid.length > 0 ? valid[valid.length - 1]!.close : null;
      const quote: CommodityQuote = {
        symbol, label, unit,
        lastPrice,
        change1d:  calcChange(candles, 1),
        change20d: calcChange(candles, 20),
        candles,
      };
      cache.set(symbol, { data: quote, expiry: Date.now() + CACHE_TTL_MS });
      return quote;
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const { symbol, label, unit } = COMMODITY_LIST[i]!;
    return { symbol, label, unit, lastPrice: null, change1d: null, change20d: null, candles: [] };
  });
}
