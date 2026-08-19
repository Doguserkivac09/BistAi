/**
 * Tarayıcı sinyali değerlendirme motoru.
 *
 * Amaç: `scanner_signals` tablosundaki her sinyalin SONUCUNU ölçmek —
 * "hangi sinyal (ve hangi kombinasyon) gerçekten işe yarıyor" sorusunu
 * sayıyla cevaplayabilmek için.
 *
 * Yöntem — çift bariyer (double barrier):
 *   hedef = fiyat + yön × ATR × targetAtr
 *   stop  = fiyat − yön × ATR × stopAtr
 *   Ufuk içinde hangisine ÖNCE değdiyse sonuç odur. İkisine de değmezse
 *   "sonucsuz" — orana katılmaz (kaybeden gibi sayılması yanıltıcı olurdu).
 *
 * Bir bar içinde hem hedef hem stop görülürse KÖTÜMSER varsayım: stop.
 * (Bar içi sıralamayı bilemeyiz; iyimser saymak isabet oranını şişirir.)
 */

import { fetchOHLCVByTimeframe, type YahooTimeframe } from '@/lib/yahoo';
import type { OHLCVCandle } from '@/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Ayarlar ───────────────────────────────────────────────────────────────────
export const TARGET_ATR = 1.0;
export const STOP_ATR = 1.0;

/** Tarama periyoduna göre: Yahoo timeframe + ufuk (bar) + bar süresi (dk) */
const TF_CONFIG: Record<string, { yf: YahooTimeframe; horizon: number; minutes: number }> = {
  '15': { yf: '15m', horizon: 24, minutes: 15 },
  '30': { yf: '30m', horizon: 16, minutes: 30 },
  '60': { yf: '1h', horizon: 12, minutes: 60 },
  D: { yf: '1d', horizon: 5, minutes: 1440 },
};

const MAX_BATCH = 300;

export interface EvaluateResult {
  processed: number;
  hedef: number;
  stop: number;
  sonucsuz: number;
  bekleyen: number;
  atlanan: number;
  error?: string;
}

interface PendingRow {
  id: number;
  symbol: string;
  scan_tf: string;
  direction: number;
  price: number;
  atr: number | null;
  bar_time: string | null;
}

function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/** Mum zamanını ms'ye çevirir (günlük: "YYYY-MM-DD", intraday: saniye). */
function candleMs(c: OHLCVCandle): number {
  if (typeof c.date === 'number') return c.date * 1000;
  return Date.parse(c.date);
}

/**
 * ATR yoksa fiyatın yüzdesinden türetilen yedek ölçek.
 * Pine tarafı atr göndermezse sinyal tamamen atılmasın diye.
 */
function fallbackAtr(price: number, tf: string): number {
  const pct = tf === 'D' ? 0.025 : tf === '60' ? 0.008 : 0.005;
  return price * pct;
}

export interface SignalOutcome {
  outcome: 'hedef' | 'stop' | 'sonucsuz';
  bars_to_result: number | null;
  mfe_atr: number | null;
  mae_atr: number | null;
  return_pct: number | null;
}

/** Tek bir sinyali, sinyal barından SONRAKİ mumlarla değerlendirir. */
export function evaluateSignal(
  row: PendingRow,
  candles: OHLCVCandle[],
  horizon: number,
): SignalOutcome | null {
  const barMs = row.bar_time ? Date.parse(row.bar_time) : NaN;
  if (!Number.isFinite(barMs)) return null;

  // Sinyal barından SONRAKİ mumlar (sinyal barının kendisi dahil değil)
  const forward = candles.filter((c) => candleMs(c) > barMs).slice(0, horizon);
  if (!forward.length) return null; // henüz veri yok → bir sonraki koşuda

  const dir = row.direction >= 0 ? 1 : -1;
  const atr = row.atr && row.atr > 0 ? row.atr : fallbackAtr(row.price, row.scan_tf);
  const target = row.price + dir * atr * TARGET_ATR;
  const stop = row.price - dir * atr * STOP_ATR;

  let mfe = 0;
  let mae = 0;

  for (let i = 0; i < forward.length; i++) {
    const c = forward[i]!;
    const favor = dir === 1 ? c.high - row.price : row.price - c.low;
    const against = dir === 1 ? row.price - c.low : c.high - row.price;
    if (favor > mfe) mfe = favor;
    if (against > mae) mae = against;

    const hitTarget = dir === 1 ? c.high >= target : c.low <= target;
    const hitStop = dir === 1 ? c.low <= stop : c.high >= stop;

    // Aynı barda ikisi de görüldüyse KÖTÜMSER: stop kabul edilir.
    if (hitStop) {
      return {
        outcome: 'stop',
        bars_to_result: i + 1,
        mfe_atr: mfe / atr,
        mae_atr: mae / atr,
        return_pct: (-atr * STOP_ATR / row.price) * 100,
      };
    }
    if (hitTarget) {
      return {
        outcome: 'hedef',
        bars_to_result: i + 1,
        mfe_atr: mfe / atr,
        mae_atr: mae / atr,
        return_pct: ((atr * TARGET_ATR) / row.price) * 100,
      };
    }
  }

  // Ufuk dolmadıysa henüz karar verme
  if (forward.length < horizon) return null;

  const last = forward[forward.length - 1]!;
  return {
    outcome: 'sonucsuz',
    bars_to_result: forward.length,
    mfe_atr: mfe / atr,
    mae_atr: mae / atr,
    return_pct: ((dir * (last.close - row.price)) / row.price) * 100,
  };
}

// ─── Ana koşu ──────────────────────────────────────────────────────────────────
export async function runScannerEvaluate(): Promise<EvaluateResult> {
  const empty: EvaluateResult = { processed: 0, hedef: 0, stop: 0, sonucsuz: 0, bekleyen: 0, atlanan: 0 };

  const supabase = createAdminClient();
  if (!supabase) return { ...empty, error: 'Supabase env tanımlı değil.' };

  const { data, error } = await supabase
    .from('scanner_signals')
    .select('id, symbol, scan_tf, direction, price, atr, bar_time')
    .eq('evaluated', false)
    .not('bar_time', 'is', null)
    .order('bar_time', { ascending: true })
    .limit(MAX_BATCH);

  if (error) return { ...empty, error: error.message };
  const rows = (data ?? []) as PendingRow[];
  if (!rows.length) return empty;

  // Sembol+periyot başına TEK fetch — aynı sembolün 10 sinyali varsa
  // Yahoo'ya 10 kez gitmeyelim.
  const groups = new Map<string, PendingRow[]>();
  for (const r of rows) {
    const key = `${r.symbol}|${r.scan_tf}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const result: EvaluateResult = { ...empty };
  const updates: { id: number; patch: Record<string, unknown> }[] = [];

  for (const [key, group] of groups) {
    const [symbol, tf] = key.split('|');
    const cfg = TF_CONFIG[tf!];
    if (!cfg) {
      result.atlanan += group.length;
      continue;
    }

    let candles: OHLCVCandle[] = [];
    try {
      candles = await fetchOHLCVByTimeframe(symbol!, cfg.yf);
    } catch {
      result.atlanan += group.length;
      continue;
    }
    if (!candles.length) {
      result.atlanan += group.length;
      continue;
    }

    for (const row of group) {
      const outcome = evaluateSignal(row, candles, cfg.horizon);
      if (!outcome) {
        result.bekleyen += 1; // ufuk dolmadı, bir sonraki koşuda
        continue;
      }
      updates.push({
        id: row.id,
        patch: {
          evaluated: true,
          evaluated_at: new Date().toISOString(),
          outcome: outcome.outcome,
          bars_to_result: outcome.bars_to_result,
          mfe_atr: outcome.mfe_atr,
          mae_atr: outcome.mae_atr,
          return_pct: outcome.return_pct,
        },
      });
      result.processed += 1;
      if (outcome.outcome === 'hedef') result.hedef += 1;
      else if (outcome.outcome === 'stop') result.stop += 1;
      else result.sonucsuz += 1;
    }

    // Yahoo'yu zorlamamak için gruplar arası kısa bekleme
    await new Promise((r) => setTimeout(r, 150));
  }

  for (const u of updates) {
    await supabase.from('scanner_signals').update(u.patch).eq('id', u.id);
  }

  return result;
}
