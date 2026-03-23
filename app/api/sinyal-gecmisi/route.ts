/**
 * Sinyal Geçmişi API
 *
 * GET /api/sinyal-gecmisi?symbol=THYAO&limit=10
 *
 * Giriş yapmış kullanıcının bu hisse için kayıtlı sinyal
 * performans geçmişini döner.
 *
 * Yanıt:
 *   signals: SignalRecord[]   — son N kayıt (entry_time desc)
 *   stats:   SignalStats      — toplam, değerlendirilen, başarı oranı
 *
 * Wave 3 — Hisse Detay Sayfası Sinyal Geçmişi
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export interface SignalRecord {
  id: string;
  signal_type: string;
  direction: string;
  entry_price: number;
  entry_time: string;
  return_3d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  evaluated: boolean;
  regime: string | null;
  /** Başarılı mı? evaluated=true ise hesaplanır */
  success: boolean | null;
}

export interface SignalStats {
  total: number;
  evaluated: number;
  successCount: number;
  successRate: number | null;  // 0–100, null = değerlendirilen kayıt yok
}

export interface SinyalGecmisiResponse {
  signals: SignalRecord[];
  stats: SignalStats;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get('symbol')?.trim().toUpperCase();
  const limit  = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)));

  if (!symbol) {
    return NextResponse.json({ error: 'symbol parametresi gerekli.' }, { status: 400 });
  }

  // Auth kontrolü
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Sunucu yapılandırma hatası.' }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // Son N kaydı çek (kullanıcıya ait, bu sembol için)
    const { data: rows, error } = await admin
      .from('signal_performance')
      .select('id, signal_type, direction, entry_price, entry_time, return_3d, return_7d, return_14d, evaluated, regime')
      .eq('user_id', user.id)
      .eq('sembol', symbol)
      .order('entry_time', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const signals: SignalRecord[] = (rows ?? []).map((r) => {
      let success: boolean | null = null;
      if (r.evaluated && r.return_7d != null) {
        // Yükseliş sinyali başarılı = 7 günlük getiri pozitif
        // Düşüş sinyali başarılı = 7 günlük getiri negatif
        success = r.direction === 'asagi'
          ? r.return_7d < 0
          : r.return_7d > 0;
      }
      return { ...r, success };
    });

    // İstatistik — tüm geçmiş kayıtlar (limit olmadan)
    const { data: allRows, error: statsErr } = await admin
      .from('signal_performance')
      .select('direction, return_7d, evaluated')
      .eq('user_id', user.id)
      .eq('sembol', symbol);

    if (statsErr) throw statsErr;

    const all = allRows ?? [];
    const evaluatedRows = all.filter((r) => r.evaluated && r.return_7d != null);
    const successRows = evaluatedRows.filter((r) =>
      r.direction === 'asagi' ? r.return_7d < 0 : r.return_7d > 0
    );

    const stats: SignalStats = {
      total:       all.length,
      evaluated:   evaluatedRows.length,
      successCount: successRows.length,
      successRate: evaluatedRows.length > 0
        ? Math.round((successRows.length / evaluatedRows.length) * 100)
        : null,
    };

    return NextResponse.json({ signals, stats } satisfies SinyalGecmisiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error(`[sinyal-gecmisi] Hata (${symbol}):`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
