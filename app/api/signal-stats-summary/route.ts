/**
 * GET /api/signal-stats-summary
 *
 * Her sinyal tipi için canonical horizon'daki win rate'i döner.
 * Canonical horizon = sinyalin doğal vadesi (3d/7d/14d/30d).
 *
 * Tarama sayfası ve hisse detay sayfası tarafından kullanılır.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { getCanonicalField, HORIZON_DAYS } from '@/lib/signal-horizons';
import type { SignalPerformanceRecord } from '@/lib/performance-types';

// Canonical horizon — tek kaynak: lib/signal-horizons (BUG-A fix).
// Horizon etiketi de oradan türetilir; eski yerel SIGNAL_HORIZON_LABEL yeni
// sinyal tiplerini içermediği için 14g/30g tipler UI'da yanlış "7g" görünüyordu.

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

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Market filtresi (varsayılan BIST; null = eski migration-öncesi BIST kayıtları)
    const market = request.nextUrl.searchParams.get('market') === 'US' ? 'US' : 'BIST';

    // Son 180 gün içinde evaluate edilmiş kayıtlar
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);

    let query = supabase
      .from('signal_performance')
      .select('signal_type, direction, return_3d, return_7d, return_14d, return_30d')
      .eq('evaluated', true)
      .gte('entry_time', cutoff.toISOString());
    query = market === 'US'
      ? query.eq('market', 'US')
      : query.or('market.eq.BIST,market.is.null');

    const { data, error } = await query;

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
      const field = getCanonicalField(signalType) as keyof Pick<SignalPerformanceRecord, 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'>;
      const horizon = `${HORIZON_DAYS[getCanonicalField(signalType)]}g`;

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
