/**
 * Sinyal performans değerlendirme motoru.
 * evaluate-signals ve cron/evaluate tarafından paylaşılır.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import type { OHLCVCandle } from '@/types';
import type { SignalPerformanceRecord } from '@/lib/performance-types';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase env değişkenleri eksik.');
  return createClient(url, serviceKey);
}

function daysBetween(startIso: string, end: Date): number {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

type Direction = 'yukari' | 'asagi';

function closeReturnOnOrAfter(
  entryPrice: number,
  afterEntry: OHLCVCandle[],
  entryDate: Date,
  days: number,
  direction: Direction
): number | null {
  if (entryPrice <= 0 || !Number.isFinite(entryPrice) || afterEntry.length === 0) return null;
  const target = new Date(entryDate);
  target.setDate(target.getDate() + days);
  const candidates = afterEntry
    .filter((c) => c?.date != null && new Date(c.date) >= target)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const close = candidates[0]?.close;
  if (close == null || !Number.isFinite(close)) return null;
  const ret = direction === 'yukari'
    ? (close - entryPrice) / entryPrice
    : (entryPrice - close) / entryPrice;
  return Number.isFinite(ret) ? ret : null;
}

function computeReturns(
  entryPrice: number,
  afterEntry: OHLCVCandle[],
  entryDateIso: string,
  direction: Direction
) {
  const entryDate = new Date(entryDateIso);
  if (Number.isNaN(entryDate.getTime())) return { return_3d: null, return_7d: null, return_14d: null };
  return {
    return_3d:  closeReturnOnOrAfter(entryPrice, afterEntry, entryDate, 3,  direction),
    return_7d:  closeReturnOnOrAfter(entryPrice, afterEntry, entryDate, 7,  direction),
    return_14d: closeReturnOnOrAfter(entryPrice, afterEntry, entryDate, 14, direction),
  };
}

function computeMfeMae(entryPrice: number, afterEntry: OHLCVCandle[], direction: Direction) {
  if (entryPrice <= 0 || !Number.isFinite(entryPrice) || afterEntry.length === 0) return { mfe: null, mae: null };
  let mfe: number | null = null;
  let mae: number | null = null;
  for (const c of afterEntry) {
    if (c?.high == null || c?.low == null || !Number.isFinite(c.high) || !Number.isFinite(c.low)) continue;
    const favorable = direction === 'yukari' ? (c.high - entryPrice) / entryPrice : (entryPrice - c.low) / entryPrice;
    const adverse   = direction === 'yukari' ? (c.low  - entryPrice) / entryPrice : (entryPrice - c.high) / entryPrice;
    if (Number.isFinite(favorable) && (mfe === null || favorable > mfe)) mfe = favorable;
    if (Number.isFinite(adverse)   && (mae === null || adverse   < mae)) mae = adverse;
  }
  return { mfe, mae };
}

/**
 * Değerlendirilmemiş sinyal kayıtlarını işle.
 * @returns Güncellenen kayıt sayısı
 */
export async function runEvaluateEngine(): Promise<{ updated: number; error?: string }> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('signal_performance')
      .select('*')
      .eq('evaluated', false)
      .limit(200);

    if (error) return { updated: 0, error: `signal_performance okunamadı: ${error.message}` };

    const records = (data as SignalPerformanceRecord[] | null) ?? [];
    if (records.length === 0) return { updated: 0 };

    const now = new Date();
    let updatedCount = 0;

    for (const rec of records) {
      if (!rec?.id || !rec.sembol || typeof rec.sembol !== 'string' || !rec.entry_time || !rec.entry_price || !Number.isFinite(Number(rec.entry_price))) continue;
      const direction = rec.direction;
      if (direction !== 'yukari' && direction !== 'asagi') continue;

      const ageDays = daysBetween(String(rec.entry_time), now);
      if (ageDays < 3) continue; // Henüz veri yok

      try {
        const { candles } = await fetchOHLCV(rec.sembol.trim(), 120);
        if (candles.length === 0) continue;

        const entryTime = new Date(rec.entry_time);
        if (Number.isNaN(entryTime.getTime())) continue;

        const afterEntry = candles.filter((c) => c?.date != null && new Date(c.date) >= entryTime);
        if (afterEntry.length === 0) continue;

        const entryPrice = Number(rec.entry_price);
        if (entryPrice <= 0 || !Number.isFinite(entryPrice)) continue;

        const returns = computeReturns(entryPrice, afterEntry, String(rec.entry_time), direction);
        const { mfe, mae } = computeMfeMae(entryPrice, afterEntry, direction);
        const isFullyEvaluated = ageDays >= 14;

        const { error: updateError } = await supabase
          .from('signal_performance')
          .update({ return_3d: returns.return_3d, return_7d: returns.return_7d, return_14d: returns.return_14d, mfe, mae, evaluated: isFullyEvaluated })
          .eq('id', rec.id);

        if (!updateError) updatedCount++;
      } catch (err) {
        console.error(`[evaluate-engine] ${rec.sembol} hatası:`, err instanceof Error ? err.message : err);
      }
    }

    return { updated: updatedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return { updated: 0, error: message };
  }
}
