/**
 * Kâr Kalitesi API (Bilanço Öngörü B1).
 * GET /api/earnings-quality?symbol=ASELS
 *
 * İş Yatırım çeyreklik tablolarını çeker → standalone çeyreklere çevirir →
 * computeEarningsQuality ile "gerçekten kâr ediyor mu?" analizini döner.
 * ai_cache per-sembol (3 gün TTL — mali tablolar çeyreklik değişir, İş Yatırım'ı yorma).
 * Auth: gerekmez (public). Lisans: türetilmiş analiz döner, ham tablo DEĞİL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchIsyFinancials, toStandaloneQuarters, recentQuarterRefs } from '@/lib/isyatirim-financials';
import { computeEarningsQuality } from '@/lib/earnings-quality-engine';
import { fetchTurkeyInflation } from '@/lib/turkey-macro';
import { isUSSymbol } from '@/lib/us-symbols';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TTL_MS = 3 * 24 * 60 * 60 * 1000;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

export async function GET(req: NextRequest) {
  const sembol = (req.nextUrl.searchParams.get('symbol') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!sembol) return NextResponse.json({ error: 'symbol gerekli' }, { status: 400 });
  if (isUSSymbol(sembol)) return NextResponse.json({ applicable: false, reason: 'us', notes: ['Kâr kalitesi motoru BIST içindir (İş Yatırım kaynağı).'] });

  const sb = admin();
  const cacheKey = `earnings-quality:${sembol}`;

  // 1) Cache
  if (sb) {
    const { data } = await sb.from('ai_cache').select('explanation').eq('cache_key', cacheKey).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (data?.explanation) {
      try { return NextResponse.json({ ...JSON.parse(data.explanation), cached: true }); } catch { /* düş */ }
    }
  }

  try {
    // 2) İş Yatırım — geniş pencere (raporlama gecikmesi için 10 çeyrek iste)
    const now = new Date();
    const m = now.getUTCMonth();
    const nowQ = (m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4) as 1 | 2 | 3 | 4;
    const refs = recentQuarterRefs(now.getUTCFullYear(), nowQ, 10);
    const { isBank, periods } = await fetchIsyFinancials(sembol, refs);

    if (isBank) {
      const payload = { applicable: false, reason: 'bank', verdict: 'belirsiz', notes: ['Banka/finans — kâr kalitesi motoru sanayi/UFRS içindir (banka analizi ayrı faz).'] };
      return NextResponse.json(payload);
    }

    // Standalone çeyrekler → henüz açıklanmamış (hasılat null) olanları düş
    const quarters = toStandaloneQuarters(periods).filter((q) => q.fields.revenue != null);
    if (quarters.length === 0) {
      return NextResponse.json({ applicable: false, reason: 'no-data', verdict: 'belirsiz', notes: ['İş Yatırım\'da çeyreklik mali tablo bulunamadı.'] });
    }

    // 3) Enflasyon (TMS-29 tahmini için) — decimal
    let inflationRate: number | undefined;
    try { const infl = await fetchTurkeyInflation(); if (infl?.value) inflationRate = infl.value / 100; } catch { /* opsiyonel */ }

    const result = computeEarningsQuality(quarters, { inflationRate });
    const payload = { ...result, sembol, lastQuarter: quarters[quarters.length - 1]!.label, updatedAt: new Date().toISOString() };

    // 4) Cache yaz
    if (sb) {
      await sb.from('ai_cache').upsert({
        cache_key: cacheKey, explanation: JSON.stringify(payload), version: 1, hit_count: 0,
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
      }, { onConflict: 'cache_key' });
    }

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=3600' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Veri alınamadı';
    console.error(`[earnings-quality] ${sembol}:`, msg);
    return NextResponse.json({ applicable: false, reason: 'error', error: msg, notes: ['İş Yatırım verisi alınamadı.'] }, { status: 200 });
  }
}
