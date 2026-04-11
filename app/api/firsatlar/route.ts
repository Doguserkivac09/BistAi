/**
 * GET /api/firsatlar
 * Son 3 günlük yüksek kaliteli sinyalleri sembol bazında gruplar,
 * confluence skoruna göre sıralar, sektör momentum bilgisi ekler.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import { getSector, getSectorId } from '@/lib/sectors';

const MIN_CONFLUENCE = 45;
const LOOKBACK_DAYS  = 3;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, key);
}

export interface FirsatItem {
  sembol:              string;
  sektorAdi:           string;
  sektorId:            string;
  sinyaller:           string[];
  direction:           'yukari' | 'asagi' | 'notr';
  confluenceScore:     number;
  entryPrice:          number;
  entryTime:           string;
  regime:              string | null;
  /** Bu sektörden kaç farklı hisse sinyal verdi */
  sektorSinyalSayisi:  number;
}

export interface FirsatlarResponse {
  firsatlar:    FirsatItem[];
  makroScore:   number | null;
  regime:       string | null;
  toplamSinyal: number;
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const { data, error } = await supabase
      .from('signal_performance')
      .select('sembol, signal_type, direction, entry_price, entry_time, confluence_score, regime')
      .eq('evaluated', false)
      .gte('entry_time', cutoff.toISOString())
      .gte('confluence_score', MIN_CONFLUENCE)
      .order('confluence_score', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as {
      sembol: string;
      signal_type: string;
      direction: string;
      entry_price: number;
      entry_time: string;
      confluence_score: number;
      regime: string | null;
    }[];

    // Makro skor — opsiyonel
    let makroScore: number | null = null;
    let regime: string | null = rows[0]?.regime ?? null;
    try {
      const macro = await getMacroFull();
      makroScore = macro.macroScore.score;
    } catch { /* makro opsiyonel */ }

    // Sembol bazında grupla
    const gruplar = new Map<string, typeof rows>();
    for (const row of rows) {
      const mevcut = gruplar.get(row.sembol) ?? [];
      mevcut.push(row);
      gruplar.set(row.sembol, mevcut);
    }

    // Sektör → sinyal veren hisse sayısı haritası
    const sektorSayaci = new Map<string, Set<string>>();
    for (const sembol of gruplar.keys()) {
      const sektorId = getSectorId(sembol);
      if (!sektorSayaci.has(sektorId)) sektorSayaci.set(sektorId, new Set());
      sektorSayaci.get(sektorId)!.add(sembol);
    }

    const firsatlar: FirsatItem[] = [];

    for (const [sembol, sinyaller] of gruplar) {
      const best = sinyaller.reduce((a, b) =>
        (b.confluence_score ?? 0) > (a.confluence_score ?? 0) ? b : a
      );

      const uniqueSinyaller = [...new Set(sinyaller.map((s) => s.signal_type))];

      const yukariSayisi = sinyaller.filter((s) => s.direction === 'yukari').length;
      const asagiSayisi  = sinyaller.filter((s) => s.direction === 'asagi').length;
      const direction: FirsatItem['direction'] =
        yukariSayisi > asagiSayisi ? 'yukari' :
        asagiSayisi > yukariSayisi ? 'asagi' : 'notr';

      const sektorBilgi  = getSector(sembol);
      const sektorId     = getSectorId(sembol);
      const sektorSinyalSayisi = sektorSayaci.get(sektorId)?.size ?? 1;

      firsatlar.push({
        sembol,
        sektorAdi:          sektorBilgi.shortName,
        sektorId,
        sinyaller:          uniqueSinyaller,
        direction,
        confluenceScore:    Math.round(best.confluence_score ?? 0),
        entryPrice:         best.entry_price,
        entryTime:          best.entry_time,
        regime:             best.regime,
        sektorSinyalSayisi,
      });
    }

    firsatlar.sort((a, b) => b.confluenceScore - a.confluenceScore);

    return NextResponse.json<FirsatlarResponse>({
      firsatlar,
      makroScore,
      regime,
      toplamSinyal: rows.length,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
