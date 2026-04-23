/**
 * Günlük otomatik tarama cron'u.
 * Top 30 BIST hissesini tarar, sinyalleri signal_performance tablosuna kaydeder.
 *
 * GET /api/cron/scan
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Vercel Cron: Her iş günü sabah 09:30 (TRT = UTC+3 → UTC 06:30)
 * Schedule: "30 6 * * 1-5"
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals, computeConfluence } from '@/lib/signals';
import type { StockSignal } from '@/types';
import { getMarketRegime } from '@/lib/regime-engine';


const CRON_SECRET = process.env.CRON_SECRET;

// En likit top 50 BIST hissesi
const TOP30_SYMBOLS = [
  // Orijinal TOP30
  'THYAO', 'GARAN', 'ASELS', 'KCHOL', 'EREGL',
  'BIMAS', 'AKBNK', 'SISE',  'TUPRS', 'FROTO',
  'TOASO', 'SAHOL', 'YKBNK', 'HALKB', 'VAKBN',
  'TCELL', 'ARCLK', 'EKGYO', 'PGSUS', 'TTKOM',
  'PETKM', 'DOHOL', 'KOZAL', 'MGROS', 'SASA',
  'ISCTR', 'ENKAI', 'BRISA', 'AGHOL', 'OYAKC',
  // Ek 20 likit hisse
  'CCOLA', 'ULKER', 'OTKAR', 'TTRAK', 'CLEBI',
  'AKCNS', 'CIMSA', 'KRDMD', 'LOGO',  'AKSEN',
  'SKBNK', 'TSKB',  'VESBE', 'VESTL', 'GUBRF',
  'TAVHL', 'TKFEN', 'SOKM',  'MAVI',  'ARDYZ',
];

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 400; // Yahoo rate limit için bekle

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  // Yetkilendirme: Vercel Cron otomatik header VEYA manuel Bearer token
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

  // Piyasa rejimini bir kez çek (tüm hisseler için aynı)
  let regime = 'sideways';
  try {
    const { candles: xu100 } = await fetchOHLCV('XU100', 365); // XU100.IS — doğru Yahoo ticker
    regime = getMarketRegime(xu100);
  } catch {
    // Başarısız olursa sideways devam et
  }

  let totalSignals = 0;
  let totalInserted = 0;
  let failedSymbols: string[] = [];

  // Batch'ler halinde tara
  for (let i = 0; i < TOP30_SYMBOLS.length; i += BATCH_SIZE) {
    const batch = TOP30_SYMBOLS.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (sembol) => {
        const { candles } = await fetchOHLCV(sembol, 90);
        if (candles.length === 0) throw new Error('Veri yok');
        const signals = detectAllSignals(sembol, candles);
        return { sembol, signals, candles };
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      if (result.status === 'rejected') {
        failedSymbols.push(batch[j] ?? '?');
        continue;
      }

      const { sembol, signals, candles } = result.value;
      if (signals.length === 0) continue;

      const lastCandle = candles[candles.length - 1];
      if (!lastCandle) continue;

      // Confluence skoru hesapla — her sinyal grubuyla birlikte kaydet
      const confluence = computeConfluence(signals);

      totalSignals += signals.length;

      // Her sinyal için DB'ye kaydet (confluence + likidite + MTF + risk seviyeleri)
      const rows = signals.map((sig: StockSignal) => ({
        user_id:             null,
        sembol,
        signal_type:         sig.type,
        direction:           sig.direction,
        entry_price:         lastCandle.close,
        entry_time:          lastCandle.date,
        evaluated:           false,
        regime,
        confluence_score:    confluence.score,
        // 2026-04-23: Yeni kolonlar (P0-3, P1-1, P2-1)
        avg_daily_volume_tl: sig.avgDailyVolumeTL ?? null,
        weekly_aligned:      sig.weeklyAligned ?? null,
        stop_loss:           sig.stopLoss ?? null,
        target_price:        sig.targetPrice ?? null,
        risk_reward_ratio:   sig.riskRewardRatio ?? null,
        atr:                 sig.atr ?? null,
      }));

      const { error, data } = await supabase
        .from('signal_performance')
        .upsert(rows, {
          onConflict: 'sembol,signal_type,entry_time',
          ignoreDuplicates: true,
        })
        .select('id');

      if (error) {
        console.error(`[cron/scan] DB upsert hatası (${sembol}):`, error.message);
      } else {
        totalInserted += data?.length ?? 0;
      }
    }

    // Son batch'ten sonra beklemeye gerek yok
    if (i + BATCH_SIZE < TOP30_SYMBOLS.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(`[cron/scan] Tamamlandı: ${totalSignals} sinyal, ${totalInserted} kayıt, ${failedSymbols.length} hata, ${durationMs}ms`);

  return NextResponse.json({
    ok: true,
    scanned: TOP30_SYMBOLS.length,
    signalsFound: totalSignals,
    inserted: totalInserted,
    failed: failedSymbols,
    regime,
    durationMs,
    timestamp: new Date().toISOString(),
  });
}
