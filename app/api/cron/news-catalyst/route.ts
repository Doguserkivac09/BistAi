/**
 * Haber Katalisti Precompute Cron
 *
 * Fırsatlar sayfasındaki aktif teknik sinyal setindeki sembolleri alır, her biri için
 * news-impact (materyalite + event-study) çalıştırıp tek-sembol KATALİST özetini
 * çıkarır ve ai_cache'e TEK satır olarak yazar (migration YOK).
 *
 * /api/firsatlar bu satırı tek sorguyla okur → istek-zamanı haber fan-out'u YOK.
 * Kural-tabanlı (AI çağrısı yok) → bütçe yakmaz, deterministik.
 *
 * GET /api/cron/news-catalyst
 * Header: Authorization: Bearer <CRON_SECRET>  (veya x-vercel-cron: 1)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { fetchSymbolNews } from '@/lib/symbol-news';
import { rankNewsImpact, deriveCatalyst, type SymbolCatalyst } from '@/lib/news-impact';
import { bistGuard } from '@/lib/bist-guard';

export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;
const MIN_CONFLUENCE = 45;
const LOOKBACK_DAYS  = 5;
const MAX_SYMBOLS    = 70;   // maliyet/süre sınırı (en yüksek confluence'lılar)
const BATCH_SIZE     = 5;
const BATCH_DELAY_MS = 400;  // Google News / Yahoo rate limit
const CACHE_KEY      = 'news-catalyst:BIST';

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

  // 1) Aktif fırsat sembollerini al (en yüksek confluence'lılar)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  const { data: sigRows, error: sigErr } = await supabase
    .from('signal_performance')
    .select('sembol, confluence_score')
    .eq('evaluated', false)
    .eq('market', 'BIST')
    .gte('entry_time', cutoff.toISOString())
    .gte('confluence_score', MIN_CONFLUENCE)
    .order('confluence_score', { ascending: false });

  if (sigErr) {
    return NextResponse.json({ error: sigErr.message }, { status: 500 });
  }

  // Sembol başına en yüksek confluence — dedupe, sırayı koru
  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const r of (sigRows ?? []) as { sembol: string }[]) {
    if (!r.sembol || seen.has(r.sembol)) continue;
    seen.add(r.sembol);
    symbols.push(r.sembol);
    if (symbols.length >= MAX_SYMBOLS) break;
  }

  if (symbols.length === 0) {
    return NextResponse.json({ ok: true, message: 'Aktif sinyal yok', count: 0 });
  }

  // 2) Endeks mumlarını bir kez çek
  const { candles: indexCandles } = await fetchOHLCV('XU100.IS', 90);

  // 3) Her sembol için katalist çıkar (batch + delay)
  const items: Record<string, SymbolCatalyst> = {};
  let withCatalyst = 0;
  const failed: string[] = [];

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (sembol) => {
        try {
          const [news, stock] = await Promise.all([
            fetchSymbolNews(sembol),
            fetchOHLCV(sembol, 90),
          ]);
          if (!stock.candles || stock.candles.length < 6 || news.length === 0) return;
          const result = rankNewsImpact(news, stock.candles, indexCandles ?? []);
          const cat = deriveCatalyst(sembol, result);
          if (cat) { items[sembol] = cat; withCatalyst++; }
        } catch {
          failed.push(sembol);
        }
      }),
    );
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // 4) ai_cache'e tek satır yaz
  const payload = JSON.stringify({ generatedAt: new Date().toISOString(), items });
  const { error: writeErr } = await supabase.from('ai_cache').upsert({
    cache_key: CACHE_KEY,
    explanation: payload,
    version: 4,
    hit_count: 0,
    expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: 'cache_key' });

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    scanned: symbols.length,
    withCatalyst,
    failed: failed.length,
    durationMs: Date.now() - startedAt,
  });
}
