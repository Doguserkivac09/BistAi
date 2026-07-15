/**
 * Gelişmiş AI Analiz — premium okuma API'si.
 *
 * Auth + premium (tier-gated). Mevcut /api/hisse-analiz çıktısını (kompozit karar, skorlar,
 * hedefler, faktörler) server-side toplar → Claude ile kapsamlı premium rapora sentezler.
 * ai_cache (sembol+gün) + AI bütçe koruması → tekrar açılışta ücretsiz/hızlı.
 *
 * GET /api/hisse-ai-analiz?symbol=GARAN[&market=US]
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { hasTierAccess, type Tier } from '@/lib/tier-guard';
import { checkAndRecordAiBudget } from '@/lib/ai-budget';
import { synthesizeAdvancedReport, type AdvancedReportInput, type AdvancedReport } from '@/lib/hisse-ai-analiz';
import type { HisseAnalizResponse } from '@/app/api/hisse-analiz/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** DecisionFactors nesnesini AI için sıfır-olmayan ± faktör listesine çevir. */
function buildFactors(f?: Record<string, number>): { name: string; value: number }[] {
  if (!f) return [];
  const map: [string, string][] = [
    ['winRateAdj', 'Geçmiş başarı'], ['regimeFit', 'Rejim uyumu'], ['macroAlign', 'Makro uyumu'],
    ['mtfAlign', 'Çoklu zaman'], ['sectorAlign', 'Sektör uyumu'], ['volumeConfirm', 'Hacim teyidi'],
    ['earningsRisk', 'Bilanço riski'], ['kapEvent', 'KAP riski'], ['catalyst', 'Haber katalisti'],
  ];
  const out: { name: string; value: number }[] = [];
  for (const [k, label] of map) {
    const v = Math.round(Number(f[k] ?? 0));
    if (v !== 0) out.push({ name: label, value: v });
  }
  return out;
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') ?? '').trim().toUpperCase();
  const market = request.nextUrl.searchParams.get('market') === 'US' ? 'US' : 'BIST';
  if (!symbol) return NextResponse.json({ error: 'Sembol gerekli.' }, { status: 400 });

  // 1) Oturum
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });

  // 2) Premium
  const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single();
  const tier = (profile?.tier ?? 'free') as Tier;
  if (!hasTierAccess(tier, 'premium')) {
    return NextResponse.json({ error: 'Bu özellik premium üyeliğe özeldir.', requiredTier: 'premium' }, { status: 403 });
  }

  const db = admin();
  const cacheKey = `hisse-ai-analiz:${symbol}:${new Date().toISOString().slice(0, 10)}`;

  // 3) Cache
  if (db) {
    const { data } = await db.from('ai_cache').select('explanation').eq('cache_key', cacheKey).gt('expires_at', new Date().toISOString()).single();
    if (data?.explanation) {
      try { return NextResponse.json({ report: JSON.parse(data.explanation) as AdvancedReport, cached: true }); } catch { /* devam */ }
    }
  }

  // 4) Analiz verisini topla (server-side, mevcut public endpoint)
  let analiz: HisseAnalizResponse | null = null;
  try {
    const origin = request.nextUrl.origin;
    const r = await fetch(`${origin}/api/hisse-analiz?symbol=${encodeURIComponent(symbol)}&timeframe=1d${market === 'US' ? '&market=US' : ''}`, { cache: 'no-store' });
    if (r.ok) analiz = await r.json();
  } catch { /* analiz null kalır */ }
  if (!analiz) return NextResponse.json({ error: 'Analiz verisi alınamadı.' }, { status: 502 });

  // 5) AI bütçe
  const budget = await checkAndRecordAiBudget();
  if (!budget.allowed) return NextResponse.json({ error: 'Günlük AI kapasitesi doldu, yarın tekrar deneyin.' }, { status: 429 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI yapılandırması eksik.' }, { status: 500 });

  // 6) Sentez
  const input: AdvancedReportInput = {
    sembol: symbol,
    shortName: analiz.shortName,
    sectorName: analiz.sectorName,
    currentPrice: analiz.currentPrice ?? null,
    changePercent: analiz.changePercent ?? null,
    decisionTr: analiz.decisionTr,
    confidence: analiz.confidence,
    compositeScore: analiz.compositeScore,
    technicalScore: analiz.technicalScore,
    macroScore: analiz.macroScore,
    sectorScore: analiz.sectorScore,
    explanation: analiz.explanation,
    targets: {
      entry: analiz.currentPrice ?? analiz.priceTargets?.currentPrice ?? null,
      stop: analiz.priceTargets?.stopLoss?.price ?? null,
      target1: analiz.priceTargets?.target1?.price ?? null,
      target2: analiz.priceTargets?.target2?.price ?? null,
      riskReward: analiz.priceTargets?.riskReward ?? null,
    },
    factors: buildFactors(analiz.decisionEngine?.factors as unknown as Record<string, number> | undefined),
    high90d: analiz.high90d ?? null,
    low90d: analiz.low90d ?? null,
  };

  let report: AdvancedReport;
  try {
    report = await synthesizeAdvancedReport(input, apiKey);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI hatası' }, { status: 502 });
  }

  // 7) Cache yaz (24h)
  if (db) {
    await db.from('ai_cache').upsert({
      cache_key: cacheKey,
      explanation: JSON.stringify(report),
      version: 1,
      hit_count: 0,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'cache_key' });
  }

  return NextResponse.json({ report, cached: false });
}
