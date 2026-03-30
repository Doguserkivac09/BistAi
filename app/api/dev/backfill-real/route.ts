/**
 * Gerçek tarihsel veri ile backtest tablosunu doldurur.
 *
 * Sentetik veri yerine GERÇEK BIST fiyat hareketlerini kullanır:
 * 1. Her TOP30 sembolü için 252 günlük OHLCV çeker
 * 2. Tarihin farklı noktalarında (her 5 günde bir) detectAllSignals çalıştırır
 * 3. O noktada tespit edilen sinyaller için 3d/7d/14d getirileri GERÇEK veriden hesaplar
 * 4. Sonuçları evaluated=true olarak signal_performance tablosuna ekler
 *
 * POST /api/dev/backfill-real
 * Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals } from '@/lib/signals';
import { getMarketRegime } from '@/lib/regime-engine';
import { BIST_SYMBOLS } from '@/types';
import type { OHLCVCandle } from '@/types';

const CRON_SECRET = process.env.CRON_SECRET;

function isAllowed(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production') return true;
  const auth = req.headers.get('authorization') ?? '';
  return CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
}

// Tüm BIST sembolleri — types/index.ts'ten
const ALL_SYMBOLS = [...BIST_SYMBOLS];

/** N gün sonraki kapanış fiyatını bul */
function getPriceAfterDays(candles: OHLCVCandle[], fromIdx: number, days: number): number | null {
  const fromDate = new Date(candles[fromIdx]!.date);
  fromDate.setDate(fromDate.getDate() + days);
  const found = candles.slice(fromIdx + 1).find(c => new Date(c.date) >= fromDate);
  return found?.close ?? null;
}

/** Return hesapla — evaluate-engine convention: decimal kesir (0.05 = %5) */
function calcReturn(entry: number, exit: number | null, direction: string): number | null {
  if (exit === null || entry <= 0) return null;
  const raw = direction === 'yukari'
    ? (exit - entry) / entry
    : (entry - exit) / entry;
  return Math.round(raw * 10000) / 10000;
}

export async function POST(request: NextRequest) {
  if (!isAllowed(request)) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env eksik.' }, { status: 500 });
  }

  // Batch parametresi — her batch 3 sembol işler (Vercel 10s timeout için)
  // 164 sembol ÷ 3 = 55 batch (index 0-54)
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* yok */ }
  const maxBatch = Math.ceil(ALL_SYMBOLS.length / 3) - 1;
  const batchIndex = typeof body.batchIndex === 'number'
    ? Math.max(0, Math.min(maxBatch, Math.floor(body.batchIndex)))
    : 0;
  const BATCH_SIZE = 3;
  const symbolsToProcess = ALL_SYMBOLS.slice(
    batchIndex * BATCH_SIZE,
    (batchIndex + 1) * BATCH_SIZE
  );

  const supabase = createClient(supabaseUrl, serviceKey);
  let totalInserted = 0;
  let totalProcessed = 0;
  const errors: string[] = [];

  // XU100 rejimine bak — 700 gün çekiyoruz ki 252 gün önceki snapshot'ta
  // da en az 448 mum kalsın (getMarketRegime için 200 mum gerekli)
  let xu100Candles: OHLCVCandle[] = [];
  try {
    const res = await fetchOHLCV('^XU100', 700);
    xu100Candles = res.candles;
  } catch { /* devam */ }

  for (const sembol of symbolsToProcess) {
    try {
      const { candles } = await fetchOHLCV(sembol, 252);
      if (candles.length < 60) continue;

      const rows: Record<string, unknown>[] = [];

      // Her 5 günde bir sinyal tespiti yap (geriye doğru 90 gün)
      const startIdx = Math.max(50, candles.length - 252);
      for (let i = startIdx; i < candles.length - 15; i += 5) {
        const snapshot = candles.slice(0, i + 1);
        const signals = detectAllSignals(sembol, snapshot);
        if (signals.length === 0) continue;

        const lastCandle = snapshot[snapshot.length - 1]!;
        // BT2: Gerçekçi giriş — sinyali o günün kapanışında görürüz,
        // işleme ertesi güne açılışta gireriz. lastCandle.close yerine
        // bir sonraki mumun open fiyatını kullan.
        const nextCandle = candles[i + 1];
        const entryPrice = nextCandle?.open ?? lastCandle.close;
        const entryDate  = nextCandle?.date ?? lastCandle.date;

        // Rejim hesapla
        const xu100Snap = xu100Candles.length > 0
          ? xu100Candles.filter(c => c.date <= entryDate)
          : [];
        const regime = xu100Snap.length > 20 ? getMarketRegime(xu100Snap) : 'sideways';

        for (const sig of signals) {
          // Sadece yukarı/aşağı yönlü sinyaller
          if (sig.direction !== 'yukari' && sig.direction !== 'asagi') continue;

          const ret3d  = calcReturn(entryPrice, getPriceAfterDays(candles, i, 3),  sig.direction);
          const ret7d  = calcReturn(entryPrice, getPriceAfterDays(candles, i, 7),  sig.direction);
          const ret14d = calcReturn(entryPrice, getPriceAfterDays(candles, i, 14), sig.direction);

          // 14 günlük veri yoksa atla
          if (ret14d === null) continue;

          // MFE / MAE — 14 gün içindeki en iyi/kötü nokta
          // MFE/MAE — decimal kesir (0.05 = %5), evaluate-engine convention
          const futureCandles = candles.slice(i + 1, i + 15);
          let mfe = 0, mae = 0;
          for (const fc of futureCandles) {
            const up   = (fc.high - entryPrice) / entryPrice;
            const down = (fc.low  - entryPrice) / entryPrice;
            if (sig.direction === 'yukari') {
              mfe = Math.max(mfe, up);
              mae = Math.min(mae, down);
            } else {
              mfe = Math.max(mfe, -down);
              mae = Math.min(mae, -up);
            }
          }

          rows.push({
            user_id:     null,
            sembol,
            signal_type: sig.type,
            direction:   sig.direction,
            entry_price: Math.round(entryPrice * 100) / 100,
            entry_time:  entryDate,
            return_3d:   ret3d,
            return_7d:   ret7d,
            return_14d:  ret14d,
            mfe:  Math.round(mfe * 100) / 100,
            mae:  Math.round(mae * 100) / 100,
            evaluated:   true,
            regime,
          });
        }
      }

      if (rows.length === 0) continue;
      totalProcessed += rows.length;

      // Upsert — çakışan kayıtları atla, yeni olanları ekle
      const { data, error } = await supabase
        .from('signal_performance')
        .upsert(rows, { onConflict: 'sembol,signal_type,entry_time', ignoreDuplicates: true })
        .select('id');

      if (error) {
        errors.push(`${sembol}: ${error.message}`);
      } else {
        totalInserted += data?.length ?? 0;
      }

      // Yahoo rate limit için kısa bekle
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      errors.push(`${sembol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    batchIndex,
    symbols: symbolsToProcess,
    processed: totalProcessed,
    inserted: totalInserted,
    skipped: totalProcessed - totalInserted,
    errors: errors.slice(0, 10),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    xu100CandleCount: xu100Candles.length,
    message: `Batch ${batchIndex}: ${symbolsToProcess.join(',')} — ${totalInserted} kayıt eklendi.`,
  });
}
