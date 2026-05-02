/**
 * GET /api/signal-stats-summary
 *
 * Her sinyal tipi için canonical horizon'daki win rate'i döner.
 * Canonical horizon = sinyalin doğal vadesi (3d/7d/14d/30d).
 *
 * Tarama sayfası ve hisse detay sayfası tarafından kullanılır.
 */

import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import type { SignalPerformanceRecord } from '@/lib/performance-types';

// ── Canonical horizon map (evaluate-engine ve backtesting.ts ile senkronize) ──
const SIGNAL_CANONICAL_FIELD: Record<string, keyof Pick<SignalPerformanceRecord, 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'>> = {
  'Altın Çapraz':            'return_30d',
  'Ölüm Çaprazı':            'return_30d',
  'Trend Başlangıcı':        'return_14d',
  'Destek/Direnç Kırılımı':  'return_14d',
  'Higher Lows':             'return_14d',
  'MACD Kesişimi':            'return_7d',
  'RSI Uyumsuzluğu':          'return_7d',
  'Bollinger Sıkışması':      'return_7d',
  'RSI Seviyesi':              'return_3d',
  'Hacim Anomalisi':           'return_3d',
};

const SIGNAL_HORIZON_LABEL: Record<string, string> = {
  'Altın Çapraz':            '30g',
  'Ölüm Çaprazı':            '30g',
  'Trend Başlangıcı':        '14g',
  'Destek/Direnç Kırılımı':  '14g',
  'MACD Kesişimi':            '7g',
  'RSI Uyumsuzluğu':          '7g',
  'Bollinger Sıkışması':      '7g',
  'RSI Seviyesi':              '3g',
  'Hacim Anomalisi':           '3g',
};

export interface SignalStatsSummaryEntry {
  signal_type:  string;
  win_rate:     number;   // 0-1
  avg_return:   number;   // % (komisyon dahil)
  n:            number;
  horizon:      string;   // '3g' | '7g' | '14g' | '30g'
}

export interface SignalStatsSummaryResponse {
  stats: SignalStatsSummaryEntry[];
}

const COMMISSION = 0.004; // %0.4 gidiş-dönüş komisyon

function createAdminClient() {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createSupabaseAdminClient(url, serviceKey);
}

// 5 dakika cache
export const revalidate = 300;

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Son 180 gün içinde evaluate edilmiş kayıtlar
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);

    const { data, error } = await supabase
      .from('signal_performance')
      .select('signal_type, direction, return_3d, return_7d, return_14d, return_30d')
      .eq('evaluated', true)
      .gte('entry_time', cutoff.toISOString());

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const records = (data as Pick<SignalPerformanceRecord, 'signal_type' | 'direction' | 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'>[]) ?? [];

    // Sinyal tipine göre grupla
    const groups = new Map<string, typeof records>();
    for (const rec of records) {
      if (!rec.signal_type) continue;
      if (!groups.has(rec.signal_type)) groups.set(rec.signal_type, []);
      groups.get(rec.signal_type)!.push(rec);
    }

    const stats: SignalStatsSummaryEntry[] = [];

    for (const [signalType, rows] of groups) {
      const field = SIGNAL_CANONICAL_FIELD[signalType] ?? 'return_7d';
      const horizon = SIGNAL_HORIZON_LABEL[signalType] ?? '7g';

      // Canonical field'ı dolu olan kayıtları filtrele
      const valid = rows.filter((r) => {
        const val = r[field];
        return val != null && Number.isFinite(val as number);
      });

      if (valid.length < 5) continue; // Yetersiz örneklem

      let wins = 0;
      let sumReturn = 0;

      for (const r of valid) {
        const raw = r[field] as number;
        // Yön düzeltmesi: asagi sinyali için fiyat düşüşü = kazanç
        const dirAdj = r.direction === 'asagi' ? -raw : raw;
        const net = dirAdj - COMMISSION;
        sumReturn += net;
        if (net > 0) wins++;
      }

      stats.push({
        signal_type: signalType,
        win_rate:    wins / valid.length,
        avg_return:  (sumReturn / valid.length) * 100,
        n:           valid.length,
        horizon,
      });
    }

    return NextResponse.json<SignalStatsSummaryResponse>({ stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
