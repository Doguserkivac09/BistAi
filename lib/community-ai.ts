/**
 * Phase 12: AI Topluluk Botu
 *
 * Kullanıcı post oluşturunca Claude AI otomatik olarak nesnel bir analiz
 * yorumu ekler. Yorum "AI Analist" badge'i ile gösterilir.
 *
 * Limitler:
 * - Post başına 1 AI yorumu (ai_comment_generated flag ile korunur)
 * - Global günlük limit: 100 yorum/gün (in-memory, yeterli başlangıç)
 *
 * Premium Gate:
 * - AI yorum içeriği yalnızca premium kullanıcılara açık
 * - Diğerleri blur + upgrade CTA görür (UI tarafında uygulanır)
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from './rate-limit';

// ── System Prompt ─────────────────────────────────────────────────────

const COMMUNITY_AI_SYSTEM_PROMPT = `Sen Investable Edge'ın topluluk analiz asistanısın. BIST yatırımcılarının toplulukta paylaştığı analizleri ve yorumları değerlendirip kısa, nesnel bir yapay zeka perspektifi sunuyorsun.

Kurallar:
- Türkçe yaz, sade ve anlaşılır ol.
- Maksimum 4-5 cümle yaz.
- Eğer bir hisse sembolü varsa, genel sektörel veya teknik bir bağlam ekle.
- Yapıcı, tarafsız ve bilgilendirici ol.
- Kesinlikle "al" veya "sat" tavsiyesi verme — sadece bağlam ve bilgi sun.
- Yanıtı her zaman şu uyarıyla bitir: "⚠️ Bu analiz yapay zeka tarafından üretilmiştir, yatırım tavsiyesi değildir."`;

// ── Yorum Üretme ─────────────────────────────────────────────────────

export interface CommunityPost {
  title: string;
  body: string;
  sembol: string | null;
  category: string;
}

/**
 * Post içeriğine göre AI analiz yorumu üretir.
 * Hata durumunda null döner (sessizce başarısız olur).
 */
export async function generateCommunityAIComment(post: CommunityPost): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Global günlük rate limit: 100 AI yorumu / gün
  const globalRL = checkRateLimit('ai-community:global', 100, 86_400_000);
  if (!globalRL.allowed) return null;

  const sembolLine = post.sembol ? `\nHisse Sembolü: ${post.sembol}` : '';
  const userPrompt = `Bir kullanıcı toplulukta şu paylaşımı yaptı:

Kategori: ${post.category}${sembolLine}
Başlık: ${post.title}
İçerik: ${post.body}

Bu paylaşım için kısa ve nesnel bir yapay zeka analizi yaz.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      system: COMMUNITY_AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock && 'text' in textBlock ? textBlock.text.trim() : null;
  } catch {
    return null;
  }
}

// ── Yorumu DB'ye Kaydet ───────────────────────────────────────────────

/**
 * AI yorumunu veritabanına ekler ve postu işaretler.
 * service_role key kullanır (RLS bypass) — sadece server-side çağrılmalı.
 */
export async function postAIComment(postId: string, post: CommunityPost): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Post zaten AI yorum almış mı?
  const { data: postData } = await supabase
    .from('posts')
    .select('ai_comment_generated')
    .eq('id', postId)
    .single();

  if (postData?.ai_comment_generated) return;

  // AI yorum üret
  const aiBody = await generateCommunityAIComment(post);
  if (!aiBody) return;

  // Yorumu ekle (author_id null = AI bot)
  const { error } = await supabase.from('comments').insert({
    post_id: postId,
    author_id: null,
    body: aiBody,
    is_ai: true,
  });

  if (!error) {
    // Postu işaretle — bir daha oluşturulmasın
    await supabase
      .from('posts')
      .update({ ai_comment_generated: true })
      .eq('id', postId);
  }
}
