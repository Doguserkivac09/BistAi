/**
 * Sinyal performans değerlendirme motoru.
 * evaluate-signals ve cron/evaluate tarafından paylaşılır.
 *
 * Her çalışmada:
 *  1. evaluated=false ve en az 14 takvim günü önce oluşturulan sinyalleri çeker
 *  2. Sembollere göre gruplar — her sembol için tek OHLCV çağrısı (rate limit koruması)
 *  3. Entry sonrası 3., 7., 14. takvim günündeki ilk kapanış → return_3d/7d/14d
 *  4. Entry sonrası ilk 14 gündeki max-high / min-low → MFE / MAE
 *  5. evaluated=true ile günceller
 *
 * Return değerleri: decimal kesir (0.05 = %5, -0.03 = %-3)
 * nötr yönlü sinyaller: raw fiyat değişimi (yükselen = pozitif)
 */

import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import type { OHLCVCandle } from '@/types';
import type { SignalPerformanceRecord } from '@/lib/performance-types';

// ── Sabitler ─────────────────────────────────────────────────────────

/** Her cron çalışmasında işlenecek max kayıt (timeout koruması) */
const MAX_BATCH = 200;

/** Değerlendirme için gerekli min takvim günü */
const MIN_AGE_DAYS = 5;

/** Semboller arası bekleme süresi (Yahoo rate limit) */
const SYMBOL_DELAY_MS = 300;

// ── Admin Client ──────────────────────────────────────────────────────

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase env değişkenleri eksik.');
  return createClient(url, serviceKey);
}

// ── Hesaplama Yardımcıları ────────────────────────────────────────────

function daysBetween(startIso: string, end: Date): number {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Entry'den N takvim günü sonrasındaki ilk mum kapanışını bulur.
 * Entry mumunu HARİÇ tutar (>) — sonraki mumlardan başlar.
 */
function closeAfterDays(
  candles: OHLCVCandle[],
  entryDate: Date,
  days: number
): number | null {
  const target = new Date(entryDate);
  target.setDate(target.getDate() + days);
  const found = candles
    .filter((c) => c?.date != null && new Date(c.date as string) > entryDate)
    .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
    .find((c) => new Date(c.date as string) >= target);
  return found?.close != null && Number.isFinite(found.close) ? found.close : null;
}

/**
 * Return hesaplar — direction'a göre yön düzeltmesi yapar:
 * - yukari: pozitif = sinyal tuttu (fiyat yükseldi)
 * - asagi:  pozitif = sinyal tuttu (fiyat düştü)
 * - nötr:   raw değişim (yükselen = pozitif)
 */
function calcReturn(entryPrice: number, exitPrice: number | null, direction: string): number | null {
  if (exitPrice == null || entryPrice <= 0 || !Number.isFinite(exitPrice)) return null;
  const raw = (exitPrice - entryPrice) / entryPrice;
  if (!Number.isFinite(raw)) return null;
  return direction === 'asagi' ? -raw : raw;
}

/**
 * MFE / MAE hesaplar — 14 takvim günlük pencerede.
 * direction=yukari: MFE = en yüksek high, MAE = en düşük low
 * direction=asagi:  MFE = en düşük low (ters), MAE = en yüksek high (ters)
 * direction=nötr:   raw (yükselen MFE, düşen MAE)
 */
function computeMfeMae(
  candles: OHLCVCandle[],
  entryDate: Date,
  entryPrice: number,
  direction: string
): { mfe: number | null; mae: number | null } {
  if (entryPrice <= 0 || !Number.isFinite(entryPrice)) return { mfe: null, mae: null };

  const windowEnd = new Date(entryDate);
  windowEnd.setDate(windowEnd.getDate() + 14);

  const window = candles.filter((c) => {
    if (c?.date == null) return false;
    const d = new Date(c.date as string);
    return d > entryDate && d <= windowEnd;
  });

  if (window.length === 0) return { mfe: null, mae: null };

  const maxHigh = Math.max(...window.map((c) => c.high).filter(Number.isFinite));
  const minLow  = Math.min(...window.map((c) => c.low).filter(Number.isFinite));

  if (!Number.isFinite(maxHigh) || !Number.isFinite(minLow)) return { mfe: null, mae: null };

  let mfe: number;
  let mae: number;

  if (direction === 'asagi') {
    mfe = (entryPrice - minLow)  / entryPrice; // fiyat düşünce kazanç
    mae = (entryPrice - maxHigh) / entryPrice; // fiyat yükselince kayıp (negatif)
  } else {
    mfe = (maxHigh - entryPrice) / entryPrice; // fiyat yükselince kazanç
    mae = (minLow  - entryPrice) / entryPrice; // fiyat düşünce kayıp (negatif)
  }

  return {
    mfe: Number.isFinite(mfe) ? mfe : null,
    mae: Number.isFinite(mae) ? mae : null,
  };
}

// ── Ana Fonksiyon ─────────────────────────────────────────────────────

/**
 * Değerlendirilmemiş sinyal kayıtlarını işle.
 */
export async function runEvaluateEngine(): Promise<{ updated: number; error?: string }> {
  try {
    const supabase = createAdminClient();
    const now = new Date();

    // MIN_AGE_DAYS önce veya daha eski sinyalleri çek
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - MIN_AGE_DAYS);

    const { data, error } = await supabase
      .from('signal_performance')
      .select('id, sembol, direction, entry_price, entry_time')
      .eq('evaluated', false)
      .lte('entry_time', cutoff.toISOString())
      .order('entry_time', { ascending: true })
      .limit(MAX_BATCH);

    if (error) return { updated: 0, error: `signal_performance okunamadı: ${error.message}` };

    const records = (data as Pick<SignalPerformanceRecord, 'id' | 'sembol' | 'direction' | 'entry_price' | 'entry_time'>[] | null) ?? [];
    if (records.length === 0) return { updated: 0 };

    // Sembole göre grupla — her sembol için tek OHLCV çağrısı
    const bySymbol = new Map<string, typeof records>();
    for (const r of records) {
      if (!r?.sembol || !r.entry_time || !r.entry_price) continue;
      if (!bySymbol.has(r.sembol)) bySymbol.set(r.sembol, []);
      bySymbol.get(r.sembol)!.push(r);
    }

    let updatedCount = 0;
    let symbolIdx = 0;

    for (const [sembol, symbolRecords] of bySymbol) {
      // Semboller arası gecikme (Yahoo rate limit)
      if (symbolIdx > 0) {
        await new Promise((r) => setTimeout(r, SYMBOL_DELAY_MS));
      }
      symbolIdx++;

      let candles: OHLCVCandle[] = [];
      try {
        const result = await fetchOHLCV(sembol.trim(), 60);
        candles = result.candles as OHLCVCandle[];
      } catch (err) {
        console.error(`[evaluate-engine] ${sembol} OHLCV hatası:`, err instanceof Error ? err.message : err);
        continue;
      }

      if (candles.length === 0) continue;

      for (const rec of symbolRecords) {
        try {
          const entryDate = new Date(rec.entry_time);
          if (Number.isNaN(entryDate.getTime())) continue;

          const entryPrice = Number(rec.entry_price);
          if (entryPrice <= 0 || !Number.isFinite(entryPrice)) continue;

          const direction = rec.direction ?? 'yukari';

          // 3, 7, 14 takvim günü sonraki kapanışlar
          const price3d  = closeAfterDays(candles, entryDate, 3);
          const price7d  = closeAfterDays(candles, entryDate, 7);
          const price14d = closeAfterDays(candles, entryDate, 14);

          // Henüz 14 günlük fiyat yoksa atla (çok erken)
          if (price14d == null) continue;

          const return_3d  = calcReturn(entryPrice, price3d,  direction);
          const return_7d  = calcReturn(entryPrice, price7d,  direction);
          const return_14d = calcReturn(entryPrice, price14d, direction);

          const { mfe, mae } = computeMfeMae(candles, entryDate, entryPrice, direction);

          const { error: updateError } = await supabase
            .from('signal_performance')
            .update({ return_3d, return_7d, return_14d, mfe, mae, evaluated: true })
            .eq('id', rec.id);

          if (updateError) {
            console.error(`[evaluate-engine] Update hatası (${rec.id}):`, updateError.message);
          } else {
            updatedCount++;
          }
        } catch (err) {
          console.error(`[evaluate-engine] Kayıt hatası (${rec.id}):`, err instanceof Error ? err.message : err);
        }
      }
    }

    console.log(`[evaluate-engine] Tamamlandı: ${updatedCount} kayıt güncellendi.`);
    return { updated: updatedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[evaluate-engine] Kritik hata:', message);
    return { updated: 0, error: message };
  }
}
