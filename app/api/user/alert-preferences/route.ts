/**
 * E-posta bildirim tercihleri API
 * GET  /api/user/alert-preferences  → kullanıcının tercihlerini döndür
 * POST /api/user/alert-preferences  → tercih kaydet / güncelle
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('alert_subscriptions')
    .select('email_enabled, min_severity')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Varsayılan değerler (henüz kayıt yoksa)
  return NextResponse.json({
    email_enabled: data?.email_enabled ?? true,
    min_severity:  data?.min_severity  ?? 'orta',
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });
  }

  const body = await req.json();
  const email_enabled = typeof body.email_enabled === 'boolean' ? body.email_enabled : true;
  const min_severity  = ['güçlü', 'orta', 'zayıf'].includes(body.min_severity)
    ? body.min_severity
    : 'orta';

  const { error } = await supabase
    .from('alert_subscriptions')
    .upsert(
      { user_id: user.id, email_enabled, min_severity, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
