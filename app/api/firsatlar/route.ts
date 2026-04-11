/**
 * GET /api/firsatlar
 * Son 3 günlük yüksek kaliteli sinyalleri sembol bazında gruplar,
 * confluence skoruna göre sıralar, makro uyum ekler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import { getSector } from '@/lib/sectors';

const MIN_CONFLUENCE = 45;
const LOOKBACK_DAYS  = 3;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, key);
}

export interface FirsatItem {
  sembol:          string;
  sektorAdi:       string;
  sinyaller:       string[];   // ['RSI Uyumsuzluğu', 'MACD Kesişimi']
  direction:       'yukari' | 'asagi' | 'notr';
  confluenceScore: number;
  entryPrice:      number;
  entryTime:       string;
  regime:          string | null;
  makroUyum:       'guclu' | 'notr' | 'dikkat'; // AL+boğa=güçlü, SAT+ayı=güçlü, tersler=dikkat
}

export interface FirsatlarResponse {
  firsatlar: FirsatItem[];
  makroScore: number | null;
  regime:     string | null;
  toplamSinyal: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    // Son LOOKBACK_DAYS günlük, değerlendirilmemiş, yüksek confluenceli sinyaller
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

    // Makro skor — opsiyonel, hata olursa null
    let makroScore: number | null = null;
    let regime: string | null = null;
    try {
      const macro = await getMacroFull();
      makroScore = macro.macroScore.score;
      // Regime en son sinyalden al (cron'dan geliyor)
      regime = rows[0]?.regime ?? null;
    } catch { /* makro opsiyonel */ }

    // Sembol bazında grupla
    const gruplar = new Map<string, typeof rows>();
    for (const row of rows) {
      const mevcut = gruplar.get(row.sembol) ?? [];
      mevcut.push(row);
      gruplar.set(row.sembol, mevcut);
    }

    // Her sembol için en iyi temsili sinyal + tüm sinyal tipleri
    const firsatlar: FirsatItem[] = [];

    for (const [sembol, sinyaller] of gruplar) {
      // En yüksek confluenceli satır
      const best = sinyaller.reduce((a, b) =>
        (b.confluence_score ?? 0) > (a.confluence_score ?? 0) ? b : a
      );

      const uniqueSinyaller = [...new Set(sinyaller.map((s) => s.signal_type))];

      // Dominant yön — çoğunluk
      const yukariSayisi = sinyaller.filter((s) => s.direction === 'yukari').length;
      const asagiSayisi  = sinyaller.filter((s) => s.direction === 'asagi').length;
      const direction: FirsatItem['direction'] =
        yukariSayisi > asagiSayisi ? 'yukari' :
        asagiSayisi > yukariSayisi ? 'asagi' : 'notr';

      // Makro uyum hesapla
      let makroUyum: FirsatItem['makroUyum'] = 'notr';
      if (makroScore !== null) {
        const isBull = regime === 'bull_trend' || makroScore > 20;
        const isBear = regime === 'bear_trend' || makroScore < -20;
        if ((direction === 'yukari' && isBull) || (direction === 'asagi' && isBear)) {
          makroUyum = 'guclu';
        } else if ((direction === 'yukari' && isBear) || (direction === 'asagi' && isBull)) {
          makroUyum = 'dikkat';
        }
      }

      const sektorBilgi = getSector(sembol);

      firsatlar.push({
        sembol,
        sektorAdi:       sektorBilgi.shortName,
        sinyaller:       uniqueSinyaller,
        direction,
        confluenceScore: Math.round(best.confluence_score ?? 0),
        entryPrice:      best.entry_price,
        entryTime:       best.entry_time,
        regime:          best.regime,
        makroUyum,
      });
    }

    // Confluence'a göre sırala (en yüksek başta)
    firsatlar.sort((a, b) => b.confluenceScore - a.confluenceScore);

    return NextResponse.json<FirsatlarResponse>({
      firsatlar,
      makroScore,
      regime,
      toplamSinyal: rows.length,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
