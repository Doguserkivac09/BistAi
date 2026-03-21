import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * DELETE /api/community/posts/[id]/comments/[commentId]
 * Soft delete yorum (sadece yazar)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('comments')
      .update({ is_deleted: true })
      .eq('id', commentId)
      .eq('author_id', user.id)
      .select('id');

    if (error) {
      return NextResponse.json({ error: 'Yorum silinemedi.', debug: error.message }, { status: 403 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Yorum bulunamadı veya yetkiniz yok.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
