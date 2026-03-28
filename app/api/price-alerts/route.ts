/**
 * Fiyat Alert CRUD API
 * GET    /api/price-alerts        → kullanıcının tüm alertleri
 * POST   /api/price-alerts        → yeni alert oluştur
 * DELETE /api/price-alerts?id=... → alert sil
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });

  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });

  let body: { sembol?: string; target_price?: number; direction?: string; note?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 }); }

  const { sembol, target_price, direction, note } = body;
  if (!sembol || !target_price || !direction) {
    return NextResponse.json({ error: 'sembol, target_price ve direction zorunlu.' }, { status: 400 });
  }
  if (!['above', 'below'].includes(direction)) {
    return NextResponse.json({ error: 'direction "above" veya "below" olmalı.' }, { status: 400 });
  }
  if (target_price <= 0) {
    return NextResponse.json({ error: 'Geçersiz fiyat.' }, { status: 400 });
  }

  // Aynı hisse için aktif alert sayısını kontrol et (max 5)
  const { count } = await supabase
    .from('price_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('sembol', sembol.toUpperCase())
    .eq('triggered', false);

  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: 'Bir hisse için en fazla 5 aktif alert oluşturabilirsiniz.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('price_alerts')
    .insert({
      user_id: user.id,
      sembol: sembol.toUpperCase(),
      target_price,
      direction,
      note: note?.slice(0, 100) ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id zorunlu.' }, { status: 400 });

  const { error } = await supabase
    .from('price_alerts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
