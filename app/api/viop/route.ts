/**
 * VIOP Okuma API (FAZ V1-3 — VIOP-TRADINGVIEW-PLAN.md)
 *
 * ai_cache 'viop-scan:BIST' tek satırını okur + güncellik meta döndürür.
 * İstek anında Yahoo/broker fan-out YOK (cron precompute eder).
 *
 * Erişim: premium (tier-gated). Oturum + profiles.tier === 'premium' şartı.
 * (middleware /viop sayfasını korur; API de kendi başına korur.)
 *
 * GET /api/viop
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { hasTierAccess, type Tier } from '@/lib/tier-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerClient();

  // 1) Oturum
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });
  }

  // 2) Tier (premium gerekli)
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .single();
  const tier = (profile?.tier ?? 'free') as Tier;
  if (!hasTierAccess(tier, 'premium')) {
    return NextResponse.json(
      { error: 'Bu özellik premium üyeliğe özeldir.', requiredTier: 'premium' },
      { status: 403 },
    );
  }

  // 3) ai_cache tek satır oku
  const { data, error } = await supabase
    .from('ai_cache')
    .select('explanation, expires_at')
    .eq('cache_key', 'viop-scan:BIST')
    .single();

  if (error || !data?.explanation) {
    return NextResponse.json(
      { items: [], generatedAt: null, stale: true, message: 'VIOP analizi henüz hazır değil.' },
    );
  }

  let parsed: { generatedAt?: string; items?: unknown[] } = {};
  try {
    parsed = JSON.parse(data.explanation);
  } catch {
    return NextResponse.json({ items: [], generatedAt: null, stale: true });
  }

  const stale = data.expires_at ? new Date(data.expires_at).getTime() < Date.now() : true;

  return NextResponse.json({
    items: parsed.items ?? [],
    generatedAt: parsed.generatedAt ?? null,
    stale,
  });
}
