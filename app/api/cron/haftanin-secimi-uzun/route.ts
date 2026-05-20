/**
 * Haftanın Seçimi (Uzun Vade) Cron
 * GET /api/cron/haftanin-secimi-uzun
 * Schedule: Her Pazartesi 06:45 UTC (09:45 TRT)
 *
 * /api/uzun-vade-firsatlar sonuçlarından en güçlü uzun vade fırsatı seçer:
 *   investmentScore >= 65 + valuation upside >= 15% + cift_onay veya deger_firsati
 * Claude Haiku ile 2-3 cümle gerekçe üretir, ai_cache'e kaydeder.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { bistGuard } from '@/lib/bist-guard';
import type { LongTermResult } from '@/app/api/uzun-vade-firsatlar/route';
import type { HaftaninSecimiData } from '@/app/api/haftanin-secimi/route';

const CRON_SECRET = process.env.CRON_SECRET;

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `haftanin-secimi-uzun:${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const isVercel = req.headers.get('x-vercel-cron') === '1';
  const token    = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercel && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pazar günü de çalışsın (Pazartesi açılışı için veri hazır olsun)
  // Ama Cumartesi atla
  const guard = bistGuard();
  if (guard) return guard;

  const cacheKey = getWeekKey(new Date());
  const db       = createAdmin();

  // Bu hafta zaten üretilmiş mi?
  const { data: existing } = await db
    .from('ai_cache')
    .select('explanation')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing?.explanation) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Bu hafta zaten üretildi', cacheKey });
  }

  // Uzun vade sonuçlarını al — dahili API çağrısı
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  let results: LongTermResult[] = [];
  try {
    const res = await fetch(`${baseUrl}/api/uzun-vade-firsatlar`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { results: LongTermResult[] };
    results = json.results ?? [];
  } catch (e) {
    console.error('[cron/haftanin-secimi-uzun] uzun-vade-firsatlar fetch hatası:', e);
    return NextResponse.json({ error: 'uzun-vade-firsatlar alınamadı' }, { status: 500 });
  }

  if (!results.length) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Uzun vade sonuç yok' });
  }

  // En iyi seçim: investmentScore >= 65 + upside >= 15% + cift_onay öncelikli
  const candidates = results
    .filter((r) => r.investmentScore >= 65 && (r.valuation?.upside ?? 0) >= 15)
    .sort((a, b) => {
      // cift_onay önce, sonra investmentScore + upside ağırlıklı
      const catScore = (r: LongTermResult) => r.category === 'cift_onay' ? 20 : r.category === 'deger_firsati' ? 10 : 0;
      const totalA = a.investmentScore + catScore(a) + Math.min((a.valuation?.upside ?? 0), 40);
      const totalB = b.investmentScore + catScore(b) + Math.min((b.valuation?.upside ?? 0), 40);
      return totalB - totalA;
    });

  const pick = candidates[0] ?? results.sort((a, b) => b.investmentScore - a.investmentScore)[0];

  if (!pick) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Uygun uzun vade fırsat bulunamadı' });
  }

  // Claude Haiku ile gerekçe üret
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let gerekce  = '';

  if (apiKey) {
    try {
      const anthropic = new Anthropic({ apiKey });
      const v         = pick.valuation;

      const userPrompt = `Hisse: ${pick.sembol} (${pick.sectorName})
Kategori: ${pick.category === 'cift_onay' ? 'Çift Onay' : pick.category === 'deger_firsati' ? 'Değer Fırsatı' : 'Güçlü Temel'}
Yatırım Skoru: ${pick.investmentScore}/100 (${pick.investmentRating})
Güncel Fiyat: ${pick.lastPrice != null ? pick.lastPrice.toFixed(2) + '₺' : '—'}
Kurumsal Hedef: ${v?.target != null ? v.target.toFixed(2) + '₺' : '—'} (${v?.upside != null ? '+' + v.upside.toFixed(1) + '%' : '—'} potansiyel)
Değerleme Durumu: ${v?.status === 'undervalued' ? 'İskontolu' : v?.status === 'fair' ? 'Adil Değer' : 'Primli'}
F/K: ${pick.peRatio != null ? pick.peRatio.toFixed(1) + 'x' : '—'}
ROE: ${pick.returnOnEquity != null ? '%' + pick.returnOnEquity.toFixed(1) : '—'}
Temettü: ${pick.dividendYield != null && pick.dividendYield > 0 ? '%' + (pick.dividendYield * 100).toFixed(1) : 'yok'}

Bu hissenin neden bu hafta için seçildiğini, temel güçlü yönlerini ve uzun vadeli potansiyelini 2-3 cümleyle açıkla. Somut sayısal referanslar kullan.`;

      const resp = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 220,
        system:     'Sen Investable Edge\'ın temel analiz uzmanısın. Türk bireysel yatırımcılara "haftanın en güçlü uzun vade fırsatını" kısa, güvenilir ve somut biçimde açıklıyorsun. Spekülatif dil kullanma. Maksimum 3 cümle.',
        messages:   [{ role: 'user', content: userPrompt }],
      });

      const textBlock = resp.content.find((b) => b.type === 'text');
      gerekce = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';
    } catch (e) {
      console.error('[cron/haftanin-secimi-uzun] Claude hatası:', e);
    }
  }

  const pickData: HaftaninSecimiData = {
    sembol:          pick.sembol,
    gerekce,
    investmentScore: pick.investmentScore,
    lastPrice:       pick.lastPrice,
    peRatio:         pick.peRatio,
    returnOnEquity:  pick.returnOnEquity,
    valUpside:       pick.valuation?.upside ?? null,
    valTarget:       pick.valuation?.target ?? null,
    valStatus:       (pick.valuation?.status as HaftaninSecimiData['valStatus']) ?? null,
    category:        pick.category,
    sectorName:      pick.sectorName,
    beta:            pick.beta,
    dividendYield:   pick.dividendYield,
    generatedAt:     new Date().toISOString(),
  };

  // Gelecek Pazartesi 05:00 UTC'de expire
  const expires  = new Date();
  const daysUntilMonday = (8 - expires.getUTCDay()) % 7 || 7;
  expires.setUTCDate(expires.getUTCDate() + daysUntilMonday);
  expires.setUTCHours(5, 0, 0, 0);

  await db.from('ai_cache').upsert({
    cache_key:   cacheKey,
    explanation: JSON.stringify(pickData),
    version:     4,
    hit_count:   0,
    expires_at:  expires.toISOString(),
  }, { onConflict: 'cache_key' });

  return NextResponse.json({
    ok:          true,
    sembol:      pickData.sembol,
    score:       pickData.investmentScore,
    cacheKey,
    generatedAt: pickData.generatedAt,
  });
}
