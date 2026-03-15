import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

/**
 * Şikayet API
 *
 * POST /api/community/posts/[id]/report → Post veya yorum şikayeti
 *
 * Phase 10.9
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;

    // Rate limit: 5 şikayet / 1 saat
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`community-report:${ip}`, 5, 3600_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Çok fazla şikayet gönderdiniz. Lütfen bekleyin.' },
        { status: 429 }
      );
    }

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const detail = typeof body.detail === 'string' ? body.detail.trim() : null;
    const commentId = typeof body.comment_id === 'string' ? body.comment_id : null;

    if (!['spam', 'hakaret', 'yaniltici', 'diger'].includes(reason)) {
      return NextResponse.json({ error: 'Geçersiz şikayet nedeni.' }, { status: 400 });
    }
    if (detail && detail.length > 500) {
      return NextResponse.json({ error: 'Detay en fazla 500 karakter olabilir.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('reports')
      .insert({
        reporter_id: user.id,
        post_id: commentId ? null : postId,
        comment_id: commentId,
        reason,
        detail: detail || null,
      });

    if (error) {
      return NextResponse.json({ error: 'Şikayet gönderilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Şikayetiniz alındı. Teşekkürler.' }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
