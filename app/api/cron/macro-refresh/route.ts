import { NextRequest, NextResponse } from 'next/server';
import { fetchAllMacroIndicators } from '@/lib/fred';
import { fetchOHLCV } from '@/lib/yahoo';
import { createClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase URL veya service role key tanımlı değil.');
  return createClient(url, serviceKey);
}

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Cron endpoint: Makro verileri FRED + Yahoo'dan çeker ve DB'ye yazar.
 * GET /api/cron/macro-refresh
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!CRON_SECRET || !token || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const supabase = getAdminSupabase();
    let updated = 0;

    // 1. FRED makro verileri
    const macro = await fetchAllMacroIndicators();
    const fredEntries = [
      { key: 'fed_rate', value: macro.fed_rate },
      { key: 'cpi_yoy', value: macro.cpi_yoy },
      { key: 'gdp_growth', value: macro.gdp_growth },
      { key: 'unemployment', value: macro.unemployment },
      { key: 'yield_curve_10y2y', value: macro.yield_curve_10y2y },
      { key: 'dollar_index', value: macro.dollar_index },
    ];

    for (const entry of fredEntries) {
      if (entry.value == null) continue;
      const { error } = await supabase.from('macro_data').upsert(
        {
          indicator_key: entry.key,
          value: entry.value,
          observation_date: today,
          source: 'fred',
        },
        { onConflict: 'indicator_key,observation_date' }
      );
      if (!error) updated++;
    }

    // 2. Yahoo: VIX ve US 10Y Yield
    const { candles: vixCandles } = await fetchOHLCV('^VIX', 5);
    if (vixCandles.length > 0) {
      const latestVix = vixCandles[vixCandles.length - 1];
      const { error } = await supabase.from('macro_data').upsert(
        {
          indicator_key: 'vix',
          value: latestVix.close,
          observation_date: today,
          source: 'yahoo',
        },
        { onConflict: 'indicator_key,observation_date' }
      );
      if (!error) updated++;
    }

    const { candles: tnxCandles } = await fetchOHLCV('^TNX', 5);
    if (tnxCandles.length > 0) {
      const latestTnx = tnxCandles[tnxCandles.length - 1];
      const { error } = await supabase.from('macro_data').upsert(
        {
          indicator_key: 'us_10y_yield',
          value: latestTnx.close,
          observation_date: today,
          source: 'yahoo',
        },
        { onConflict: 'indicator_key,observation_date' }
      );
      if (!error) updated++;
    }

    return NextResponse.json({
      ok: true,
      updated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[cron/macro-refresh] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
