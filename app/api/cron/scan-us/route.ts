/**
 * US Borsası Günlük Tarama Cron
 * GET /api/cron/scan-us
 * Schedule: Her ABD iş günü 20:30 UTC (23:30 TRT) — kapanış sonrası
 *
 * ~150 US sembolünü Yahoo Finance'tan çeker, teknik sinyal tespiti yapar,
 * scan_cache'e market='US' olarak yazar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCVUS } from '@/lib/yahoo-us';
import { detectAllSignals, computeConfluence } from '@/lib/signals';
import { getMarketRegime } from '@/lib/regime-engine';
import { US_SYMBOL_LIST } from '@/lib/us-symbols';
import { usMarketGuard } from '@/lib/us-market-guard';
import type { OHLCVCandle, StockSignal } from '@/types';

export const maxDuration = 300; // Vercel Pro: 5 dk (530 sembol için yeterli)

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE  = 6;   // 530 sembol / 6 = ~89 batch × 500ms = ~45s delay
const BATCH_DELAY = 500; // ms — Yahoo rate limit için güvenli aralık

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function calcLastRSI(candles: OHLCVCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const closes = candles.map((c) => c.close);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(0, d))  / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token        = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET)) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
    }
  }

  const guard = usMarketGuard();
  if (guard) return guard;

  const db        = createAdmin();
  const startedAt = Date.now();
  const scannedAt = new Date().toISOString();
  // signal_performance entry_time — gün başı (UTC midnight), günlük deduplication için
  const entryDay = new Date(scannedAt);
  entryDay.setUTCHours(0, 0, 0, 0);
  const entryTime = entryDay.toISOString();

  // US piyasa rejimi — SPY üzerinden
  let regime = 'sideways';
  try {
    const { candles: spy } = await fetchOHLCVUS('SPY', 365);
    if (spy.length > 0) regime = getMarketRegime(spy);
  } catch { /* fallback sideways */ }

  let scanned = 0, signalsFound = 0;
  const failed: string[] = [];

  type CacheRow = {
    sembol: string; market: string;
    signals_json: object; candles_json: object;
    change_percent: number | null; rsi: number | null;
    last_volume: number | null; last_close: number | null;
    confluence_score: number | null;
    pct_from_52w_high: number | null; pct_from_52w_low: number | null;
    rel_vol5: number | null; sector: string; scanned_at: string;
  };
  const rows: CacheRow[] = [];

  // signal_performance kayıtları — forward evaluation (win rate) için
  type PerfRow = {
    user_id: null;
    sembol: string;
    market: string;
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
  };
  const perfRows: PerfRow[] = [];

  const symbols = [...US_SYMBOL_LIST];

  let flushedScanCache = 0; // scan_cache'e kademeli yazımda son flush index'i

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
        const { candles, changePercent } = await fetchOHLCVUS(symbol, 252);
        if (candles.length < 20) throw new Error('Yetersiz veri');
        const signals = detectAllSignals(symbol, candles);
        return { symbol, signals, candles, changePercent };
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      const symbol = batch[j]!;

      if (result.status === 'rejected') { failed.push(symbol); continue; }

      const { signals, candles, changePercent } = result.value;
      scanned++;
      signalsFound += signals.length;

      const last60   = candles.slice(-60);
      const confluence = signals.length > 0 ? computeConfluence(signals) : null;
      const lastClose  = candles.at(-1)?.close ?? null;

      // 52H
      const last252 = candles.slice(-252);
      let pct52High: number | null = null, pct52Low: number | null = null;
      if (lastClose && last252.length >= 60) {
        const maxH = Math.max(...last252.map((c) => c.high));
        const minL = Math.min(...last252.map((c) => c.low));
        if (maxH > 0) pct52High = parseFloat((((lastClose - maxH) / maxH) * 100).toFixed(2));
        if (minL > 0) pct52Low  = parseFloat((((lastClose - minL) / minL) * 100).toFixed(2));
      }

      // RelVol5
      let relVol5: number | null = null;
      if (candles.length >= 6) {
        const lastVol = candles.at(-1)?.volume ?? 0;
        const avg5    = candles.slice(-6, -1).reduce((s, c) => s + c.volume, 0) / 5;
        if (avg5 > 0) relVol5 = parseFloat((lastVol / avg5).toFixed(2));
      }

      // Sektör — US sembol için
      const { US_SYMBOLS } = await import('@/lib/us-symbols');
      const usInfo = US_SYMBOLS.find((s) => s.symbol === symbol);

      rows.push({
        sembol:    symbol,
        market:    'US',
        signals_json: signals,
        candles_json: last60,
        change_percent: changePercent
          ?? (candles.length >= 2
            ? ((candles.at(-1)!.close - candles.at(-2)!.close) / candles.at(-2)!.close) * 100
            : null),
        rsi:              calcLastRSI(candles),
        last_volume:      candles.at(-1)?.volume ?? null,
        last_close:       lastClose,
        confluence_score: confluence?.score ?? null,
        pct_from_52w_high: pct52High,
        pct_from_52w_low:  pct52Low,
        rel_vol5:          relVol5,
        sector:            usInfo?.sector ?? 'Other',
        scanned_at:        scannedAt,
      });

      // signal_performance — forward evaluation için her sinyali kaydet
      if (lastClose && lastClose > 0 && signals.length > 0 && confluence) {
        for (const sig of signals) {
          perfRows.push({
            user_id:             null,
            sembol:              symbol,
            market:              'US',
            signal_type:         sig.type,
            direction:           sig.direction,
            entry_price:         lastClose,
            entry_time:          entryTime,
            evaluated:           false,
            regime,
            confluence_score:    confluence.score,
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

    // scan_cache'i her batch sonrası kademeli yaz — fonksiyon erken kesilse
    // bile o ana kadar taranan hisseler kalıcı olur (all-or-nothing riski yok).
    if (rows.length > flushedScanCache) {
      const pending = rows.slice(flushedScanCache);
      const { error } = await db
        .from('scan_cache')
        .upsert(pending, { onConflict: 'sembol,market' });
      if (error) {
        console.error('[cron/scan-us] scan_cache upsert hatası:', error.message);
      } else {
        flushedScanCache = rows.length;
      }
    }

    if (i + BATCH_SIZE < symbols.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  // signal_performance INSERT — günde bir kayıt (sembol+signal_type+entry_time+market unique).
  // ignoreDuplicates: gün içi 3 tarama aynı satırı tekrar yazmaz; evaluated kayıtlar korunur.
  let perfInserted = 0;
  if (perfRows.length > 0) {
    const PERF_BATCH = 100;
    for (let k = 0; k < perfRows.length; k += PERF_BATCH) {
      const batch = perfRows.slice(k, k + PERF_BATCH);
      const { error, data } = await db
        .from('signal_performance')
        .upsert(batch, { onConflict: 'sembol,signal_type,entry_time,market', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.error('[cron/scan-us] signal_performance INSERT hatası:', error.message);
      } else {
        perfInserted += data?.length ?? 0;
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[cron/scan-us] ${scanned}/${symbols.length} tarandı, ${signalsFound} sinyal, ${perfInserted} perf kayıt, ${failed.length} hata, ${durationMs}ms`);

  return NextResponse.json({
    ok: true, market: 'US',
    scanned, total: symbols.length, signalsFound, perfInserted,
    failed, regime, durationMs, scannedAt,
  });
}
