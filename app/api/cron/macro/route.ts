import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllMacroQuotes } from '@/lib/macro-data';
import { fetchAllTurkeyMacro } from '@/lib/turkey-macro';
import { fetchAllFredData } from '@/lib/fred';
import { calculateMacroScore } from '@/lib/macro-score';

/**
 * Cron endpoint: Günlük makro snapshot kaydeder.
 * Vercel Cron veya harici scheduler tarafından çağrılır.
 *
 * GET /api/cron/macro
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Phase 4.5
 */

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Auth — dual: Vercel Cron header veya Bearer token
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '')?.trim();
  const isManualAuth = CRON_SECRET && token && token === CRON_SECRET;
  if (!isVercelCron && !isManualAuth) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase config eksik.' }, { status: 500 });
  }

  try {
    // 1. Tüm makro verileri paralel çek
    const [macroSnapshot, turkeyData, fredData] = await Promise.all([
      fetchAllMacroQuotes(),
      fetchAllTurkeyMacro(),
      fetchAllFredData(),
    ]);

    // 2. Makro skor hesapla
    const scoreResult = calculateMacroScore(macroSnapshot, turkeyData, fredData);

    // 3. DB'ye kaydet (service role)
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from('macro_snapshots')
      .upsert(
        {
          snapshot_date: today,
          macro_score: scoreResult.score,
          wind: scoreResult.wind,
          // Çekirdek göstergeler
          vix:    macroSnapshot.vix?.price    ?? null,
          dxy:    macroSnapshot.dxy?.price    ?? null,
          us10y:  macroSnapshot.us10y?.price  ?? null,
          usdtry: macroSnapshot.usdtry?.price ?? null,
          // Risk iştahı + emtia + BIST (2026-04-25 eklendi)
          eem:     macroSnapshot.eem?.price     ?? null,
          brent:   macroSnapshot.brent?.price   ?? null,
          gold:    macroSnapshot.gold?.price    ?? null,
          silver:  macroSnapshot.silver?.price  ?? null,
          copper:  macroSnapshot.copper?.price  ?? null,
          bist100: macroSnapshot.bist100?.price ?? null,
          // Türkiye + ABD makro
          cds_5y:         turkeyData?.cds5y?.value           ?? null,
          policy_rate:    turkeyData?.policyRate?.value      ?? null,
          inflation:      turkeyData?.inflation?.value       ?? null,
          tr_10y:         turkeyData?.bond10y?.value          ?? null,
          fed_funds_rate: fredData?.fedFundsRate?.latestValue ?? null,
          components: scoreResult.components,
        },
        { onConflict: 'snapshot_date' }
      );

    if (error) {
      console.error('[cron/macro] DB upsert hatası:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      date: today,
      score: scoreResult.score,
      wind: scoreResult.wind,
      label: scoreResult.label,
      componentsCount: scoreResult.components.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[cron/macro] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
