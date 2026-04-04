/**
 * GET  /api/chat/sessions        → Kullanıcının sohbet geçmişi (son 20)
 * POST /api/chat/sessions        → Yeni oturum kaydet / güncelle
 * DELETE /api/chat/sessions?id=X → Oturumu sil
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const MAX_SESSIONS = 20; // Kullanıcı başına max oturum

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  const admin = adminClient();

  // Tek oturum — mesajlarla birlikte
  if (id) {
    const { data, error } = await admin
      .from('chat_sessions')
      .select('id, title, sembol, messages, created_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  }

  // Tüm oturumlar — sadece meta
  const { data, error } = await admin
    .from('chat_sessions')
    .select('id, title, sembol, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(MAX_SESSIONS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  let body: { id?: string; messages: { role: string; content: string }[]; sembol?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Mesaj listesi boş' }, { status: 400 });
  }

  // Oturum başlığı: ilk kullanıcı mesajından üret
  const firstUser = body.messages.find((m) => m.role === 'user');
  const title = firstUser
    ? firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '…' : '')
    : 'Sohbet';

  const admin = adminClient();

  if (body.id) {
    // Mevcut oturumu güncelle
    const { data, error } = await admin
      .from('chat_sessions')
      .update({ messages: body.messages, title, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }

  // Yeni oturum oluştur
  const { data, error } = await admin
    .from('chat_sessions')
    .insert({
      user_id: user.id,
      title,
      sembol: body.sembol ?? null,
      messages: body.messages,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Eski oturumları temizle (MAX_SESSIONS'ı aşarsa en eskiyi sil)
  const { data: all } = await admin
    .from('chat_sessions')
    .select('id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: true });

  if (all && all.length > MAX_SESSIONS) {
    const toDelete = all.slice(0, all.length - MAX_SESSIONS).map((s: { id: string }) => s.id);
    await admin.from('chat_sessions').delete().in('id', toDelete);
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 });

  const admin = adminClient();
  const { error } = await admin
    .from('chat_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
