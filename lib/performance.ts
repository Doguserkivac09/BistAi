import { createClient } from '@/lib/supabase';
import type { StockSignal, OHLCVCandle } from '@/types';
import type { MarketRegime } from '@/lib/regime-engine';

// TODO: [Doğuş 1.2] Bu fonksiyon tamamen server API'ye taşınacak.
// Client-side'dan Yahoo fetch → CORS hatası, Supabase upsert → RLS 403.
// Geçici olarak regime 'sideways' hardcode ediliyor, server API hazır olduğunda
// saveSignalPerformanceClient() ile değiştirilecek.

interface SaveSignalPerformanceParams {
  userId: string | null;
  signal: StockSignal;
  candles: OHLCVCandle[];
}

export async function saveSignalPerformance(
  params: SaveSignalPerformanceParams
): Promise<void> {
  const { userId, signal, candles } = params;

  if (candles.length === 0) return;

  const last = candles[candles.length - 1];
  if (!last) return;

  const entryTime = last.date;

  // Regime tespiti server'a taşınana kadar default 'sideways'
  // Client-side'dan Yahoo fetch CORS hatası veriyor
  const regime: MarketRegime = 'sideways';

  const payload = {
    user_id: userId,
    sembol: signal.sembol,
    signal_type: signal.type,
    direction: signal.direction,
    entry_price: last.close,
    entry_time: entryTime,
    evaluated: false,
    regime,
  };

  try {
    const supabase = createClient();

    await supabase
      .from('signal_performance')
      .upsert(payload, {
        onConflict: 'sembol,signal_type,entry_time',
        ignoreDuplicates: true,
      });
  } catch {
    // RLS 403 bekleniyor — Doğuş 1.2 server API ile çözülecek
  }
}