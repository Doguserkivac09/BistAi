import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

/**
 * Topluluk Posts API
 *
 * GET  /api/community/posts  → Feed (paginated, filterable)
 * POST /api/community/posts  → Yeni post oluştur
 *
 * Phase 10.2
 */

const POSTS_PER_PAGE = 20;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const category = searchParams.get('category');
    const sembol = searchParams.get('sembol');
    const authorId = searchParams.get('author');
    const sort = searchParams.get('sort') ?? 'newest'; // newest | popular

    let query = supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_profile_fkey(id, display_name, avatar_url, tier)
      `, { count: 'exact' })
      .eq('is_deleted', false);

    // Filters
    if (category && ['genel', 'analiz', 'haber', 'soru', 'strateji'].includes(category)) {
      query = query.eq('category', category);
    }
    if (sembol) {
      query = query.eq('sembol', sembol.toUpperCase());
    }
    if (authorId) {
      query = query.eq('author_id', authorId);
    }

    // Sort
    if (sort === 'popular') {
      query = query.order('like_count', { ascending: false }).order('created_at', { ascending: false });
    } else {
      query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    }

    // Pagination
    const from = (page - 1) * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;
    query = query.range(from, to);

    const { data: posts, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Postlar yüklenemedi.' }, { status: 500 });
    }

    // Kullanıcının beğendiği postları bul (bu sayfadakiler için)
    const postIds = (posts ?? []).map((p) => p.id);
    let likedPostIds: string[] = [];
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);
      likedPostIds = (likes ?? []).map((l) => l.post_id);
    }

    const enrichedPosts = (posts ?? []).map((post) => ({
      ...post,
      is_liked: likedPostIds.includes(post.id),
    }));

    return NextResponse.json({
      posts: enrichedPosts,
      page,
      per_page: POSTS_PER_PAGE,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / POSTS_PER_PAGE),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 post / 1 saat
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`community-post:${ip}`, 10, 3600_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Çok fazla post oluşturdunuz. Lütfen bekleyin.' },
        { status: 429 }
      );
    }

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.body === 'string' ? body.body.trim() : '';
    const sembol = typeof body.sembol === 'string' ? body.sembol.trim().toUpperCase() : null;
    const category = typeof body.category === 'string' ? body.category : 'genel';

    // Validation
    if (title.length < 3 || title.length > 200) {
      return NextResponse.json({ error: 'Başlık 3-200 karakter olmalı.' }, { status: 400 });
    }
    if (content.length < 10 || content.length > 5000) {
      return NextResponse.json({ error: 'İçerik 10-5000 karakter olmalı.' }, { status: 400 });
    }
    if (!['genel', 'analiz', 'haber', 'soru', 'strateji'].includes(category)) {
      return NextResponse.json({ error: 'Geçersiz kategori.' }, { status: 400 });
    }

    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        author_id: user.id,
        title,
        body: content,
        sembol: sembol || null,
        category,
      })
      .select(`
        *,
        author:profiles!posts_author_profile_fkey(id, display_name, avatar_url, tier)
      `)
      .single();

    if (error) {
      console.error('[community/posts] POST error:', error.message, error.details, error.hint);
      return NextResponse.json({ error: 'Post oluşturulamadı.', debug: error.message }, { status: 500 });
    }

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
