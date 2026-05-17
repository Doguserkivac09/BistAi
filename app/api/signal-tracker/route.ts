/**
 * GET  /api/signal-tracker  — kullanıcının takipteki sinyalleri (+ güncel fiyat)
 * POST /api/signal-tracker  — sinyal takibe al
 * DELETE /api/signal-tracker?sembol=X&signal_type=Y — takipten çıkar
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ── GET ────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const admin = createAdmin();

  const { data: tracked, error } = await admin
    .from('signal_tracker')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('tracked_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Güncel fiyatları scan_cache'den çek
  const symbols = (tracked ?? []).map((t) => t.sembol);
  const { data: prices } = symbols.length > 0
    ? await admin.from('scan_cache').select('sembol, last_close').in('sembol', symbols)
    : { data: [] };

  const priceMap = new Map((prices ?? []).map((p) => [p.sembol, p.last_close]));

  const items = (tracked ?? []).map((t) => {
    const current = priceMap.get(t.sembol) ?? t.last_price ?? t.entry_price;
    const returnPct = t.entry_price > 0
      ? ((current - t.entry_price) / t.entry_price) * 100
      : 0;
    return { ...t, current_price: current, return_pct: returnPct };
  });

  return NextResponse.json({ items });
}

// ── POST ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.sembol || !body?.signal_type) {
    return NextResponse.json({ error: 'sembol ve signal_type zorunlu' }, { status: 400 });
  }

  const admin = createAdmin();

  const { data, error } = await admin
    .from('signal_tracker')
    .upsert({
      user_id:          user.id,
      sembol:           body.sembol,
      signal_type:      body.signal_type,
      direction:        body.direction ?? null,
      entry_price:      body.entry_price ?? 0,
      confluence_score: body.confluence_score ?? null,
      sector_name:      body.sector_name ?? null,
      is_active:        true,
      notified_pcts:    [],
      tracked_at:       new Date().toISOString(),
    }, { onConflict: 'user_id,sembol,signal_type' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, item: data });
}

// ── DELETE ─────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sembol      = searchParams.get('sembol');
  const signal_type = searchParams.get('signal_type');

  if (!sembol || !signal_type) {
    return NextResponse.json({ error: 'sembol ve signal_type zorunlu' }, { status: 400 });
  }

  const admin = createAdmin();
  const { error } = await admin
    .from('signal_tracker')
    .update({ is_active: false, deactivated_at: new Date().toISOString(), exit_reason: 'manual' })
    .eq('user_id', user.id)
    .eq('sembol', sembol)
    .eq('signal_type', signal_type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
