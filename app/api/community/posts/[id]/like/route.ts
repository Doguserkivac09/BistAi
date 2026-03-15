import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * Like/Unlike API (toggle)
 *
 * POST   /api/community/posts/[id]/like → Beğen
 * DELETE /api/community/posts/[id]/like → Beğeniyi kaldır
 *
 * Phase 10.2
 */

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const { error } = await supabase
      .from('likes')
      .insert({ user_id: user.id, post_id: postId });

    if (error) {
      // Zaten beğenmişse unique constraint hata verir
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Zaten beğendiniz.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Beğenilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ liked: true });
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
    const { id: postId } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', user.id)
      .eq('post_id', postId);

    if (error) {
      return NextResponse.json({ error: 'Beğeni kaldırılamadı.' }, { status: 500 });
    }

    return NextResponse.json({ liked: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
