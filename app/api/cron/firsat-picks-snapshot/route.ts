/**
 * Fırsat Sicili — Haftalık Snapshot (forward-tracking)
 *
 * GET /api/cron/firsat-picks-snapshot
 * Schedule: Pzt 08:00 UTC (11:00 TRT) — sabah taraması (07:30 TRT) SONRASI
 *
 * O anki YAYINLANAN fırsat listesini kaydeder. Kritik tasarım kararı: liste
 * yeniden hesaplanmaz, kendi `/api/firsatlar` endpoint'imiz çağrılır → "kullanıcının
 * gördüğü" ile "ölçtüğümüz" ayrışamaz. Yeniden hesaplasaydık yayın kapısı/skor
 * bağlamı (makro, rejim, katalist) değişip sicili sessizce güzelleştirebilirdi.
 *
 * Not: kayıt HEM 'onayli' HEM 'teknik' katmanı içerir; ölçüm katman bazında
 * ayrıştırılabilsin diye (varsayılan yüzey yalnız 'onayli'yi raporlar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bistGuard } from '@/lib/bist-guard';
import { fetchOHLCV } from '@/lib/yahoo';
import { weekStartOf } from '@/lib/firsat-picks';
import { deriveReasons, firsatToInput } from '@/lib/opportunity-reasons';
import type { FirsatlarResponse } from '@/app/api/firsatlar/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

function createAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET) && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const guard = bistGuard();
  if (guard) return guard;

  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? `http://localhost:${process.env.PORT ?? 3000}`;

  let payload: FirsatlarResponse;
  try {
    const res = await fetch(`${base}/api/firsatlar`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = (await res.json()) as FirsatlarResponse;
  } catch (e) {
    return NextResponse.json(
      { error: `Fırsat listesi alınamadı: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  const firsatlar = payload.firsatlar ?? [];
  if (firsatlar.length === 0) {
    // Boş liste HATA DEĞİL — rejim kapısı sıkı olabilir. Ama kayıt da üretmeyiz.
    return NextResponse.json({ ok: true, message: 'Yayınlanan fırsat yok — snapshot atlandı', inserted: 0 });
  }

  // BIST100 giriş seviyesi (tek Yahoo çağrısı) — benchmark
  let bistEntry: number | null = null;
  try {
    const { candles } = await fetchOHLCV('XU100', 3);
    bistEntry = candles[candles.length - 1]?.close ?? null;
  } catch {
    /* benchmark opsiyonel — yoksa BIST karşılaştırması o hafta için yapılmaz */
  }

  const weekStart = weekStartOf();
  const now = new Date().toISOString();

  const rows = firsatlar.map((f) => ({
    week_start: weekStart,
    sembol: f.sembol,
    sector_id: f.sektorId,
    tier: f.tier,
    score: Math.round(f.adjustedScore),
    direction: f.direction,
    entry_price: f.entryPrice,
    entry_time: now,
    stop_loss: f.stopLoss,
    target_price: f.targetPrice,
    risk_reward: f.riskRewardRatio,
    // Gerekçeler o ANKİ hâliyle donar — sicil "neden gösterdik" ile birlikte okunur
    reasons: deriveReasons(firsatToInput(f)).map((r) => ({ id: r.id, tone: r.tone, text: r.text })),
    bist_entry: bistEntry,
  }));

  const admin = createAdmin();
  // Aynı hafta tekrar koşarsa çakışma olmasın (idempotent) — ilk kayıt korunur:
  // haftanın İLK yayınını ölçmek, gün içi iyileşmeyi seçip sicili güzelleştirmekten dürüsttür.
  const { error, count } = await admin
    .from('firsat_picks')
    .upsert(rows, { onConflict: 'week_start,sembol', ignoreDuplicates: true, count: 'exact' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const onayli = rows.filter((r) => r.tier === 'onayli').length;
  console.log(`[cron/firsat-picks-snapshot] ${weekStart}: ${rows.length} pick (${onayli} onaylı), bistEntry=${bistEntry}`);

  return NextResponse.json({
    ok: true,
    weekStart,
    picks: rows.length,
    onayli,
    teknik: rows.length - onayli,
    inserted: count ?? null,
    bistEntry,
  });
}
