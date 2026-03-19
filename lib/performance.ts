import type { StockSignal, OHLCVCandle } from '@/types';

interface SaveSignalPerformanceParams {
  userId: string | null;
  signal: StockSignal;
  candles: OHLCVCandle[];
}

/**
 * Sinyal performansını server API üzerinden kaydeder.
 * Regime tespiti server-side yapılır (XU100 EMA50/EMA200).
 */
export async function saveSignalPerformance(
  params: SaveSignalPerformanceParams
): Promise<void> {
  const { userId, signal, candles } = params;

  if (candles.length === 0) return;

  const last = candles[candles.length - 1];
  if (!last) return;

  try {
    const res = await fetch('/api/signal-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        sembol: signal.sembol,
        signal_type: signal.type,
        direction: signal.direction,
        entry_price: last.close,
        entry_time: last.date,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[performance] Kayıt hatası:', data.error ?? res.statusText);
    }
  } catch (err) {
    console.error('[performance] Ağ hatası:', err);
  }
}
