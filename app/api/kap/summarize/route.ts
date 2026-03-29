/**
 * KAP Duyuru AI Özetleme
 *
 * POST /api/kap/summarize
 * Body: { duyurular: KapDuyuru[], sembol?: string }
 *
 * Son KAP duyurularını özetler + teknik sinyallerle bağlantı kurar:
 * - Hangi duyurular fiyatı etkileyebilir?
 * - Özel durum/finansal rapor → hangi sinyali güçlendirir/zayıflatır?
 * - Yatırımcının dikkat etmesi gerekenler
 *
 * Model: claude-haiku-4-5-20251001 (özetleme görevi için yeterli)
 * Cache: 4 saat (aynı sembol için tekrar çağrılmaz)
 * Rate limit: 20 req/dakika per IP
 * Auth: zorunlu
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import type { KapDuyuru } from '@/lib/kap';

const RATE_LIMIT = 20;
const WINDOW_MS  = 60_000;
const CACHE_TTL  = 12 * 60 * 60 * 1000; // 12 saat (KAP duyuruları günde 1-2 kez gelir)

// ── In-memory cache ──────────────────────────────────────────────────

const summaryCache = new Map<string, { summary: string; ts: number }>();

function getCacheKey(sembol: string | undefined, duyuruIds: Array<string | number>): string {
  const ids = duyuruIds.slice(0, 5).map(String).sort().join(',');
  return `kap:${sembol ?? 'all'}:${ids}`;
}

// ── Supabase ai_cache (opsiyonel kalıcı cache) ────────────────────────

async function getDbCache(cacheKey: string): Promise<string | null> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await admin
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();
    return data?.explanation ?? null;
  } catch { return null; }
}

async function setDbCache(cacheKey: string, summary: string): Promise<void> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await admin.from('ai_cache').upsert({
      cache_key: cacheKey,
      explanation: summary,
      version: 3,
      hit_count: 0,
      expires_at: new Date(Date.now() + CACHE_TTL).toISOString(),
    }, { onConflict: 'cache_key' });
  } catch { /* sessizce geç */ }
}

// ── Prompt ───────────────────────────────────────────────────────────

function buildPrompt(duyurular: KapDuyuru[], sembol?: string): string {
  const now = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const duyuruText = duyurular.slice(0, 8).map((d, i) =>
    `${i + 1}. [${d.kategoriAdi}] ${d.sirket}${d.sembol ? ` (${d.sembol})` : ''}\n   Başlık: ${d.baslik}\n   Tarih: ${d.tarih}`
  ).join('\n\n');

  return `Sen Türkiye Borsa İstanbul (BIST) analisti ve KAP uzmanısın.
Bugün: ${now}
${sembol ? `Analiz edilen hisse: ${sembol}` : ''}

Aşağıdaki son KAP duyurularını analiz et:

${duyuruText}

YANIT FORMATI (kısa ve odaklı — Türkçe):

## 📋 Özet
2-3 cümle: Bu duyurular birlikte ne anlatıyor?

## 🎯 Kritik Duyurular
${sembol ? `${sembol} için en önemli 1-2 duyuru ve fiyata olası etkisi.` : 'En önemli 1-2 duyuru ve piyasa etkisi.'}

## 📊 Sinyal Bağlantısı
Bu duyurular mevcut teknik sinyalleri nasıl etkiler?
- Özel Durum açıklamaları volatiliteyi artırabilir
- Finansal Rapor sinyalin yönünü teyit edebilir veya bozabilir
- Genel Kurul kararları uzun vadeli etkiye işaret edebilir

## ⚡ Dikkat Noktaları
2-3 madde: Yatırımcının KAP'tan çıkardığı en önemli mesajlar.

*Bu analiz genel bilgi amaçlıdır, yatırım tavsiyesi değildir.*`;
}

// ── Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`kap-summarize:${ip}`, RATE_LIMIT, WINDOW_MS);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Çok fazla istek.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) },
    });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Giriş yapmanız gerekiyor.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let duyurular: KapDuyuru[] = [];
  let sembol: string | undefined;
  try {
    const body = await request.json();
    duyurular = Array.isArray(body.duyurular) ? body.duyurular : [];
    sembol    = typeof body.sembol === 'string' ? body.sembol.trim().toUpperCase() : undefined;
  } catch {
    return new Response(JSON.stringify({ error: 'Geçersiz istek.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (duyurular.length === 0) {
    return new Response(JSON.stringify({ error: 'Duyuru listesi boş.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const cacheKey = getCacheKey(sembol, duyurular.map(d => d.id));

  // In-memory cache
  const memCached = summaryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.ts < CACHE_TTL) {
    return Response.json({ summary: memCached.summary, cached: true });
  }

  // DB cache
  const dbCached = await getDbCache(cacheKey);
  if (dbCached) {
    summaryCache.set(cacheKey, { summary: dbCached, ts: Date.now() });
    return Response.json({ summary: dbCached, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI servisi yapılandırılmamış.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = buildPrompt(duyurular, sembol);
  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const summary = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    if (!summary) throw new Error('Boş yanıt');

    // Cache'e yaz
    summaryCache.set(cacheKey, { summary, ts: Date.now() });
    await setDbCache(cacheKey, summary);

    return Response.json({ summary, cached: false });
  } catch (err) {
    console.error('[api/kap/summarize] AI hatası:', err);
    return new Response(JSON.stringify({ error: 'Teknik bir hata oluştu, lütfen tekrar deneyin.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
