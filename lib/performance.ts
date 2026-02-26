import { createClient } from '@/lib/supabase';
import type { StockSignal, OHLCVCandle } from '@/types';
import { fetchOHLCV } from '@/lib/yahoo';
import { getMarketRegime } from '@/lib/regime-engine';
import type { MarketRegime } from '@/lib/regime-engine';

const MARKET_INDEX_SYMBOL = '^XU100';
const MARKET_CANDLES_DAYS = 250;

interface SaveSignalPerformanceParams {
  userId: string | null;
  signal: StockSignal;
  candles: OHLCVCandle[];
}

function regimeAtEntry(entryDate: string, marketCandles: OHLCVCandle[]): MarketRegime {
  const upToEntry = marketCandles.filter((c) => c.date <= entryDate);
  return getMarketRegime(upToEntry);
}

export async function saveSignalPerformance(
  params: SaveSignalPerformanceParams
): Promise<void> {
  const { userId, signal, candles } = params;

  if (candles.length === 0) return;

  const last = candles[candles.length - 1];
  if (!last) return;

  const entryTime = last.date;

  let regime: MarketRegime = 'sideways';
  try {
    const marketCandles = await fetchOHLCV(MARKET_INDEX_SYMBOL, MARKET_CANDLES_DAYS);
    if (Array.isArray(marketCandles) && marketCandles.length > 0) {
      regime = regimeAtEntry(entryTime, marketCandles);
    }
  } catch {
    regime = 'sideways';
  }

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
  } catch (error) {
    if (error instanceof Error) {
      console.error('signal_performance upsert failed:', error.message);
    }
  }
  console.log('SAVE SIGNAL CALLED', signal.sembol);
}