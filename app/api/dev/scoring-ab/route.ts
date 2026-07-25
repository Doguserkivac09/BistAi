/**
 * DEV/ÖLÇÜM: SCORING v1 ↔ v2 A/B harness (SKOR-MIMARISI-PLAN FAZ 0-2).
 *
 * GET /api/dev/scoring-ab?days=90&threshold=65&longOnly=1
 * Header: Authorization: Bearer <CRON_SECRET>  (prod verisiyle çalışabilmek için)
 *
 * evaluated signal_performance (BIST) satırlarını çeker, her satırı v1 VE v2 ile
 * yeniden skorlar (lib/scoring-ab, point-in-time), macro_snapshots'tan tarih-bazlı
 * macroScore join'ler (skaler-makro-çıkarımı farkı buradan doğar), eşik-tabanlı
 * seçim + net-of-cost + rejim-kırılımlı Sharpe/drawdown döndürür.
 *
 * ⚠️ Yönlendirici DEĞİL, GÖZLEM amaçlı: backlog erimeden (entry tarihleri güncel değilken)
 * sonuç kararı belirlemez. SCORING_V2 yalnız bu harness temiz veriyle B≥A gösterince açılır.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildEvents, runAb, type AbSignalRow } from '@/lib/scoring-ab';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.get('days') ?? 90)));
  const threshold = Math.min(100, Math.max(0, Number(sp.get('threshold') ?? 65)));
  const longOnly = sp.get('longOnly') !== '0';
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const supabase = createAdminClient();

    // 1) evaluated BIST sinyalleri (market=BIST veya eski null satırlar)
    const { data: rows, error } = await supabase
      .from('signal_performance')
      .select('sembol, signal_type, direction, entry_time, confluence_score, weekly_aligned, regime, return_3d, return_7d, return_14d, return_30d, market')
      .eq('evaluated', true)
      .gte('entry_time', since)
      .or('market.eq.BIST,market.is.null')
      .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const abRows = (rows ?? []) as AbSignalRow[];

    if (abRows.length === 0) {
      return NextResponse.json({
        ok: true, empty: true,
        message: 'Değerlendirilmiş BIST sinyali yok (backlog henüz erimemiş olabilir).',
        params: { days, threshold, longOnly },
      });
    }

    // 2) macro_snapshots → tarih-bazlı macroScore haritası (skaler makro farkı için)
    const { data: snaps } = await supabase
      .from('macro_snapshots')
      .select('snapshot_date, macro_score')
      .gte('snapshot_date', since.slice(0, 10));
    const macroByDate = new Map<string, number>();
    for (const s of snaps ?? []) {
      if (s.snapshot_date && typeof s.macro_score === 'number') {
        macroByDate.set(String(s.snapshot_date).slice(0, 10), s.macro_score);
      }
    }

    // 3) Point-in-time yeniden skorla + A/B çalıştır
    const events = buildEvents(abRows, macroByDate);
    const comparison = runAb(events, { threshold, longOnly });

    // Entry tarih aralığı — backlog güncelliğini görmek için (yönlendirici caveat)
    const times = abRows.map((r) => r.entry_time).sort();

    return NextResponse.json({
      ok: true,
      params: { days, threshold, longOnly },
      pool: {
        evaluatedRows: abRows.length,
        scoredEvents: events.length,
        macroDatesJoined: macroByDate.size,
        entryRange: { first: times[0] ?? null, last: times[times.length - 1] ?? null },
      },
      comparison,
      caveat:
        'GÖZLEM amaçlı. entryRange güncel değilse (backlog erimemiş) sonuç yönlendirici değildir. ' +
        'Skaler-makro-çıkarımı ölçülür; sektör/temel/exposure kanalları tarihsel bağlam eksik.',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Hata' }, { status: 500 });
  }
}
