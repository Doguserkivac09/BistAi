/**
 * Ekonomi Takvimi AI Yorumu — streaming endpoint.
 * Yaklaşan ekonomik olayları AI ile yorumlar.
 *
 * POST /api/ekonomi-takvimi
 * Body: { events: EkonomiEvent[] }
 * Response: text/event-stream
 *
 * Pro/Premium kullanıcılara açık.
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import type { EkonomiEvent } from '@/lib/ekonomi-takvimi';

const client = new Anthropic();

function buildPrompt(events: EkonomiEvent[]): string {
  const liste = events
    .map((e) => {
      const onceki = e.onceki ? `, önceki: ${e.onceki}` : '';
      const beklenti = e.beklenti ? `, beklenti: ${e.beklenti}` : '';
      const gerceklesen = e.gerceklesen ? `, gerçekleşen: ${e.gerceklesen}` : '';
      return `• ${e.tarih} ${e.saat} TRT — [${e.ulke}] ${e.baslik}${onceki}${beklenti}${gerceklesen}`;
    })
    .join('\n');

  return `Aşağıdaki yaklaşan ve güncel ekonomik veriler listesi verilmiştir. Bu verilerin Türkiye borsası (BIST) ve Türk Lirası üzerindeki olası etkilerini kısa ve net bir şekilde analiz et. Özellikle:
1. Türkiye'deki TCMB faiz/TÜFE verilerinin piyasaya etkisi
2. ABD Fed kararları ve CPI'nin gelişmekte olan piyasalara (EM) ve TL'ye yansıması
3. Avrupa ECB kararlarının genel risk iştahına etkisi
4. Hangi sektörlerin bu verilerden en çok etkilenebileceği

Yanıtı 3-4 paragraf, Türkçe, pratik ve aksiyon odaklı yaz.

Ekonomik Takvim:
${liste}`;
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req.headers);
  const { allowed } = checkRateLimit(`ekonomi-takvimi:${ip}`, 5, 60_000);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Çok fazla istek. Lütfen biraz bekleyin.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Auth + tier kontrolü
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Giriş yapmanız gerekiyor.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Tier kontrolü: Pro veya Premium gerekli
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .single();

  if (!profile || profile.tier === 'free') {
    return new Response(
      JSON.stringify({ error: 'Bu özellik Pro ve Premium planlarda kullanılabilir.', upgrade: true }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let events: EkonomiEvent[] = [];
  try {
    const body = await req.json();
    events = Array.isArray(body.events) ? (body.events as EkonomiEvent[]).slice(0, 20) : [];
  } catch {
    return new Response(
      JSON.stringify({ error: 'Geçersiz istek.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: buildPrompt(events) }],
        });

        for await (const chunk of response) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            const data = `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        }

        controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI hatası.';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
