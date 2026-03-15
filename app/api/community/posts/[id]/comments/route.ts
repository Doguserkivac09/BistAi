import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

/**
 * Yorum API
 *
 * POST /api/community/posts/[id]/comments → Yeni yorum ekle
 *
 * Phase 10.2
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;

    // Rate limit: 30 yorum / 1 saat
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`community-comment:${ip}`, 30, 3600_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Çok fazla yorum yaptınız. Lütfen bekleyin.' },
        { status: 429 }
      );
    }

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const content = typeof body.body === 'string' ? body.body.trim() : '';
    const parentId = typeof body.parent_id === 'string' ? body.parent_id : null;

    if (content.length < 1 || content.length > 2000) {
      return NextResponse.json({ error: 'Yorum 1-2000 karakter olmalı.' }, { status: 400 });
    }

    // Post var mı kontrol et
    const { data: post } = await supabase
      .from('posts')
      .select('id')
      .eq('id', postId)
      .eq('is_deleted', false)
      .single();

    if (!post) {
      return NextResponse.json({ error: 'Post bulunamadı.' }, { status: 404 });
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: user.id,
        parent_id: parentId,
        body: content,
      })
      .select(`
        *,
        author:profiles!comments_author_id_fkey(id, display_name, avatar_url, tier)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Yorum eklenemedi.' }, { status: 500 });
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
