/**
 * VIOP Analiz Precompute Cron (çok-varlıklı — design_handoff_viop_hub)
 *
 * TÜM aktif VIOP kontratlarını (Endeksler XU030/XU100 + Bankalar tek-hisse vadeli +
 * Emtia Altın/Gümüş gram-TL + Döviz USD-TRY/EUR-TRY, her biri yakın+sonraki vade)
 * tarar; her biri için proxy OHLCV + baz + makro/rejim bağlamı ile viop-engine
 * çalıştırır ve sonucu ai_cache 'viop-scan:BIST' TEK satırına yazar (migration YOK).
 *
 * /api/viop bu satırı tek sorguyla okur → istek-zamanı Yahoo/broker fan-out'u YOK
 * (scan-cache 17:50 timeout dersi). Kontrat sayısı (~22) küçük → maxDuration kısa yeter;
 * lib/yahoo.ts'in 5dk bellek-içi cache'i aynı sembolün (ör. USDTRY=X, emtia sentezinde
 * de kullanılır) tekrar ağa gitmesini zaten engeller.
 *
 * GET /api/cron/viop-scan
 * Header: Authorization: Bearer <CRON_SECRET>  (veya x-vercel-cron: 1)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bistGuard } from '@/lib/bist-guard';
import { getAllActiveViopContracts, daysToExpiry, VIOP_UNDERLYINGS } from '@/lib/viop-symbols';
import { deriveProxyFutures, DEFAULT_ANNUAL_RATE } from '@/lib/viop-basis';
import { fetchUnderlyingCandles } from '@/lib/viop-data';
import { analyzeViop, type ViopMacroContext } from '@/lib/viop-engine';
import { getMacroFull } from '@/lib/macro-service';

export const maxDuration = 90;

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

  // 1) Makro/rejim bağlamı + CANLI TL risksiz faiz (baz/cost-of-carry girdisi).
  // Sabit %45 varsayımı yerine gerçek TCMB politika faizi kullanılır — baz doğrudan
  // (r − q)·T ile ölçeklendiği için yanlış faiz tüm giriş/stop/hedef seviyelerini kaydırır.
  let macro: ViopMacroContext = {};
  let annualRate = DEFAULT_ANNUAL_RATE;
  try {
    const full = await getMacroFull();
    macro = {
      biasScore: full.macroScore.score,       // -100..+100
      label: full.macroScore.label,
      riskScore: full.riskScore.score,          // 0-100
    };
    const policy = full.bundle.turkey?.policyRate?.value;
    // Makul aralık dışındaki değeri (veri hatası) yok say → sabit varsayıma düş
    if (typeof policy === 'number' && policy > 1 && policy < 200) annualRate = policy / 100;
  } catch {
    macro = {}; // makro yoksa motor nötr davranır (zarif düşüş)
  }

  // 2) Tüm dayanakların YAKIN vadeli kontratlarını tara (dayanak başına tek kontrat).
  // Dayanak bazında paralel — her dayanak kendi Yahoo çağrısını yapar; lib/yahoo'nun
  // 5dk bellek-içi cache'i emtia sentezindeki ortak USDTRY=X'i tekrar ağa çıkarmaz.
  const contracts = getAllActiveViopContracts(now);
  const failed: string[] = [];

  const settled = await Promise.all(
    contracts.map(async (contract) => {
      try {
        const def = VIOP_UNDERLYINGS[contract.underlying];
        const candles = await fetchUnderlyingCandles(contract.underlying, OHLCV_DAYS);
        if (!candles.length) { failed.push(contract.code); return null; }
        const proxy = deriveProxyFutures(candles, contract, annualRate, def.carryYield);
        return analyzeViop({
          contract,
          candles: proxy.candles,
          daysToExpiry: daysToExpiry(contract, now),
          basis: proxy.lastBasis,
          regime: proxy.regime,
          macro,
        });
      } catch {
        failed.push(contract.code);
        return null;
      }
    }),
  );
  const items = settled.filter((x) => x !== null);

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
    annualRatePct: parseFloat((annualRate * 100).toFixed(2)),
    failed,
    durationMs: Date.now() - startedAt,
  });
}
