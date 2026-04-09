/**
 * Web Push abonelik yönetimi.
 *
 * POST /api/push/subscribe  — abonelik kaydet / güncelle
 * DELETE /api/push/subscribe — abonelik sil
 * GET /api/push/subscribe   — mevcut abonelik var mı?
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── Abonelik kaydet ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { endpoint, keys } = body ?? {};

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Geçersiz abonelik verisi.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) {
    console.error('[push/subscribe] upsert hatası:', error.message);
    return NextResponse.json({ error: 'Abonelik kaydedilemedi.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── Abonelik sil ──────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { endpoint } = body ?? {};

  const admin = createAdminClient();
  const query = admin.from('push_subscriptions').delete().eq('user_id', user.id);

  if (endpoint) {
    await query.eq('endpoint', endpoint);
  } else {
    // endpoint yoksa kullanıcının tüm aboneliklerini sil
    await admin.from('push_subscriptions').delete().eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true });
}

// ── Abonelik durumu ────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ subscribed: false });

  const admin = createAdminClient();
  const { data } = await admin
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', user.id)
    .limit(1);

  return NextResponse.json({ subscribed: (data?.length ?? 0) > 0 });
}
