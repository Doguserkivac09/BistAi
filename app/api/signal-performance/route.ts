import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { fetchOHLCV } from '@/lib/yahoo';
import { getMarketRegime } from '@/lib/regime-engine';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

// XU100 regime cache — 5 dakika geçerliliği
let regimeCache: { value: string; expiresAt: number } | null = null;

async function getCachedRegime(): Promise<string> {
  const now = Date.now();
  if (regimeCache && regimeCache.expiresAt > now) return regimeCache.value;
  try {
    const xu100Candles = await fetchOHLCV('^XU100', 365);
    const regime = getMarketRegime(xu100Candles);
    regimeCache = { value: regime, expiresAt: now + 5 * 60 * 1000 };
    return regime;
  } catch {
    return regimeCache?.value ?? 'sideways';
  }
}

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
    // Rate limit: 500 req/min (tarama 200+ sinyal kaydedebilir)
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`signal-perf:${ip}`, 500, 60_000);
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

    // Server-side regime tespiti — 5dk cache (200+ paralel istekte Yahoo rate limit önler)
    const regime = await getCachedRegime();

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
        { error: 'Kayıt başarısız.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, regime });
  } catch (error) {
    console.error('[signal-performance] Hata:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
