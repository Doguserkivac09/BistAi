/**
 * Sinyal performans değerlendirme motoru.
 * evaluate-signals ve cron/evaluate tarafından paylaşılır.
 *
 * ── 2026-07-27 YENİDEN YAPILANDIRMA (backlog darboğazı) ──────────────────
 * Eski motor kayıt-bazlı çalışıyordu: MAX_BATCH=200 satır/koşu → günde ~200
 * değerlendirme, oysa günde ~2.350 sinyal üretiliyordu (~12x dengesizlik).
 * Backlog 142.858'e ulaştı, entry tarihleri 3 ay geride takıldı, SCORING_V2
 * A/B'si güncel veri göremedi.
 *
 * Yeni motor SEMBOL-BAZLI amortize eder: bir sembol için TEK OHLCV çağrısı o
 * sembolün TÜM bekleyen kayıtlarını (tüm tarihler, 6 aylık pencere içinde)
 * değerlendirir. Böylece bir Yahoo çağrısı ~200+ satırı işler (eskiden ~2).
 *  - Zaman bütçesi (250s) dolana kadar sembol-sembol ilerler (satır tavanı yok).
 *  - DB yazımları paralel toplu (satır başına ayrı round-trip yerine 20'li grup).
 *  - Sembol imleci (cursor) monoton ilerler → sonsuz döngü yok, amortizasyon korunur.
 *  - OHLCV penceresi 6 aya (120g) genişletildi → 90-120g kayıtlar da kurtulur.
 *  - Değerlendirilemeyecek kadar eski (>150g) kayıtlar tek statement'la işaretlenir
 *    (evaluated=true, return_* null → win-rate istatistiği bunları zaten dışlar).
 *
 * Her sembol için:
 *  1. 6 aylık OHLCV çekilir (tek çağrı)
 *  2. Sembolün her bekleyen kaydı için: kanonik ufku dolduysa 3/7/14/30. takvim
 *     günü kapanışı → return_3d/7d/14d/30d + 14g MFE/MAE
 *  3. evaluated=true ile toplu güncellenir
 *
 * Return değerleri: decimal kesir (0.05 = %5). nötr yön: raw fiyat değişimi.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { fetchOHLCVUS } from '@/lib/yahoo-us';
import { getMinEvalDays } from '@/lib/signal-horizons';
import type { OHLCVCandle } from '@/types';
import type { SignalPerformanceRecord } from '@/lib/performance-types';

// ── Sabitler ─────────────────────────────────────────────────────────

/** Koşu başına zaman bütçesi (Vercel maxDuration=300, güvenli marj) */
const TIME_BUDGET_MS = 250_000;

/** OHLCV çekim penceresi — 6mo. Entry+ufuk bu pencerede olmalı. */
const OHLCV_WINDOW_DAYS = 120;

/** Supabase tek sorgu satır tavanı */
const PAGE_SIZE = 1000;

/** Paralel DB update grubu (round-trip'leri sıkıştırır) */
const UPDATE_CONCURRENCY = 20;

/** Değerlendirme için gerekli min takvim günü (en kısa canonical horizon) */
const MIN_AGE_DAYS = 3;

/** Bu yaştan eski + hâlâ pending → OHLCV penceresi ulaşamaz, işaretlenip havuzdan çıkar */
const DEAD_AGE_DAYS = 150;

/** Semboller arası bekleme (Yahoo rate limit) */
const SYMBOL_DELAY_MS = 200;

// ── Admin Client ──────────────────────────────────────────────────────

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase env değişkenleri eksik.');
  return createClient(url, serviceKey);
}

function daysAgoIso(now: Date, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ── Hesaplama Yardımcıları (saf — değişmedi) ──────────────────────────

function daysBetween(startIso: string, end: Date): number {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

/** Entry'den N takvim günü sonrasındaki ilk mum kapanışı (entry mumu hariç). */
function closeAfterDays(candles: OHLCVCandle[], entryDate: Date, days: number): number | null {
  const target = new Date(entryDate);
  target.setDate(target.getDate() + days);
  const found = candles
    .filter((c) => c?.date != null && new Date(c.date as string) > entryDate)
    .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
    .find((c) => new Date(c.date as string) >= target);
  return found?.close != null && Number.isFinite(found.close) ? found.close : null;
}

/** Return — direction'a göre yön düzeltmeli (asagi: fiyat düşüşü = pozitif). */
function calcReturn(entryPrice: number, exitPrice: number | null, direction: string): number | null {
  if (exitPrice == null || entryPrice <= 0 || !Number.isFinite(exitPrice)) return null;
  const raw = (exitPrice - entryPrice) / entryPrice;
  if (!Number.isFinite(raw)) return null;
  return direction === 'asagi' ? -raw : raw;
}

/** MFE / MAE — 14 takvim günlük pencerede. */
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
    mfe = (entryPrice - minLow)  / entryPrice;
    mae = (entryPrice - maxHigh) / entryPrice;
  } else {
    mfe = (maxHigh - entryPrice) / entryPrice;
    mae = (minLow  - entryPrice) / entryPrice;
  }
  return {
    mfe: Number.isFinite(mfe) ? mfe : null,
    mae: Number.isFinite(mae) ? mae : null,
  };
}

// ── Tek kayıt değerlendirme ───────────────────────────────────────────

type EvalRecord = Pick<
  SignalPerformanceRecord,
  'id' | 'sembol' | 'signal_type' | 'direction' | 'entry_price' | 'entry_time'
> & { market?: string | null };

type UpdatePayload = {
  id: string;
  return_3d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d: number | null;
  mfe: number | null;
  mae: number | null;
  evaluated: true;
};

/** Kaydı değerlendirir; ufku dolmadıysa/veri yoksa null döner (pending kalır). */
function evaluateRecord(rec: EvalRecord, candles: OHLCVCandle[], now: Date): UpdatePayload | null {
  const entryDate = new Date(rec.entry_time);
  if (Number.isNaN(entryDate.getTime())) return null;

  const entryPrice = Number(rec.entry_price);
  if (entryPrice <= 0 || !Number.isFinite(entryPrice)) return null;

  const direction = rec.direction ?? 'yukari';

  // Kanonik ufuk dolmadıysa değerlendirme — return alanı kalıcı null olmasın
  const minDays = getMinEvalDays(rec.signal_type ?? '');
  if (daysBetween(rec.entry_time, now) < minDays) return null;

  const price3d  = closeAfterDays(candles, entryDate, 3);
  if (price3d == null) return null; // pencere entry'ye ulaşamıyor → başka koşuya bırak

  const price7d  = closeAfterDays(candles, entryDate, 7);
  const price14d = closeAfterDays(candles, entryDate, 14);
  const price30d = closeAfterDays(candles, entryDate, 30);
  const { mfe, mae } = computeMfeMae(candles, entryDate, entryPrice, direction);

  return {
    id: rec.id,
    return_3d:  calcReturn(entryPrice, price3d,  direction),
    return_7d:  calcReturn(entryPrice, price7d,  direction),
    return_14d: calcReturn(entryPrice, price14d, direction),
    return_30d: calcReturn(entryPrice, price30d, direction),
    mfe,
    mae,
    evaluated: true,
  };
}

// ── Ana Fonksiyon ─────────────────────────────────────────────────────

export async function runEvaluateEngine(): Promise<{
  updated: number;
  remaining?: number;
  deadMarked?: number;
  symbolsProcessed?: number;
  durationMs?: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    const supabase = createAdminClient();
    const now = new Date();
    const cutoffAge  = daysAgoIso(now, MIN_AGE_DAYS);   // en az bu kadar yaşlı
    const cutoffDead = daysAgoIso(now, DEAD_AGE_DAYS);  // bundan eskisi ölü

    // 0) Ölü kayıtları havuzdan çıkar (tek statement) — win-rate zaten null return'ü dışlar
    let deadMarked = 0;
    {
      const { count, error } = await supabase
        .from('signal_performance')
        .update({ evaluated: true }, { count: 'exact' })
        .eq('evaluated', false)
        .lt('entry_time', cutoffDead);
      if (error) console.error('[evaluate-engine] Ölü işaretleme hatası:', error.message);
      else deadMarked = count ?? 0;
    }

    // 1) Sembol imleciyle ilerle — her sembol için tek OHLCV, tüm kayıtları değerlendir
    let updatedCount = 0;
    let symbolsProcessed = 0;
    let cursor = ''; // en son TAM işlenen sembol (monoton ilerler)

    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data, error } = await supabase
        .from('signal_performance')
        .select('id, sembol, market, signal_type, direction, entry_price, entry_time')
        .eq('evaluated', false)
        .lte('entry_time', cutoffAge)
        .gte('entry_time', cutoffDead)
        .gt('sembol', cursor)
        .order('sembol', { ascending: true })
        .order('entry_time', { ascending: true })
        .limit(PAGE_SIZE);

      if (error) return { updated: updatedCount, error: `signal_performance okunamadı: ${error.message}`, durationMs: Date.now() - started };

      const rows = (data as EvalRecord[] | null) ?? [];
      if (rows.length === 0) break; // tüm evren tarandı

      // Sembole göre grupla (market:sembol) — sıra korunur
      const groups = new Map<string, EvalRecord[]>();
      const sembolOrder: string[] = [];
      for (const r of rows) {
        if (!r?.sembol || !r.entry_time || r.entry_price == null) continue;
        const market = (r.market ?? 'BIST').toUpperCase();
        const key = `${market}:${r.sembol}`;
        if (!groups.has(key)) { groups.set(key, []); }
        groups.get(key)!.push(r);
        if (!sembolOrder.includes(r.sembol)) sembolOrder.push(r.sembol);
      }

      const pageFull = rows.length === PAGE_SIZE;
      // Sayfa doluysa SON sembol yarım kalmış olabilir → onu bu sayfada işleme,
      // imleci bir öncekine al (sonraki sayfa o sembolü baştan getirir). Tek sembol
      // sayfayı doldurduysa (nadir, >1000 pending) yine de işle, kuyruğu sonraki koşuya bırak.
      const lastSembol = sembolOrder[sembolOrder.length - 1];
      const skipLast = pageFull && sembolOrder.length > 1;
      const nextCursor = skipLast
        ? sembolOrder[sembolOrder.length - 2]! // son TAM işlenen
        : lastSembol!;

      for (const [key, recs] of groups) {
        if (Date.now() - started >= TIME_BUDGET_MS) break;
        const [market, sembol] = key.split(':');
        if (skipLast && sembol === lastSembol) continue; // yarım sembolü atla

        let candles: OHLCVCandle[] = [];
        try {
          const result = market === 'US'
            ? await fetchOHLCVUS(sembol!.trim(), OHLCV_WINDOW_DAYS)
            : await fetchOHLCV(sembol!.trim(), OHLCV_WINDOW_DAYS);
          candles = result.candles as OHLCVCandle[];
        } catch (err) {
          console.error(`[evaluate-engine] ${key} OHLCV hatası:`, err instanceof Error ? err.message : err);
          continue;
        }
        symbolsProcessed++;
        if (candles.length === 0) continue;

        // Değerlendirilebilenleri topla
        const payloads: UpdatePayload[] = [];
        for (const rec of recs) {
          const p = evaluateRecord(rec, candles, now);
          if (p) payloads.push(p);
        }

        // Paralel toplu güncelle
        for (let i = 0; i < payloads.length; i += UPDATE_CONCURRENCY) {
          const chunk = payloads.slice(i, i + UPDATE_CONCURRENCY);
          const results = await Promise.all(
            chunk.map((p) => {
              const { id, ...fields } = p;
              return supabase.from('signal_performance').update(fields).eq('id', id);
            })
          );
          for (const r of results) {
            if (r.error) console.error('[evaluate-engine] Update hatası:', r.error.message);
            else updatedCount++;
          }
        }

        await new Promise((r) => setTimeout(r, SYMBOL_DELAY_MS));
      }

      cursor = nextCursor;
      if (!cursor) break; // güvenlik
    }

    // 2) Kalan canlı backlog (görünürlük)
    let remaining: number | undefined;
    {
      const { count } = await supabase
        .from('signal_performance')
        .select('id', { count: 'exact', head: true })
        .eq('evaluated', false)
        .lte('entry_time', cutoffAge)
        .gte('entry_time', cutoffDead);
      remaining = count ?? undefined;
    }

    const durationMs = Date.now() - started;
    console.log(`[evaluate-engine] ${updatedCount} güncellendi, ${symbolsProcessed} sembol, ${deadMarked} ölü işaretlendi, backlog: ${remaining ?? '?'}, ${(durationMs / 1000).toFixed(0)}s.`);
    return { updated: updatedCount, remaining, deadMarked, symbolsProcessed, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[evaluate-engine] Kritik hata:', message);
    return { updated: 0, error: message, durationMs: Date.now() - started };
  }
}
