/**
 * AI Tarama Özeti API
 *
 * POST /api/tarama/ai-summary
 *   → Streaming AI yorumu: tarama sonucundaki sinyalleri yatırımcı diliyle özetler.
 *
 * Auth + Pro/Premium gate. Saatlik cache + rate limit.
 */

import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase-server';
import { getMacroFull } from '@/lib/macro-service';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

const RATE_LIMIT = 10;
const WINDOW_MS  = 60_000;
const CACHE_TTL  = 30 * 60 * 1000; // 30 dk

const summaryCache = new Map<string, { text: string; ts: number }>();

interface SignalSummaryInput {
  type: string;
  count: number;
  alCount: number;
  satCount: number;
  strongCount: number;
}

interface SectorSummaryInput {
  shortName: string;
  count: number;
}

interface RequestBody {
  totalSignals: number;
  totalScanned: number;
  alCount: number;
  satCount: number;
  strongCount: number;
  signalBreakdown: SignalSummaryInput[];
  sectorBreakdown: SectorSummaryInput[];
  avgWinRate: number | null;
}

function buildPrompt(b: RequestBody, macroScore: number | null, macroWind: string | null): string {
  const topSignals = b.signalBreakdown.slice(0, 5);
  const topSectors = b.sectorBreakdown.slice(0, 5);

  const macroLine = macroScore !== null
    ? `Makro skor ${macroScore.toFixed(0)}/100 (${macroWind ?? 'nötr'})`
    : 'Makro veri alınamadı';

  return `Sen 10 yıldan fazla deneyimli BIST analistisin. Aşağıdaki tarama sonuçlarını incele ve KISA, NET bir Türkçe özet yaz.

## Veri
${macroLine}

Toplam: ${b.totalScanned} hisse tarandı, ${b.totalSignals} sinyal bulundu.
↑ AL: ${b.alCount} · ↓ SAT: ${b.satCount} · 💪 Güçlü: ${b.strongCount}
${b.avgWinRate !== null ? `Geçmiş ort. başarı: %${Math.round(b.avgWinRate * 100)}` : ''}

### En çok bulunan sinyaller
${topSignals.map((s) => `- ${s.type}: ${s.count} (${s.alCount} AL / ${s.satCount} SAT, ${s.strongCount} güçlü)`).join('\n')}

### Sinyal yoğun sektörler
${topSectors.map((s) => `- ${s.shortName}: ${s.count} sinyal`).join('\n')}

## Yazma Kuralları
1. **MAKSIMUM 3 paragraf, toplam 5-7 cümle.**
2. Sade Türkçe — finansçı olmayan yatırımcı anlasın.
3. Format:

**🌬️ Genel Tablo** (1 cümle): Piyasa AL ağırlıklı mı SAT ağırlıklı mı, makro destekliyor mu?

**📊 Öne Çıkan Sinyaller** (2-3 cümle): En çok bulunan 1-2 sinyal tipi neden yoğunlaştı? Hangi sektörlerde yoğun?

**⚠️ Dikkat** (1 cümle): Risk noktası, geçmiş başarı oranı düşükse uyar, sample size yetersizse söyle.

## Yasak
- "Yatırım tavsiyesi değildir" cümlesi — italik **sadece sonda**.
- "AL/SAT" tavsiyesi verme.
- "Görüldüğü üzere", "Özetle" gibi dolgu yok.
- Hisse adı verme (analiz sektör/sinyal seviyesinde).`;
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`tarama-ai:${ip}`, RATE_LIMIT, WINDOW_MS);
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

  const { data: profile } = await supabase
    .from('profiles').select('tier').eq('id', user.id).single();
  const tier = (profile?.tier as string) ?? 'free';
  if (tier === 'free') {
    return new Response(JSON.stringify({
      error: 'AI Tarama Özeti Pro ve Premium planlarda kullanılabilir.',
      upgrade: true,
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI servisi yapılandırılmamış.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Partial<RequestBody> = {};
  try { body = await request.json(); } catch { /* ignore */ }
  if (!body.totalSignals || !Array.isArray(body.signalBreakdown) || body.signalBreakdown.length === 0) {
    return new Response(JSON.stringify({ error: 'Yetersiz tarama verisi.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Cache key — sinyal sayısı + en üst 3 sinyal tipi (içerik benzerliği)
  const sigKey = (body.signalBreakdown ?? []).slice(0, 3).map((s) => `${s.type}-${s.count}`).join('|');
  const hour = new Date().toISOString().slice(0, 13);
  const cacheKey = `tarama-ai:${hour}:${body.totalSignals}:${sigKey}`;
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
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

  const prompt = buildPrompt(body as RequestBody, macroScore, macroWind);
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
