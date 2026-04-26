/**
 * Tüm BIST hisselerini server-side tarar, sonuçları scan_cache tablosuna kaydeder.
 * Tarama sayfası buradan anında yükler (<1sn).
 *
 * GET /api/cron/scan-cache
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Vercel Cron: Her iş günü sabah 07:30 TRT (UTC+3 → UTC 04:30)
 * Schedule: "30 4 * * 1-5"
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals, computeConfluence } from '@/lib/signals';
import { getMarketRegime } from '@/lib/regime-engine';
import { getSectorId } from '@/lib/sectors';
import { BIST_SYMBOLS } from '@/types';
import type { OHLCVCandle } from '@/types';

/** RSI(14) — son değeri döndürür */
function calcLastRSI(candles: OHLCVCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const closes = candles.map((c) => c.close);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(0, d))  / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

const CRON_SECRET  = process.env.CRON_SECRET;
const BATCH_SIZE   = 10;
const BATCH_DELAY  = 250; // ms — Yahoo rate limit

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const isManualAuth = CRON_SECRET && token === CRON_SECRET;

  if (!isVercelCron && !isManualAuth) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const startedAt = Date.now();
  const symbols = [...BIST_SYMBOLS];

  // Piyasa rejimini bir kez çek
  let regime = 'sideways';
  try {
    const { candles: xu100 } = await fetchOHLCV('XU100', 365);
    regime = getMarketRegime(xu100);
  } catch { /* başarısız olursa sideways */ }

  let scanned = 0;
  let signalsFound = 0;
  const failed: string[] = [];
  const rows: Array<{
    sembol: string;
    signals_json: object;
    candles_json: object;
    change_percent: number | null;
    rsi: number | null;
    last_volume: number | null;
    last_close: number | null;
    confluence_score: number | null;
    pct_from_52w_high: number | null;
    pct_from_52w_low: number | null;
    rel_vol5: number | null;
    sector: string;
    scanned_at: string;
  }> = [];

  // signal_performance kayıtları — entry_time günün başına normalize edilir
  const perfRows: Array<{
    user_id: null;
    sembol: string;
    signal_type: string;
    direction: string;
    entry_price: number;
    entry_time: string;
    evaluated: boolean;
    regime: string;
    confluence_score: number | null;
    avg_daily_volume_tl: number | null;
    weekly_aligned: boolean | null;
    stop_loss: number | null;
    target_price: number | null;
    risk_reward_ratio: number | null;
    atr: number | null;
  }> = [];

  const scannedAt = new Date().toISOString();
  // Günün başı (UTC midnight) — deduplication için
  const entryDay = new Date(scannedAt);
  entryDay.setUTCHours(0, 0, 0, 0);
  const entryTime = entryDay.toISOString();

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (sembol) => {
        // 252 gün — Altın Çapraz gibi sinyaller için yeterli geçmiş
        const { candles, changePercent } = await fetchOHLCV(sembol, 252);
        if (candles.length < 20) throw new Error('Yetersiz veri');
        const signals = detectAllSignals(sembol, candles);
        return { sembol, signals, candles, changePercent };
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      const sembol = batch[j] ?? '?';

      if (result.status === 'rejected') {
        failed.push(sembol);
        continue;
      }

      const { signals, candles, changePercent } = result.value;
      scanned++;
      signalsFound += signals.length;

      // Son 60 mum — MiniChart için yeterli, payload'u küçük tutar
      const last60 = candles.slice(-60);

      // Hisse-seviyesi confluence — scan_cache'de screener filtresi için.
      const stockConfluence = signals.length > 0 ? computeConfluence(signals) : null;

      // 52 hafta tepe/dip mesafesi (252 mum ≈ 1 yıl iş günü)
      const lastCloseCandle = candles[candles.length - 1]?.close ?? null;
      const last252 = candles.slice(-252);
      let pct52High: number | null = null;
      let pct52Low:  number | null = null;
      if (lastCloseCandle && last252.length >= 60) {
        const highs = last252.map((c) => c.high);
        const lows  = last252.map((c) => c.low);
        const max52 = Math.max(...highs);
        const min52 = Math.min(...lows);
        if (max52 > 0) pct52High = parseFloat((((lastCloseCandle - max52) / max52) * 100).toFixed(2));
        if (min52 > 0) pct52Low  = parseFloat((((lastCloseCandle - min52) / min52) * 100).toFixed(2));
      }

      // Relative Volume (5g) — son hacim / 5 günlük ortalama (son hariç)
      let relVol5: number | null = null;
      if (candles.length >= 6) {
        const lastVol = candles[candles.length - 1]?.volume ?? 0;
        const prev5 = candles.slice(-6, -1);
        const avg5 = prev5.reduce((s, c) => s + c.volume, 0) / prev5.length;
        if (avg5 > 0) relVol5 = parseFloat((lastVol / avg5).toFixed(2));
      }

      rows.push({
        sembol,
        signals_json: signals,
        candles_json: last60,
        change_percent: changePercent
          ?? (candles.length >= 2
            ? ((candles[candles.length - 1]!.close - candles[candles.length - 2]!.close)
               / candles[candles.length - 2]!.close) * 100
            : null),
        rsi:               calcLastRSI(candles),
        last_volume:       candles[candles.length - 1]?.volume ?? null,
        last_close:        lastCloseCandle,
        confluence_score:  stockConfluence?.score ?? null,
        pct_from_52w_high: pct52High,
        pct_from_52w_low:  pct52Low,
        rel_vol5:          relVol5,
        sector:            getSectorId(sembol),
        scanned_at:        scannedAt,
      });

      // signal_performance kayıtları — entry_price = son kapanış
      const lastClose = candles[candles.length - 1]?.close;
      if (lastClose && lastClose > 0 && signals.length > 0 && stockConfluence) {
        const confluence = stockConfluence;
        for (const sig of signals) {
          perfRows.push({
            user_id:             null,
            sembol,
            signal_type:         sig.type,
            direction:           sig.direction,
            entry_price:         lastClose,
            entry_time:          entryTime,
            evaluated:           false,
            regime,
            confluence_score:    confluence.score,
            // 2026-04-23: Likidite + MTF + risk seviyeleri (P0-3, P1-1, P2-1)
            avg_daily_volume_tl: sig.avgDailyVolumeTL ?? null,
            weekly_aligned:      sig.weeklyAligned ?? null,
            stop_loss:           sig.stopLoss ?? null,
            target_price:        sig.targetPrice ?? null,
            risk_reward_ratio:   sig.riskRewardRatio ?? null,
            atr:                 sig.atr ?? null,
          });
        }
      }
    }

    if (i + BATCH_SIZE < symbols.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  // scan_cache upsert
  if (rows.length > 0) {
    const { error } = await supabase
      .from('scan_cache')
      .upsert(rows, { onConflict: 'sembol' });

    if (error) {
      console.error('[cron/scan-cache] DB upsert hatası:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // signal_performance insert — günlük unique index ile deduplication
  let perfInserted = 0;
  if (perfRows.length > 0) {
    // 100'erli batch'ler halinde insert et (payload limit)
    const PERF_BATCH = 100;
    for (let i = 0; i < perfRows.length; i += PERF_BATCH) {
      const batch = perfRows.slice(i, i + PERF_BATCH);
      const { error } = await supabase
        .from('signal_performance')
        .upsert(batch, { onConflict: 'sembol,signal_type,entry_time', ignoreDuplicates: true });
      if (error) {
        console.error('[cron/scan-cache] signal_performance insert hatası:', error.message);
      } else {
        perfInserted += batch.length;
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[cron/scan-cache] ${scanned}/${symbols.length} tarandı, ${signalsFound} sinyal, ${perfInserted} perf kaydı, ${failed.length} hata, ${durationMs}ms`);

  return NextResponse.json({
    ok: true,
    scanned,
    total: symbols.length,
    signalsFound,
    perfInserted,
    failed,
    durationMs,
    scannedAt,
  });
}
