/**
 * Swing sicil özeti — GİZLİ. Sinyal girişleri, aynı gün açılan rastgele
 * kontrollerden SPY'a göre daha mı iyi?
 *
 * GET /api/dev/swing-sicil
 * Header: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SICIL_TABLE, summarizeSicil, type SicilRow } from '@/lib/swing-sicil-runner';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!(CRON_SECRET && token === CRON_SECRET) && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Supabase env eksik' }, { status: 500 });
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const rows: SicilRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(SICIL_TABLE).select('*').eq('market', 'US')
      .order('signal_date', { ascending: true }).range(from, from + 999);
    if (error) return NextResponse.json({ error: `${error.message} — migration çalıştırıldı mı?` }, { status: 502 });
    for (const r of data ?? []) rows.push(r as SicilRow);
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json(summarizeSicil(rows));
}
