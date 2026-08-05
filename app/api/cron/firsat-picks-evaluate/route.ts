/**
 * Fırsat Sicili — Pick Değerlendirme (forward-tracking)
 *
 * GET /api/cron/firsat-picks-evaluate
 * Schedule: Pzt 08:30 UTC (11:30 TRT) — snapshot (11:00 TRT) SONRASI
 *
 * Ufuğu (1/2/4 hafta) dolmuş ama henüz doldurulmamış pick'lerin getirisini
 * scan_cache son kapanışından + XU100'den hesaplar (istek-anı Yahoo: 1 çağrı).
 * baby-picks-evaluate ile aynı desen; ufuklar kısa vadeye göre.
 *
 * NOT: burada YÖN DÜZELTMESİ YAPILMAZ — ham getiri saklanır. Yön/komisyon
 * düzeltmesi okuma katmanında (lib/firsat-picks `netReturn`) tek yerde yapılır ki
 * ham veri sonradan farklı ölçütlerle yeniden yorumlanabilsin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bistGuard } from '@/lib/bist-guard';
import { fetchOHLCV } from '@/lib/yahoo';
import { PICK_HORIZONS } from '@/lib/firsat-picks';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

function createAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface PickRow {
  id: string;
  sembol: string;
  entry_price: number;
  entry_time: string;
  bist_entry: number | null;
  ret_1w: number | null;
  ret_2w: number | null;
  ret_4w: number | null;
}

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET) && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const guard = bistGuard();
  if (guard) return guard;

  const admin = createAdmin();

  // 4 haftalık ufku henüz dolmamış (tam değerlendirilmemiş) pick'ler
  const { data: picks, error } = await admin
    .from('firsat_picks')
    .select('id, sembol, entry_price, entry_time, bist_entry, ret_1w, ret_2w, ret_4w')
    .is('ret_4w', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!picks?.length) {
    return NextResponse.json({ ok: true, message: 'Değerlendirilecek pick yok', updated: 0 });
  }

  const rows = picks as PickRow[];
  const symbols = [...new Set(rows.map((p) => p.sembol))];

  // Güncel fiyatlar — scan_cache last_close (Yahoo fan-out YOK)
  const priceMap = new Map<string, number>();
  const { data: scan } = await admin
    .from('scan_cache')
    .select('sembol, last_close')
    .eq('market', 'BIST')
    .in('sembol', symbols);
  for (const r of (scan ?? []) as { sembol: string; last_close: number | null }[]) {
    if (r.last_close && r.last_close > 0) priceMap.set(r.sembol, r.last_close);
  }

  // BIST100 güncel (1 Yahoo çağrısı)
  let bistNow: number | null = null;
  try {
    const { candles } = await fetchOHLCV('XU100', 3);
    bistNow = candles[candles.length - 1]?.close ?? null;
  } catch {
    /* benchmark opsiyonel */
  }

  const now = Date.now();
  let updated = 0;
  let missingPrice = 0;

  for (const p of rows) {
    const price = priceMap.get(p.sembol);
    if (!price || !p.entry_price) { missingPrice++; continue; }

    const weeksElapsed = (now - new Date(p.entry_time).getTime()) / (7 * 86_400_000);
    const ret = (price / p.entry_price - 1) * 100;
    const bistRet = bistNow && p.bist_entry ? (bistNow / p.bist_entry - 1) * 100 : null;

    const update: Record<string, number | string | null> = {};
    for (const h of PICK_HORIZONS) {
      const retKey = `ret_${h.key}` as 'ret_1w' | 'ret_2w' | 'ret_4w';
      if (weeksElapsed >= h.weeks && p[retKey] === null) {
        update[`price_${h.key}`] = Math.round(price * 100) / 100;
        update[retKey] = Math.round(ret * 10) / 10;
        update[`bist_ret_${h.key}`] = bistRet !== null ? Math.round(bistRet * 10) / 10 : null;
      }
    }

    if (Object.keys(update).length > 0) {
      update.last_evaluated_at = new Date().toISOString();
      const { error: upErr } = await admin.from('firsat_picks').update(update).eq('id', p.id);
      if (!upErr) updated++;
    }
  }

  console.log(`[cron/firsat-picks-evaluate] açık ${rows.length}, güncellenen ${updated}, fiyatsız ${missingPrice}`);
  return NextResponse.json({ ok: true, openPicks: rows.length, updated, missingPrice, bistNow });
}
