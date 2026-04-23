/**
 * GET /api/firsatlar
 * Son 3 günlük yüksek kaliteli sinyalleri sembol bazında gruplar,
 * confluence skoruna göre sıralar, sektör momentum bilgisi ekler.
 *
 * v2 (2026-04-23): Çoklu faktör skorlama
 *  - Geçmiş win rate entegrasyonu (signal-stats-summary)
 *  - Time decay (exponential, half-life 48h)
 *  - Rejime göre skor (bull+AL / bear+SAT = bonus; ters = ceza)
 *  - Makro-yön uyumu (makro>+20 & AL veya makro<-20 & SAT = bonus)
 *  - adjustedScore = compositeScore (UI bununla sıralar)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import { getSector, getSectorId } from '@/lib/sectors';
import type { SignalPerformanceRecord } from '@/lib/performance-types';

const MIN_CONFLUENCE    = 45;
const LOOKBACK_DAYS     = 3;
const TIME_DECAY_HALF_H = 48;     // 48 saatte confluence etkisi yarıya iner
const STATS_LOOKBACK_D  = 180;    // geçmiş win rate için örneklem penceresi
const MIN_N_FOR_WR      = 20;     // bu eşik altındaki win rate güvenilmez

// Canonical horizon map (signal-stats-summary ile senkronize)
const SIGNAL_CANONICAL_FIELD: Record<string, 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'> = {
  'Altın Çapraz':           'return_30d',
  'Ölüm Çaprazı':            'return_30d',
  'Trend Başlangıcı':        'return_14d',
  'Destek/Direnç Kırılımı':  'return_14d',
  'MACD Kesişimi':           'return_7d',
  'RSI Uyumsuzluğu':         'return_7d',
  'Bollinger Sıkışması':     'return_7d',
  'RSI Seviyesi':            'return_3d',
  'Hacim Anomalisi':         'return_3d',
};

const COMMISSION = 0.004;

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
  /** Çoklu faktör sonrası nihai skor (UI bununla sıralar) */
  adjustedScore:       number;
  entryPrice:          number;
  entryTime:           string;
  /** Sinyalin yaşı (saat) */
  ageHours:            number;
  regime:              string | null;
  sektorSinyalSayisi:  number;
  /** En iyi sinyalin geçmiş win rate'i (0-1, yoksa null) */
  historicalWinRate:   number | null;
  /** Win rate örneklem sayısı */
  winRateN:            number;
  /** Skor ayarlamaları (şeffaflık için) */
  adjustments: {
    timeDecay:  number;  // çarpan (0-1)
    winRate:    number;  // ± puan
    regimeFit:  number;  // ± puan
    macroAlign: number;  // ± puan
  };
}

export interface FirsatlarResponse {
  firsatlar:    FirsatItem[];
  makroScore:   number | null;
  regime:       string | null;
  toplamSinyal: number;
}

// ── Yardımcılar ──────────────────────────────────────────────────────

function computeWinRates(
  records: Pick<SignalPerformanceRecord, 'signal_type' | 'direction' | 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'>[],
): Map<string, { winRate: number; n: number }> {
  const groups = new Map<string, typeof records>();
  for (const r of records) {
    if (!r.signal_type) continue;
    if (!groups.has(r.signal_type)) groups.set(r.signal_type, []);
    groups.get(r.signal_type)!.push(r);
  }

  const out = new Map<string, { winRate: number; n: number }>();
  for (const [sigType, rows] of groups) {
    const field = SIGNAL_CANONICAL_FIELD[sigType] ?? 'return_7d';
    const valid = rows.filter((r) => {
      const v = r[field];
      return v != null && Number.isFinite(v as number);
    });
    if (valid.length < 5) continue;

    let wins = 0;
    for (const r of valid) {
      const raw = r[field] as number;
      const dirAdj = r.direction === 'asagi' ? -raw : raw;
      if (dirAdj - COMMISSION > 0) wins++;
    }
    out.set(sigType, { winRate: wins / valid.length, n: valid.length });
  }
  return out;
}

function timeDecayMultiplier(ageHours: number): number {
  // Exponential decay: 0h → 1.0, 48h → 0.5, 96h → 0.25
  return Math.pow(0.5, ageHours / TIME_DECAY_HALF_H);
}

function regimeAdjustment(direction: string, regime: string | null): number {
  if (!regime || direction === 'notr') return 0;
  if (direction === 'yukari' && regime === 'bull_trend') return 8;
  if (direction === 'asagi'  && regime === 'bear_trend') return 8;
  if (direction === 'yukari' && regime === 'bear_trend') return -10;
  if (direction === 'asagi'  && regime === 'bull_trend') return -10;
  return 0; // sideways veya bilinmiyor
}

function macroAdjustment(direction: string, makroScore: number | null): number {
  if (makroScore === null || direction === 'notr') return 0;
  if (direction === 'yukari' && makroScore >=  20) return 5;
  if (direction === 'asagi'  && makroScore <= -20) return 5;
  if (direction === 'yukari' && makroScore <= -20) return -7;
  if (direction === 'asagi'  && makroScore >=  20) return -7;
  return 0;
}

function winRateAdjustment(winRate: number | null, n: number): number {
  if (winRate === null || n < MIN_N_FOR_WR) return 0;
  // 50% → 0, 65% → +12, 35% → -12, (cap ±15)
  const delta = (winRate - 0.5) * 80;
  return Math.max(-15, Math.min(15, delta));
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const statsCutoff = new Date();
    statsCutoff.setDate(statsCutoff.getDate() - STATS_LOOKBACK_D);

    // Paralel çek: aktif sinyaller + geçmiş win rate verisi + makro
    const [sinyalRes, statsRes, macroRes] = await Promise.allSettled([
      supabase
        .from('signal_performance')
        .select('sembol, signal_type, direction, entry_price, entry_time, confluence_score, regime')
        .eq('evaluated', false)
        .gte('entry_time', cutoff.toISOString())
        .gte('confluence_score', MIN_CONFLUENCE)
        .order('confluence_score', { ascending: false }),

      supabase
        .from('signal_performance')
        .select('signal_type, direction, return_3d, return_7d, return_14d, return_30d')
        .eq('evaluated', true)
        .gte('entry_time', statsCutoff.toISOString()),

      getMacroFull(),
    ]);

    if (sinyalRes.status !== 'fulfilled' || sinyalRes.value.error) {
      const msg = sinyalRes.status === 'fulfilled'
        ? sinyalRes.value.error?.message ?? 'DB hatası'
        : String(sinyalRes.reason);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const rows = (sinyalRes.value.data ?? []) as {
      sembol: string;
      signal_type: string;
      direction: string;
      entry_price: number;
      entry_time: string;
      confluence_score: number;
      regime: string | null;
    }[];

    // Win rate haritası
    const winRateMap = statsRes.status === 'fulfilled' && !statsRes.value.error
      ? computeWinRates(statsRes.value.data ?? [])
      : new Map<string, { winRate: number; n: number }>();

    // Makro skor
    let makroScore: number | null = null;
    if (macroRes.status === 'fulfilled') {
      makroScore = macroRes.value.macroScore.score;
    }
    const regime: string | null = rows[0]?.regime ?? null;

    // Sembol bazında grupla
    const gruplar = new Map<string, typeof rows>();
    for (const row of rows) {
      const mevcut = gruplar.get(row.sembol) ?? [];
      mevcut.push(row);
      gruplar.set(row.sembol, mevcut);
    }

    // Sektör → sinyal veren hisse sayısı
    const sektorSayaci = new Map<string, Set<string>>();
    for (const sembol of gruplar.keys()) {
      const sektorId = getSectorId(sembol);
      if (!sektorSayaci.has(sektorId)) sektorSayaci.set(sektorId, new Set());
      sektorSayaci.get(sektorId)!.add(sembol);
    }

    const now = Date.now();
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

      const baseScore  = Math.round(best.confluence_score ?? 0);
      const ageHours   = Math.max(0, (now - new Date(best.entry_time).getTime()) / 3_600_000);
      const decay      = timeDecayMultiplier(ageHours);

      const wrEntry    = winRateMap.get(best.signal_type);
      const histWr     = wrEntry?.winRate ?? null;
      const histN      = wrEntry?.n ?? 0;

      const wrAdj      = winRateAdjustment(histWr, histN);
      const regimeAdj  = regimeAdjustment(direction, best.regime);
      const macroAdj   = macroAdjustment(direction, makroScore);

      // Adjusted = (base × decay) + ayarlamalar; 0-100 clamp
      const rawAdjusted = baseScore * decay + wrAdj + regimeAdj + macroAdj;
      const adjustedScore = Math.max(0, Math.min(100, Math.round(rawAdjusted)));

      firsatlar.push({
        sembol,
        sektorAdi:          sektorBilgi.shortName,
        sektorId,
        sinyaller:          uniqueSinyaller,
        direction,
        confluenceScore:    baseScore,
        adjustedScore,
        entryPrice:         best.entry_price,
        entryTime:          best.entry_time,
        ageHours:           Math.round(ageHours * 10) / 10,
        regime:             best.regime,
        sektorSinyalSayisi,
        historicalWinRate:  histWr,
        winRateN:           histN,
        adjustments: {
          timeDecay:  Math.round(decay * 100) / 100,
          winRate:    Math.round(wrAdj),
          regimeFit:  regimeAdj,
          macroAlign: macroAdj,
        },
      });
    }

    // Nihai skora göre sırala (en yüksek → en düşük)
    firsatlar.sort((a, b) => b.adjustedScore - a.adjustedScore);

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
