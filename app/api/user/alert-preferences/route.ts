/**
 * E-posta bildirim tercihleri API
 * GET  /api/user/alert-preferences  → kullanıcının tercihlerini döndür
 * POST /api/user/alert-preferences  → tercih kaydet / güncelle
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

const VALID_SIGNAL_TYPES = [
  'RSI Uyumsuzluğu',
  'Hacim Anomalisi',
  'Trend Başlangıcı',
  'Destek/Direnç Kırılımı',
  'MACD Kesişimi',
  'RSI Seviyesi',
  'Altın Çapraz',
  'Bollinger Sıkışması',
];

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('alert_subscriptions')
    .select('email_enabled, min_severity, signal_types')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    email_enabled: data?.email_enabled ?? true,
    min_severity:  data?.min_severity  ?? 'orta',
    signal_types:  data?.signal_types  ?? [], // boş array = tüm tipler
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
    ? body.min_severity : 'orta';

  // Boş array = tüm tipler; dolu = sadece seçilenler
  const signal_types: string[] = Array.isArray(body.signal_types)
    ? body.signal_types.filter((t: unknown) => typeof t === 'string' && VALID_SIGNAL_TYPES.includes(t))
    : [];

  const { error } = await supabase
    .from('alert_subscriptions')
    .upsert(
      { user_id: user.id, email_enabled, min_severity, signal_types, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
