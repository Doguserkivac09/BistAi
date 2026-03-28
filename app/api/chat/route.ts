/**
 * AI Sohbet — Streaming Chat API
 *
 * POST /api/chat
 * Body: { messages: ChatMessage[], context?: ChatContext }
 *
 * Kullanıcı portföyü + güncel sinyaller + makro durumu ile
 * kişiselleştirilmiş BIST yatırım asistanı.
 *
 * Model: claude-opus-4-6 (karmaşık finansal muhakeme için)
 * Rate limit: 20 mesaj/dakika per IP
 * Auth: zorunlu (giriş yapmış kullanıcı)
 * Tier gating: free → 5 mesaj/gün, pro → 50/gün, premium → sınırsız
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;

// Günlük mesaj limitleri (tier başına)
const DAILY_LIMITS: Record<string, number> = {
  free: 5,
  pro: 50,
  premium: 99999,
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  sembol?: string;          // Hisse bağlamı (ör: THYAO)
  portfolyoOzet?: string;   // Portföy özeti metni
  sinyalOzet?: string;      // Güncel sinyal özeti
  makroOzet?: string;       // Makro durum özeti
}

// ── System Prompt ────────────────────────────────────────────────────

function buildSystemPrompt(ctx: ChatContext, userEmail: string): string {
  const now = new Date().toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric', weekday: 'long',
  });

  let system = `Sen BistAI'nin AI yatırım asistanısın. Türkiye Borsa İstanbul (BIST) uzmanısın.

Bugünün tarihi: ${now}
Kullanıcı: ${userEmail.split('@')[0]}

GÖREV:
- BIST hisselerine yönelik teknik ve temel analiz soruları yanıtla
- Makroekonomik faktörlerin (USD/TRY, faiz, enflasyon) hisse senetlerine etkisini açıkla
- Portföy çeşitlendirmesi ve risk yönetimi konusunda rehberlik et
- Sinyalleri, grafik örüntülerini Türkçe anlat

KURALLAR:
- Kesinlikle "al" veya "sat" tavsiyesi verme — yatırım kararı kullanıcıya ait
- "Bu bilgi yatırım tavsiyesi değildir" ibaresini gerekli yerlerde kullan
- Yanıtları kısa ve aksiyon odaklı tut (3-5 cümle ideal)
- Türkçe konuş, teknik terimleri gerektiğinde İngilizce bırak
- Sayıları ve yüzdeleri somut göster
- Emin olmadığın şeylerde "güncel veriye bakmak gerekir" de`;

  if (ctx.sembol) {
    system += `\n\nMEVCUT BAĞLAM — ${ctx.sembol} hissesi tartışılıyor.`;
  }

  if (ctx.portfolyoOzet) {
    system += `\n\nKULLANICININ PORTFÖYÜ:\n${ctx.portfolyoOzet}`;
  }

  if (ctx.sinyalOzet) {
    system += `\n\nGÜNCEL SİNYALLER:\n${ctx.sinyalOzet}`;
  }

  if (ctx.makroOzet) {
    system += `\n\nMAKRO DURUM:\n${ctx.makroOzet}`;
  }

  return system;
}

// ── Günlük mesaj sayısı kontrolü ─────────────────────────────────────

async function getDailyCount(userId: string): Promise<number> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey);

    const today = new Date().toISOString().slice(0, 10);
    const { count } = await admin
      .from('ai_chat_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00Z`);

    return count ?? 0;
  } catch {
    return 0;
  }
}

async function recordUsage(userId: string): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey);
    await admin.from('ai_chat_usage').insert({ user_id: userId });
  } catch { /* sessizce geç */ }
}

// ── Portföy özeti inşa et ─────────────────────────────────────────────

async function buildPortfolioSummary(userId: string): Promise<string> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data } = await admin
      .from('portfolyo_pozisyonlar')
      .select('sembol, miktar, alis_fiyati')
      .eq('user_id', userId)
      .limit(20);

    if (!data || data.length === 0) return '';

    const lines = (data as Array<{ sembol: string; miktar: number; alis_fiyati: number }>)
      .map(p => `${p.sembol}: ${p.miktar} lot @ ${p.alis_fiyati.toFixed(2)}₺`)
      .join(', ');

    return `${data.length} hisse: ${lines}`;
  } catch {
    return '';
  }
}

// ── Ana Handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`chat:${ip}`, RATE_LIMIT, WINDOW_MS);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Çok fazla istek. Lütfen bekleyin.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) },
    });
  }

  // Auth
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Giriş yapmanız gerekiyor.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Tier + günlük limit
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .single();

  const tier = (profile?.tier as string) ?? 'free';
  const dailyLimit = DAILY_LIMITS[tier] ?? DAILY_LIMITS.free;
  const dailyCount = await getDailyCount(user.id);

  if (dailyCount >= dailyLimit) {
    return new Response(JSON.stringify({
      error: `Günlük ${dailyLimit} mesaj limitine ulaştınız. ${tier === 'free' ? 'Pro plana geçerek 50 mesaja çıkabilirsiniz.' : 'Yarın tekrar deneyin.'}`,
      limitReached: true,
      tier,
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  // Body parse
  let messages: ChatMessage[] = [];
  let context: ChatContext = {};
  try {
    const body = await request.json();
    messages = Array.isArray(body.messages) ? body.messages.slice(-20) : []; // son 20 mesaj
    context  = body.context ?? {};
  } catch {
    return new Response(JSON.stringify({ error: 'Geçersiz istek.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Mesaj boş olamaz.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Son mesaj user olmalı
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role !== 'user' || !lastMsg.content.trim()) {
    return new Response(JSON.stringify({ error: 'Son mesaj kullanıcıdan gelmelidir.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Portföy bağlamını otomatik ekle (context'te yoksa)
  if (!context.portfolyoOzet) {
    context.portfolyoOzet = await buildPortfolioSummary(user.id);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI servisi yapılandırılmamış.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Kullanım kaydet
  await recordUsage(user.id);

  // Streaming response
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildSystemPrompt(context, user.email ?? '');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        });

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            const data = `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        }

        // Kullanım bilgisini gönder
        const remaining = Math.max(0, dailyLimit - dailyCount - 1);
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ done: true, remaining, dailyLimit })}\n\n`
        ));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI yanıt üretemedi.';
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ error: msg })}\n\n`
        ));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
