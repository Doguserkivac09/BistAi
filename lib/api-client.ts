/**
 * İstemci tarafında kullanılan API çağrıları.
 * Sunucu tarafında yahoo-finance2 kullanıldığı için bu modül sadece fetch ile API'ye istek atar.
 */

import type { OHLCVCandle } from '@/types';
import type { MacroSnapshot, MacroDataRow, RiskScore } from '@/types/macro';

export async function fetchOHLCVClient(
  sembol: string,
  days: number = 90
): Promise<OHLCVCandle[]> {
  const params = new URLSearchParams({
    symbol: sembol.trim(),
    days: String(days),
  });

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`/api/ohlcv?${params}`);

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After') || '3');
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? 'Veri alınamadı.');
    }
    return data.candles ?? [];
  }
  return [];
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

// --- Macro API ---

export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const res = await fetch('/api/macro');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Makro verisi alınamadı.');
  return data;
}

export async function fetchMacroHistory(
  days: number = 30
): Promise<MacroDataRow[]> {
  const res = await fetch(`/api/macro?history=${days}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Makro geçmişi alınamadı.');
  return data.history ?? [];
}

// --- Risk API ---

export async function fetchRiskScore(): Promise<RiskScore> {
  const res = await fetch('/api/risk');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Risk skoru alınamadı.');
  return data;
}
