import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * Profil API.
 *
 * GET /api/profile → Giriş yapan kullanıcının profil bilgileri
 * PATCH /api/profile → Profil güncelleme (display_name, bio, avatar_url)
 *
 * Phase 9.2
 */

export interface ProfileResponse {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  tier: 'free' | 'pro' | 'premium';
  email: string | null;
  newsletter_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    // Profili çek
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, bio, tier, newsletter_enabled, created_at, updated_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      // Profil yoksa oluştur (trigger çalışmamışsa fallback)
      const defaultName = user.email?.split('@')[0] ?? null;
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          display_name: defaultName,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: 'Profil oluşturulamadı.' }, { status: 500 });
      }

      return NextResponse.json({
        ...newProfile,
        email: user.email,
      } as ProfileResponse);
    }

    return NextResponse.json({
      ...profile,
      email: user.email,
    } as ProfileResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();

    // Sadece izin verilen alanları al
    const allowedFields: Record<string, unknown> = {};
    if (typeof body.display_name === 'string') {
      const name = body.display_name.trim();
      if (name.length > 50) {
        return NextResponse.json({ error: 'İsim en fazla 50 karakter olabilir.' }, { status: 400 });
      }
      allowedFields.display_name = name || null;
    }
    if (typeof body.bio === 'string') {
      const bio = body.bio.trim();
      if (bio.length > 500) {
        return NextResponse.json({ error: 'Bio en fazla 500 karakter olabilir.' }, { status: 400 });
      }
      allowedFields.bio = bio || null;
    }
    if (typeof body.avatar_url === 'string') {
      const url = body.avatar_url.trim();
      if (url && !url.startsWith('https://') && !url.startsWith('/avatars/')) {
        return NextResponse.json({ error: 'Geçersiz avatar URL.' }, { status: 400 });
      }
      allowedFields.avatar_url = url || null;
    }
    if (typeof body.newsletter_enabled === 'boolean') {
      allowedFields.newsletter_enabled = body.newsletter_enabled;
    }

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: 'Güncellenecek alan belirtilmedi.' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update(allowedFields)
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Profil güncellenemedi.' }, { status: 500 });
    }

    return NextResponse.json({
      ...updated,
      email: user.email,
    } as ProfileResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
