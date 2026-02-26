/**
 * İstemci tarafında kullanılan API çağrıları.
 * Sunucu tarafında yahoo-finance2 kullanıldığı için bu modül sadece fetch ile API'ye istek atar.
 */

import type { OHLCVCandle } from '@/types';

export async function fetchOHLCVClient(
  sembol: string,
  days: number = 90
): Promise<OHLCVCandle[]> {
  const params = new URLSearchParams({
    symbol: sembol.trim(),
    days: String(days),
  });
  const res = await fetch(`/api/ohlcv?${params}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? 'Veri alınamadı.');
  }
  return data.candles ?? [];
}

export type TimeframeKey = '1H' | '1G' | '1W' | '1A' | '3A' | '1Y';

export async function fetchOHLCVByTimeframeClient(
  sembol: string,
  timeframe: TimeframeKey
): Promise<OHLCVCandle[]> {
  const params = new URLSearchParams({
    symbol: sembol.trim(),
    tf: timeframe,
  });
  const res = await fetch(`/api/ohlcv?${params}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? 'Veri alınamadı.');
  }
  return data.candles ?? [];
}
