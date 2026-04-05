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
import { detectAllSignals } from '@/lib/signals';
import { BIST_SYMBOLS } from '@/types';

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

  let scanned = 0;
  let signalsFound = 0;
  const failed: string[] = [];
  const rows: Array<{
    sembol: string;
    signals_json: object;
    candles_json: object;
    change_percent: number | null;
    scanned_at: string;
  }> = [];

  const scannedAt = new Date().toISOString();

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

      rows.push({
        sembol,
        signals_json: signals,
        candles_json: last60,
        change_percent: changePercent ?? null,
        scanned_at: scannedAt,
      });
    }

    if (i + BATCH_SIZE < symbols.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  // Tüm sonuçları tek seferde upsert et
  if (rows.length > 0) {
    const { error } = await supabase
      .from('scan_cache')
      .upsert(rows, { onConflict: 'sembol' });

    if (error) {
      console.error('[cron/scan-cache] DB upsert hatası:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[cron/scan-cache] ${scanned}/${symbols.length} tarandı, ${signalsFound} sinyal, ${failed.length} hata, ${durationMs}ms`);

  return NextResponse.json({
    ok: true,
    scanned,
    total: symbols.length,
    signalsFound,
    failed,
    durationMs,
    scannedAt,
  });
}
