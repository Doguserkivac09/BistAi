/**
 * Watchlist API
 * GET    /api/watchlist          → kullanıcının watchlist'ini döndür
 * POST   /api/watchlist          → hisse ekle { sembol, notlar? }
 * DELETE /api/watchlist?id=xxx   → hisse kaldır
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const { data, error } = await supabase
    .from('watchlist')
    .select('id, user_id, sembol, notlar, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const { sembol, notlar } = await req.json();
  if (!sembol) return NextResponse.json({ error: 'Sembol gerekli' }, { status: 400 });

  const { data, error } = await supabase
    .from('watchlist')
    .insert({ user_id: user.id, sembol: sembol.toUpperCase(), notlar: notlar ?? null })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Bu hisse zaten listende' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 });

  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
