/**
 * AI Sektör Özeti API
 *
 * POST /api/sectors/ai-summary
 *   → Streaming AI yorumu: bu hafta hangi sektörler ön planda, makro
 *     bağlamla birlikte yatırımcı dostu bir özet üretir.
 *
 * Auth + Pro/Premium gate. Saatlik cache + rate limit.
 */

import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase-server';
import { getMacroFull } from '@/lib/macro-service';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { SECTORS } from '@/lib/sectors';

const RATE_LIMIT = 10;
const WINDOW_MS  = 60_000;
const CACHE_TTL  = 60 * 60 * 1000; // 1 saat — sektör verileri günlük güncellenir

// In-memory cache (genel — kullanıcıya özgü değil çünkü içerik global)
const summaryCache = new Map<string, { text: string; ts: number }>();

interface SectorSummaryInput {
  shortName: string;
  perf5:  number | null;
  perf20: number | null;
  perf60: number | null;
  delta5v20: number | null;
}

function buildPrompt(
  sectors: SectorSummaryInput[],
  macroScore: number | null,
  macroWind: string | null,
): string {
  const sortedByPerf20 = [...sectors]
    .filter((s) => s.perf20 !== null)
    .sort((a, b) => (b.perf20 ?? 0) - (a.perf20 ?? 0));

  const top3 = sortedByPerf20.slice(0, 3);
  const bot3 = sortedByPerf20.slice(-3).reverse();

  const formatLine = (s: SectorSummaryInput) => {
    const p5  = s.perf5  !== null ? s.perf5.toFixed(1)  + '%' : '—';
    const p20 = s.perf20 !== null ? s.perf20.toFixed(1) + '%' : '—';
    const p60 = s.perf60 !== null ? s.perf60.toFixed(1) + '%' : '—';
    const dlt = s.delta5v20 !== null
      ? `(ivme ${s.delta5v20 > 0 ? '+' : ''}${s.delta5v20.toFixed(1)})`
      : '';
    return `- ${s.shortName}: 1H ${p5} / 1A ${p20} / 3A ${p60} ${dlt}`;
  };

  const macroLine = macroScore !== null
    ? `Makro skor ${macroScore.toFixed(0)}/100 (${macroWind ?? 'nötr'})`
    : 'Makro veri alınamadı';

  return `Sen 10 yıldan fazla deneyimli BIST analistisin. Aşağıdaki sektör verilerini incele ve KISA, NET bir Türkçe haftalık özet yaz.

## Veriler
${macroLine}

### En güçlü 3 sektör (1A performansa göre)
${top3.map(formatLine).join('\n')}

### En zayıf 3 sektör
${bot3.map(formatLine).join('\n')}

### Tüm sektörler
${sortedByPerf20.map(formatLine).join('\n')}

## Yazma Kuralları
1. **Maksimum 3 paragraf, toplam 6-8 cümle.** Uzun yazma.
2. Sade Türkçe — finansçı olmayan yatırımcı anlasın.
3. **Cevap formatı:**

**🌬️ Makro Bağlam** (1 cümle): TL durumu, faiz beklentisi, küresel risk → hangi sektörleri etkiler.

**📈 Bu Hafta Öne Çıkanlar** (2-3 cümle): En güçlü 1-2 sektörü neden öne çıktığını makro+momentum bağlamında açıkla. "Şu sebep şu sektörü destekliyor."

**⚠️ Dikkat** (1-2 cümle): En zayıf sektörden 1 tanesini neden zayıfladığını söyle. Veya bir sektörde tepe dönüşü/dipten dönüş varsa onu vurgula.

## Yasak
- "Bu yatırım tavsiyesi değildir" cümlesini ekle ama **sadece sonda, italik**.
- "AL/SAT" tavsiyesi verme.
- Kuru rakam tekrarlama. Anlamlı cümleler yaz.
- "Görüldüğü üzere", "Özetle" gibi dolgu kullanma.`;
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`sectors-ai:${ip}`, RATE_LIMIT, WINDOW_MS);
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

  // Tier gate
  const { data: profile } = await supabase
    .from('profiles').select('tier').eq('id', user.id).single();
  const tier = (profile?.tier as string) ?? 'free';
  if (tier === 'free') {
    return new Response(JSON.stringify({
      error: 'AI Sektör Özeti Pro ve Premium planlarda kullanılabilir.',
      upgrade: true,
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI servisi yapılandırılmamış.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Body'den summaries oku
  let body: { summaries?: SectorSummaryInput[] } = {};
  try { body = await request.json(); } catch { /* boş bırak */ }
  const inputSummaries = Array.isArray(body.summaries) ? body.summaries : [];
  if (inputSummaries.length < 5) {
    return new Response(JSON.stringify({ error: 'Yetersiz sektör verisi.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Geçerli kısa adlar — SECTORS map'inde olmayanları filtrele
  const validShortNames = new Set(Object.values(SECTORS).map((s) => s.shortName));
  const safeSummaries = inputSummaries.filter((s) => validShortNames.has(s.shortName));
  if (safeSummaries.length < 5) {
    return new Response(JSON.stringify({ error: 'Geçerli sektör verisi az.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Saatlik cache key — içerik kullanıcıdan bağımsız
  const cacheKey = `sectors-ai:${new Date().toISOString().slice(0, 13)}`;
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    // Cache vuruşunu da SSE formatında stream et — UI tek implementasyon kullanır
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cached.text, cached: true })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  }

  const macroFull = await getMacroFull().catch(() => null);
  const macroScore = macroFull?.macroScore?.score ?? null;
  const macroWind  = macroFull?.macroScore?.wind  ?? null;

  const prompt = buildPrompt(safeSummaries, macroScore, macroWind);
  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let accumulated = '';
        const s = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }],
        });
        for await (const chunk of s) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            accumulated += chunk.delta.text;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`,
            ));
          }
        }
        summaryCache.set(cacheKey, { text: accumulated, ts: Date.now() });
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
