import { NextRequest, NextResponse } from 'next/server';
import { fetchAllMacroIndicators } from '@/lib/fred';
import { createClient } from '@supabase/supabase-js';

// In-memory cache (5 dakika TTL)
let snapshotCache: { data: unknown; expiry: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/macro — Güncel makro snapshot veya geçmiş verileri döndürür.
 *
 * Query params:
 *   ?history=30  → Son 30 günlük macro_data kayıtları (Supabase'den)
 *   (parametre yok) → FRED + Yahoo'dan güncel snapshot
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const historyDays = searchParams.get('history');

    // --- History modu: Supabase'den son N gün ---
    if (historyDays) {
      const days = Math.min(Math.max(parseInt(historyDays, 10) || 30, 1), 365);
      const supabase = getSupabase();

      if (!supabase) {
        return NextResponse.json(
          { error: 'Veritabanı bağlantısı yapılandırılmamış.' },
          { status: 500 }
        );
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('macro_data')
        .select('*')
        .gte('observation_date', cutoffStr)
        .order('observation_date', { ascending: false });

      if (error) {
        return NextResponse.json(
          { error: `Veritabanı hatası: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ history: data ?? [] });
    }

    // --- Snapshot modu: FRED + Yahoo'dan güncel veri ---
    if (snapshotCache && Date.now() < snapshotCache.expiry) {
      return NextResponse.json(snapshotCache.data);
    }

    const snapshot = await fetchAllMacroIndicators();

    snapshotCache = {
      data: snapshot,
      expiry: Date.now() + CACHE_TTL_MS,
    };

    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
