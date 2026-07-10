/**
 * VIOP Analiz Precompute Cron (FAZ V1 — VIOP-TRADINGVIEW-PLAN.md)
 *
 * Aktif VIOP kontratlarını (Faz A: XU030 yakın + sonraki vade) tarar; her biri için
 * proxy OHLCV + baz + makro/rejim bağlamı ile viop-engine çalıştırır ve sonucu
 * ai_cache 'viop-scan:BIST' TEK satırına yazar (migration YOK).
 *
 * /api/viop bu satırı tek sorguyla okur → istek-zamanı Yahoo/broker fan-out'u YOK
 * (scan-cache 17:50 timeout dersi). Kontrat sayısı küçük → maxDuration kısa yeter.
 *
 * GET /api/cron/viop-scan
 * Header: Authorization: Bearer <CRON_SECRET>  (veya x-vercel-cron: 1)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bistGuard } from '@/lib/bist-guard';
import { getActiveViopContracts, daysToExpiry } from '@/lib/viop-symbols';
import { deriveProxyFutures } from '@/lib/viop-basis';
import { fetchOHLCV } from '@/lib/yahoo';
import { analyzeViop, type ViopMacroContext } from '@/lib/viop-engine';
import { getMacroFull } from '@/lib/macro-service';

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;
const CACHE_KEY = 'viop-scan:BIST';
const OHLCV_DAYS = 180;
const TTL_MS = 60 * 60 * 1000; // 60dk — gün-içi taze

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const isManualAuth = CRON_SECRET && token === CRON_SECRET;
  if (!isVercelCron && !isManualAuth && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const guard = bistGuard();
  if (guard) return guard;

  const supabase = createAdminClient();
  const startedAt = Date.now();
  const now = new Date();

  // 1) Makro/rejim bağlamı (tüm kontratlar için ortak — endeks piyasası geneli)
  let macro: ViopMacroContext = {};
  try {
    const full = await getMacroFull();
    macro = {
      biasScore: full.macroScore.score,       // -100..+100
      label: full.macroScore.label,
      riskScore: full.riskScore.score,          // 0-100
    };
  } catch {
    macro = {}; // makro yoksa motor nötr davranır (zarif düşüş)
  }

  // 2) Aktif kontratları tara
  const contracts = getActiveViopContracts(now);
  const items: unknown[] = [];
  const failed: string[] = [];

  for (const contract of contracts) {
    try {
      const { candles } = await fetchOHLCV(contract.underlying, OHLCV_DAYS);
      if (!candles.length) { failed.push(contract.code); continue; }
      const proxy = deriveProxyFutures(candles, contract);
      const result = analyzeViop({
        contract,
        candles: proxy.candles,
        daysToExpiry: daysToExpiry(contract, now),
        basis: proxy.lastBasis,
        regime: proxy.regime,
        macro,
      });
      items.push(result);
    } catch {
      failed.push(contract.code);
    }
  }

  if (!items.length) {
    return NextResponse.json({ error: 'Hiç kontrat işlenemedi', failed }, { status: 502 });
  }

  // 3) ai_cache'e tek satır yaz
  const payload = JSON.stringify({ generatedAt: now.toISOString(), items });
  const { error: writeErr } = await supabase.from('ai_cache').upsert({
    cache_key: CACHE_KEY,
    explanation: payload,
    version: 1,
    hit_count: 0,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  }, { onConflict: 'cache_key' });

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    contracts: contracts.length,
    written: items.length,
    failed,
    durationMs: Date.now() - startedAt,
  });
}
