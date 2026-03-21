import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { fetchOHLCV } from '@/lib/yahoo';
import { getMarketRegime } from '@/lib/regime-engine';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase URL veya service role key tanımlı değil.');
  }
  return createClient(url, serviceKey);
}

interface SignalPerformanceBody {
  sembol: string;
  signal_type: string;
  direction: 'yukari' | 'asagi' | 'nötr';
  entry_price: number;
  entry_time: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limit: 60 req/min
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`signal-perf:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 });
    }

    // Auth kontrolü
    const supabaseAuth = await createServerClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const body = (await request.json()) as SignalPerformanceBody;

    if (!body.sembol || !body.signal_type || !body.direction || !body.entry_price || !body.entry_time) {
      return NextResponse.json(
        { error: 'Eksik alan: sembol, signal_type, direction, entry_price, entry_time zorunludur.' },
        { status: 400 }
      );
    }

    // Server-side regime tespiti: XU100 OHLCV'den EMA50/EMA200
    let regime = 'sideways';
    try {
      const xu100Candles = await fetchOHLCV('^XU100', 365);
      regime = getMarketRegime(xu100Candles);
    } catch {
      // Regime tespit edilemezse default 'sideways' kalır
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('signal_performance')
      .upsert(
        {
          user_id: user.id,
          sembol: body.sembol,
          signal_type: body.signal_type,
          direction: body.direction,
          entry_price: body.entry_price,
          entry_time: body.entry_time,
          evaluated: false,
          regime,
        },
        {
          onConflict: 'sembol,signal_type,entry_time',
          ignoreDuplicates: true,
        }
      );

    if (error) {
      console.error('[signal-performance] Supabase upsert hatası:', error.message);
      return NextResponse.json(
        { error: `Kayıt başarısız: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, regime });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    console.error('[signal-performance] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
