/**
 * Ekonomi Takvimi AI Makro Yorum
 *
 * POST /api/ekonomi-takvimi
 * Body: { events: EkonomiEvent[], windowDays?: number }
 *
 * Yaklaşan ekonomik olayları analiz eder:
 * - Bu haftanın kritik açıklamaları ne anlama geliyor?
 * - BIST için olası etki senaryoları
 * - Hangi sektörler/hisseler daha fazla etkilenebilir?
 *
 * Model: claude-opus-4-6
 * Cache: 8 saat (aynı event seti için)
 * Rate limit: 15 req/dakika per IP
 * Auth: zorunlu
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import type { EkonomiEvent } from '@/lib/ekonomi-takvimi';

const RATE_LIMIT = 15;
const WINDOW_MS  = 60_000;
const CACHE_TTL  = 8 * 60 * 60 * 1000; // 8 saat

const yorumCache = new Map<string, { yorum: string; ts: number }>();

function cacheKey(events: EkonomiEvent[]): string {
  const ids = events.map(e => e.id).sort().join(',');
  const date = new Date().toISOString().slice(0, 10);
  return `takvim:${date}:${ids.slice(0, 100)}`;
}

async function getDbCache(key: string): Promise<string | null> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await admin
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', key)
      .gt('expires_at', new Date().toISOString())
      .single();
    return data?.explanation ?? null;
  } catch { return null; }
}

async function setDbCache(key: string, yorum: string): Promise<void> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await admin.from('ai_cache').upsert({
      cache_key: key,
      explanation: yorum,
      version: 4,
      hit_count: 0,
      expires_at: new Date(Date.now() + CACHE_TTL).toISOString(),
    }, { onConflict: 'cache_key' });
  } catch { /* sessizce geç */ }
}

const ONEM_LABEL: Record<string, string> = {
  yuksek: '🔴 Yüksek',
  orta:   '🟡 Orta',
  dusuk:  '🟢 Düşük',
};

const ULKE_LABEL: Record<string, string> = {
  TR: '🇹🇷 Türkiye',
  US: '🇺🇸 ABD',
  EU: '🇪🇺 Avrupa',
};

function buildPrompt(events: EkonomiEvent[]): string {
  const now = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

  const yuksekOnem = events.filter(e => e.onem === 'yuksek');
  const digerler   = events.filter(e => e.onem !== 'yuksek');

  const formatEvent = (e: EkonomiEvent) => {
    const onem  = ONEM_LABEL[e.onem]  ?? e.onem;
    const ulke  = ULKE_LABEL[e.ulke]  ?? e.ulke;
    const beklenti = e.beklenti  ? ` | Beklenti: ${e.beklenti}`  : '';
    const onceki   = e.onceki    ? ` | Önceki: ${e.onceki}`      : '';
    const gercek   = e.gerceklesen ? ` | Gerçekleşen: ${e.gerceklesen}` : '';
    return `- ${e.tarih} ${e.saat} TRT | ${onem} | ${ulke} | **${e.baslik}**${beklenti}${onceki}${gercek}`;
  };

  return `Sen Türkiye Borsa İstanbul (BIST) makro analisti ve ekonomi uzmanısın.
Bugün: ${now}

AŞAĞIDAKİ EKONOMİK TAKVİM VERİLERİNİ ANALİZ ET:

### Yüksek Önem Olaylar (${yuksekOnem.length} adet):
${yuksekOnem.map(formatEvent).join('\n') || 'Yok'}

### Diğer Olaylar (${digerler.length} adet):
${digerler.map(formatEvent).join('\n') || 'Yok'}

GÖREV: Bu takvimi BIST yatırımcıları için yorumla.

YANIT FORMATI (kısa, pratik, Türkçe):

## 📅 Bu Haftanın Makro Gündem Özeti
2-3 cümle: En kritik olay(lar) ve genel tablo.

## 🎯 BIST İçin Kritik Açıklamalar
Her yüksek önemli olay için:
- **[Başlık]**: BIST'e olası etkisi, hangi sektörler etkilenir?
- Beklentinin üstünde/altında gelmesi senaryolarını açıkla

## 🏭 Etkilenecek Sektörler
Bu haftaki veriler göz önüne alındığında hangi sektörler öne çıkıyor veya risk altında?

## ⚡ Yatırımcı Notu
2-3 madde: Bu hafta dikkat edilmesi gerekenler.

*Bu analiz genel bilgi amaçlıdır, yatırım tavsiyesi değildir.*`;
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`ekon-takvim:${ip}`, RATE_LIMIT, WINDOW_MS);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Çok fazla istek.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Giriş yapmanız gerekiyor.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let events: EkonomiEvent[] = [];
  try {
    const body = await request.json();
    events = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
  } catch {
    return new Response(JSON.stringify({ error: 'Geçersiz istek.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (events.length === 0) {
    return new Response(JSON.stringify({ error: 'Olay listesi boş.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const key = cacheKey(events);

  // In-memory cache
  const mem = yorumCache.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL) {
    return Response.json({ yorum: mem.yorum, cached: true });
  }

  // DB cache
  const db = await getDbCache(key);
  if (db) {
    yorumCache.set(key, { yorum: db, ts: Date.now() });
    return Response.json({ yorum: db, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI servisi yapılandırılmamış.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = buildPrompt(events);
  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let acc = '';
        const s = client.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });
        for await (const chunk of s) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            acc += chunk.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
          }
        }
        yorumCache.set(key, { yorum: acc, ts: Date.now() });
        await setDbCache(key, acc);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI yanıt üretemedi.';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
