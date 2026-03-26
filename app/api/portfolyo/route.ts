/**
 * Portföy API — kullanıcının pozisyonları
 * GET    /api/portfolyo          → pozisyonları listele
 * POST   /api/portfolyo          → yeni pozisyon ekle
 * DELETE /api/portfolyo?id=xxx   → pozisyon sil
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { PortfolyoPozisyon } from '@/types';

function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });

  const { data, error } = await supabase
    .from('portfolyo_pozisyonlar')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });

  const body = await request.json();
  const { sembol, miktar, alis_fiyati, alis_tarihi, notlar } = body;

  if (!sembol || !miktar || !alis_fiyati || !alis_tarihi) {
    return NextResponse.json({ error: 'Eksik alan: sembol, miktar, alis_fiyati, alis_tarihi zorunlu.' }, { status: 400 });
  }

  const miktarNum = Number(miktar);
  const fiyatNum  = Number(alis_fiyati);
  if (isNaN(miktarNum) || miktarNum <= 0 || isNaN(fiyatNum) || fiyatNum <= 0) {
    return NextResponse.json({ error: 'Miktar ve fiyat pozitif sayı olmalı.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('portfolyo_pozisyonlar')
    .insert({
      user_id:     user.id,
      sembol:      sembol.toUpperCase().trim(),
      miktar:      miktarNum,
      alis_fiyati: fiyatNum,
      alis_tarihi,
      notlar:      notlar ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as PortfolyoPozisyon, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });

  const body = await request.json();
  const { id, miktar, notlar } = body;

  if (!id) return NextResponse.json({ error: 'id alanı zorunlu.' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (miktar !== undefined) {
    const miktarNum = Number(miktar);
    if (isNaN(miktarNum) || miktarNum <= 0) {
      return NextResponse.json({ error: 'Miktar pozitif sayı olmalı.' }, { status: 400 });
    }
    updates.miktar = miktarNum;
  }
  if (notlar !== undefined) updates.notlar = notlar;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Güncellenecek alan yok.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('portfolyo_pozisyonlar')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as PortfolyoPozisyon);
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id parametresi eksik.' }, { status: 400 });

  const { error } = await supabase
    .from('portfolyo_pozisyonlar')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
