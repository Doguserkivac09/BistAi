/**
 * GET /api/gecmis-firsatlar
 *
 * Son N günde signal_performance tablosuna kaydedilmiş sinyalleri döner.
 * Yüksek confluence + iyi return_7d olan "kaçırılan fırsatları" gösterir.
 *
 * Query params:
 *  - days=90        (kaç günlük geçmiş, default 90)
 *  - minConfluence=50 (default 50)
 *  - direction=yukari|asagi|all (default all)
 *  - sort=return7d|return30d|confluence|date (default return7d)
 *  - limit=100 (default 100)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface GecmisFirsat {
  id: string;
  sembol: string;
  signal_type: string;
  direction: string | null;
  entry_time: string;
  entry_price: number;
  confluence_score: number | null;
  return_3d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d: number | null;
  evaluated: boolean;
  regime: string | null;
  weekly_aligned: boolean | null;
  stop_loss: number | null;
  target_price: number | null;
  risk_reward_ratio: number | null;
  /** Kaç gün önce çıkmış */
  daysAgo: number;
  /** Sinyalin "iyi" çıkıp çıkmadığı */
  isWinner: boolean | null;
}

export interface GecmisFirsatlarResponse {
  items: GecmisFirsat[];
  stats: {
    total: number;
    evaluated: number;
    winners: number;
    winRate: number | null;
    avgReturn7d: number | null;
    bestReturn7d: number | null;
    bestSembol: string | null;
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days          = Math.min(parseInt(searchParams.get('days') ?? '90'), 365);
  const minConfluence = parseInt(searchParams.get('minConfluence') ?? '50');
  const direction     = searchParams.get('direction') ?? 'all';
  const sort          = searchParams.get('sort') ?? 'return7d';
  const limit         = Math.min(parseInt(searchParams.get('limit') ?? '150'), 300);

  const admin = createAdmin();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = admin
    .from('signal_performance')
    .select('id, sembol, signal_type, direction, entry_time, entry_price, confluence_score, return_3d, return_7d, return_14d, return_30d, evaluated, regime, weekly_aligned, stop_loss, target_price, risk_reward_ratio')
    .gte('entry_time', since)
    .gte('confluence_score', minConfluence)
    .is('user_id', null)           // sadece global (sistem) sinyalleri
    .limit(limit);

  if (direction !== 'all') {
    query = query.eq('direction', direction);
  }

  // Sıralama
  if (sort === 'return7d') {
    query = query.order('return_7d', { ascending: false, nullsFirst: false });
  } else if (sort === 'return30d') {
    query = query.order('return_30d', { ascending: false, nullsFirst: false });
  } else if (sort === 'confluence') {
    query = query.order('confluence_score', { ascending: false });
  } else {
    query = query.order('entry_time', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const COMMISSION = 0.004;

  const items: GecmisFirsat[] = (data ?? []).map((row) => {
    const daysAgo = Math.floor((now - new Date(row.entry_time).getTime()) / 86_400_000);
    const r7 = row.return_7d != null ? row.return_7d - COMMISSION * 100 : null;
    const isWinner = row.evaluated && r7 != null ? r7 > 0 : null;
    return {
      ...row,
      daysAgo,
      isWinner,
    };
  });

  // İstatistikler
  const evaluated   = items.filter((i) => i.evaluated);
  const winners     = evaluated.filter((i) => i.isWinner);
  const returns7d   = evaluated.map((i) => i.return_7d).filter((v): v is number => v != null);
  const avgReturn7d = returns7d.length > 0
    ? returns7d.reduce((a, b) => a + b, 0) / returns7d.length
    : null;
  const bestReturn7d = returns7d.length > 0 ? Math.max(...returns7d) : null;
  const bestSembol   = bestReturn7d != null
    ? (items.find((i) => i.return_7d === bestReturn7d)?.sembol ?? null)
    : null;

  return NextResponse.json(
    {
      items,
      stats: {
        total:      items.length,
        evaluated:  evaluated.length,
        winners:    winners.length,
        winRate:    evaluated.length > 0 ? (winners.length / evaluated.length) * 100 : null,
        avgReturn7d,
        bestReturn7d,
        bestSembol,
      },
    } satisfies GecmisFirsatlarResponse,
    {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    },
  );
}
