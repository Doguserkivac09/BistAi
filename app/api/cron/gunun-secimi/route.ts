/**
 * Günün Seçimi Cron
 * GET /api/cron/gunun-secimi
 * Schedule: Her iş günü 09:15 UTC (12:15 TRT) — sabah scan-cache'den sonra
 *
 * scan_cache'den en güçlü kısa vade kurulumunu seçer:
 *   confluence >= 65 + MTF uyum + R/R >= 2.0 + yukari yönlü
 * Claude Haiku ile 2-3 cümle gerekçe üretir, ai_cache'e kaydeder.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { bistGuard } from '@/lib/bist-guard';
import { getSectorId, getSector } from '@/lib/sectors';
import type { StockSignal } from '@/types';
import type { GununSecimiData } from '@/app/api/gunun-secimi/route';

const CRON_SECRET = process.env.CRON_SECRET;

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const isVercel = req.headers.get('x-vercel-cron') === '1';
  const token    = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercel && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guard = bistGuard();
  if (guard) return guard;

  const today    = new Date().toISOString().slice(0, 10);
  const cacheKey = `gunun-secimi:${today}`;
  const db       = createAdmin();

  // Bugün zaten üretilmiş mi?
  const { data: existing } = await db
    .from('ai_cache')
    .select('explanation')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing?.explanation) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Bugün zaten üretildi', cacheKey });
  }

  // scan_cache'den en iyi kurulumu bul
  const { data: scanRows, error: scanErr } = await db
    .from('scan_cache')
    .select('sembol, confluence_score, signals_json, last_close, rel_vol5')
    .gte('confluence_score', 65)
    .order('confluence_score', { ascending: false })
    .limit(100);

  if (scanErr || !scanRows?.length) {
    return NextResponse.json(
      { error: 'scan_cache boş veya sorgu hatası', detail: scanErr?.message },
      { status: 500 },
    );
  }

  let bestPick: {
    sembol:       string;
    adjustedScore: number;
    entryPrice:   number;
    signal:       StockSignal;
    relVol5:      number | null;
  } | null = null;

  for (const row of scanRows) {
    const signals = (Array.isArray(row.signals_json) ? row.signals_json : []) as StockSignal[];
    const best = signals
      .filter((s) => s.direction === 'yukari' && (s.riskRewardRatio ?? 0) >= 2 && s.weeklyAligned === true)
      .sort((a, b) => (b.riskRewardRatio ?? 0) - (a.riskRewardRatio ?? 0))[0];

    if (best && row.last_close) {
      bestPick = {
        sembol:        row.sembol,
        adjustedScore: row.confluence_score ?? 65,
        entryPrice:    row.last_close,
        signal:        best,
        relVol5:       row.rel_vol5,
      };
      break; // confluence_score'a göre sıralı — ilk eşleşme en iyi
    }
  }

  if (!bestPick) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Kriterleri karşılayan hisse bulunamadı' });
  }

  // Claude Haiku ile gerekçe üret
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let gerekce  = '';

  if (apiKey) {
    try {
      const anthropic  = new Anthropic({ apiKey });
      const sectorId   = getSectorId(bestPick.sembol);
      const sektorAdi  = getSector(sectorId).shortName;
      const s          = bestPick.signal;

      const userPrompt = `Hisse: ${bestPick.sembol} (${sektorAdi})
Teknik sinyal: ${s.type} — AL, ${s.severity}
Confluence skoru: ${bestPick.adjustedScore}/100
Giriş fiyatı: ${bestPick.entryPrice.toFixed(2)}₺
Stop-loss: ${s.stopLoss != null ? s.stopLoss.toFixed(2) + '₺' : 'yok'}
Hedef fiyat: ${s.targetPrice != null ? s.targetPrice.toFixed(2) + '₺' : 'yok'}
Risk/Ödül: ${s.riskRewardRatio != null ? s.riskRewardRatio.toFixed(1) : '—'}
Haftalık trend: uyumlu (MTF onaylı)
Göreceli hacim (5g): ${bestPick.relVol5 != null ? bestPick.relVol5.toFixed(1) + 'x' : '—'}

Bu hissenin bugünkü teknik kurulumunu, neden bugün için seçildiğini ve yatırımcının dikkat etmesi gereken kilit noktayı 2-3 cümleyle açıkla. Somut fiyat ve skor referansları kullan.`;

      const resp = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 220,
        system:     'Sen Investable Edge\'ın baş teknik analistisin. Türk bireysel yatırımcılara "bugünün en güçlü teknik kurulumu" seçimini kısa, güvenilir ve somut biçimde açıklıyorsun. Spekülatif dil kullanma. Maksimum 3 cümle.',
        messages:   [{ role: 'user', content: userPrompt }],
      });

      const textBlock = resp.content.find((b) => b.type === 'text');
      gerekce = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';
    } catch (e) {
      console.error('[cron/gunun-secimi] Claude hatası:', e);
    }
  }

  const s         = bestPick.signal;
  const sectorId  = getSectorId(bestPick.sembol);
  const sektorAdi = getSector(sectorId).shortName;

  const pickData: GununSecimiData = {
    sembol:          bestPick.sembol,
    gerekce,
    adjustedScore:   bestPick.adjustedScore,
    entryPrice:      bestPick.entryPrice,
    stopLoss:        s.stopLoss ?? null,
    targetPrice:     s.targetPrice ?? null,
    riskRewardRatio: s.riskRewardRatio ?? null,
    direction:       'yukari',
    sinyaller:       [s.type],
    weeklyAligned:   true,
    sektorAdi,
    relVol5:         bestPick.relVol5,
    generatedAt:     new Date().toISOString(),
  };

  // Ertesi gün 03:00 UTC'de expire (sabah scan-cache'den önce)
  const expires = new Date();
  expires.setDate(expires.getDate() + 1);
  expires.setUTCHours(3, 0, 0, 0);

  await db.from('ai_cache').upsert({
    cache_key:   cacheKey,
    explanation: JSON.stringify(pickData),
    version:     3,
    hit_count:   0,
    expires_at:  expires.toISOString(),
  }, { onConflict: 'cache_key' });

  return NextResponse.json({
    ok:          true,
    sembol:      pickData.sembol,
    score:       pickData.adjustedScore,
    cacheKey,
    generatedAt: pickData.generatedAt,
  });
}
