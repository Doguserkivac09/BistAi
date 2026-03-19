/**
 * AI Topluluk Botu — Phase 12
 *
 * Premium kullanıcıların paylaştığı topluluk postlarını analiz eder
 * ve "AI Analist" kimliğiyle otomatik yorum üretir.
 *
 * Rate limit: 1 AI yorum/post, 100/gün global
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sen BistAI'ın AI Analist botsun. Türk borsa yatırımcılarının paylaşımlarını analiz edip kısa, değer katan yorumlar yazıyorsun.

Kurallar:
- Maksimum 3-4 cümle yaz.
- Sade Türkçe kullan, teknik jargonu minimumda tut.
- Paylaşımın kategorisine göre uygun perspektif al:
  • analiz → teknik/makro açıdan değerlendir, varsa eksik noktaları belirt.
  • strateji → risk/getiri dengesini değerlendir.
  • haber → etkisini BIST bağlamında yorumla.
  • soru → doğrudan ve pratik cevap ver.
  • genel → konuya uygun, nötr bir bakış açısı sun.
- Asla kesin alım/satım tavsiyesi verme ("X hissesini AL" gibi).
- Cevabının başına "AI Analist:" gibi bir etiket koyma, düz metin yaz.`;

export interface CommunityAIInput {
  postTitle: string;
  postBody: string;
  category: 'genel' | 'analiz' | 'haber' | 'soru' | 'strateji';
  sembol?: string | null;
  authorTier: 'free' | 'pro' | 'premium';
}

export interface CommunityAIResult {
  comment: string;
  model: string;
}

/**
 * Post içeriğine göre AI yorumu üretir.
 * Yalnızca premium post sahipleri için çalışır.
 */
export async function generateCommunityComment(
  input: CommunityAIInput
): Promise<CommunityAIResult> {
  const { postTitle, postBody, category, sembol, authorTier } = input;

  if (authorTier !== 'premium') {
    throw new Error('AI bot yalnızca premium kullanıcı postları için çalışır.');
  }

  const sembolPart = sembol ? ` (Hisse: ${sembol})` : '';
  const userMessage = `Kategori: ${category}${sembolPart}

Başlık: ${postTitle}

İçerik:
${postBody.slice(0, 1500)}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const comment = (response.content[0] as { type: string; text: string }).text.trim();

  return { comment, model: response.model };
}

// ── Global Rate Limit (Supabase tabanlı) ───────────────────────────

/**
 * Bugün toplam kaç AI yorum üretildi?
 * Limit: 100/gün
 */
export async function getAICommentCountToday(): Promise<number> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', 'ai-bot')
      .gte('created_at', today.toISOString());

    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Bu post için AI yorum var mı?
 */
export async function hasAICommentForPost(postId: string): Promise<boolean> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('author_id', 'ai-bot');

    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export const AI_BOT_DAILY_LIMIT = 100;
