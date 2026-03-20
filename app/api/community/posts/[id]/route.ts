import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * Tek post API
 *
 * GET    /api/community/posts/[id]  → Post detay + yorumlar
 * PATCH  /api/community/posts/[id]  → Post güncelle (sadece yazar)
 * DELETE /api/community/posts/[id]  → Soft delete (sadece yazar)
 *
 * Phase 10.2
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    // Post + author bilgisi
    const { data: post, error } = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_profile_fkey(id, display_name, avatar_url, tier)
      `)
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: 'Post bulunamadı.' }, { status: 404 });
    }

    // Yorumları çek (nested yapı için parent_id null olanları üst seviye olarak al)
    const { data: comments } = await supabase
      .from('comments')
      .select(`
        *,
        author:profiles!comments_author_profile_fkey(id, display_name, avatar_url, tier)
      `)
      .eq('post_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    // Kullanıcı bu postu beğenmiş mi?
    const { data: likeData } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('post_id', id)
      .maybeSingle();

    // Kullanıcının tier bilgisi (premium gate için)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      ...post,
      is_liked: !!likeData,
      comments: comments ?? [],
      user_tier: profileData?.tier ?? 'free',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (title.length < 3 || title.length > 200) {
        return NextResponse.json({ error: 'Başlık 3-200 karakter olmalı.' }, { status: 400 });
      }
      updates.title = title;
    }
    if (typeof body.body === 'string') {
      const content = body.body.trim();
      if (content.length < 10 || content.length > 5000) {
        return NextResponse.json({ error: 'İçerik 10-5000 karakter olmalı.' }, { status: 400 });
      }
      updates.body = content;
    }
    if (typeof body.category === 'string') {
      if (!['genel', 'analiz', 'haber', 'soru', 'strateji'].includes(body.category)) {
        return NextResponse.json({ error: 'Geçersiz kategori.' }, { status: 400 });
      }
      updates.category = body.category;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Güncellenecek alan belirtilmedi.' }, { status: 400 });
    }

    const { data: post, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', id)
      .eq('author_id', user.id)
      .select(`
        *,
        author:profiles!posts_author_profile_fkey(id, display_name, avatar_url, tier)
      `)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: 'Post güncellenemedi.' }, { status: 403 });
    }

    return NextResponse.json(post);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    // Soft delete
    const { error } = await supabase
      .from('posts')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('author_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Post silinemedi.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
