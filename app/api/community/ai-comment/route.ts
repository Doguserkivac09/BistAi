import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import {
  generateCommunityComment,
  getAICommentCountToday,
  hasAICommentForPost,
  AI_BOT_DAILY_LIMIT,
} from '@/lib/community-ai';

/**
 * AI Topluluk Botu Tetikleyici
 *
 * POST /api/community/ai-comment
 * Body: { postId: string }
 *
 * - Sadece post sahibi veya sistem çağırabilir (post oluşturulurken otomatik)
 * - Premium post → AI yorum üretir ve comments tablosuna yazar
 * - Rate limit: 1 AI yorum/post, 100/gün global
 *
 * Phase 12.2
 */

const AI_BOT_PROFILE_ID = 'ai-bot'; // profiles tablosunda sabit bir AI kullanıcısı

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const body = await request.json();
    const { postId } = body as { postId?: string };

    if (!postId || typeof postId !== 'string') {
      return NextResponse.json({ error: 'postId gerekli.' }, { status: 400 });
    }

    // Post'u çek
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, title, body, category, sembol, author_id, is_deleted')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: 'Post bulunamadı.' }, { status: 404 });
    }

    if (post.is_deleted) {
      return NextResponse.json({ error: 'Post silinmiş.' }, { status: 400 });
    }

    // Sadece post sahibi tetikleyebilir
    if (post.author_id !== user.id) {
      return NextResponse.json({ error: 'Yalnızca post sahibi AI yorum talep edebilir.' }, { status: 403 });
    }

    // Post sahibinin tier'ını çek
    const { data: profile } = await supabase
      .from('profiles')
      .select('tier')
      .eq('user_id', user.id)
      .single();

    const authorTier = (profile?.tier ?? 'free') as 'free' | 'pro' | 'premium';

    if (authorTier !== 'premium') {
      return NextResponse.json(
        { error: 'AI bot yalnızca premium üyeler için kullanılabilir.', requiresUpgrade: true },
        { status: 403 }
      );
    }

    // Bu post için daha önce AI yorum yazıldı mı?
    const alreadyCommented = await hasAICommentForPost(postId);
    if (alreadyCommented) {
      return NextResponse.json(
        { error: 'Bu post için AI yorum zaten mevcut.' },
        { status: 409 }
      );
    }

    // Günlük global limit kontrol
    const todayCount = await getAICommentCountToday();
    if (todayCount >= AI_BOT_DAILY_LIMIT) {
      return NextResponse.json(
        { error: 'Günlük AI yorum limiti doldu. Yarın tekrar deneyin.' },
        { status: 429 }
      );
    }

    // AI yorumu üret
    const { comment } = await generateCommunityComment({
      postTitle: post.title,
      postBody: post.body,
      category: post.category,
      sembol: post.sembol,
      authorTier,
    });

    // Supabase'e admin client ile yaz (ai-bot user olarak)
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: newComment, error: insertError } = await adminClient
      .from('comments')
      .insert({
        post_id: postId,
        author_id: AI_BOT_PROFILE_ID,
        body: comment,
        parent_id: null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('AI yorum kaydedilemedi:', insertError);
      return NextResponse.json(
        { error: 'AI yorum üretildi ama kaydedilemedi.' },
        { status: 500 }
      );
    }

    // comment_count güncelle
    await adminClient.rpc('increment_comment_count', { post_id: postId });

    return NextResponse.json({ success: true, comment: newComment });
  } catch (error) {
    console.error('AI comment error:', error);
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
