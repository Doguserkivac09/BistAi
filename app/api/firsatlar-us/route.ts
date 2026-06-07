export const dynamic = 'force-dynamic';
/**
 * GET /api/firsatlar-us
 *
 * scan_cache (market='US') → FirsatItem uyumlu response.
 * AL (yukari) + SAT (asagi) sinyallerini ayrı döndürür.
 * Hacim ADV (ortalama günlük hacim × son kapanış) USD bazlı olarak hesaplanır.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import type { FirsatItem, FirsatlarResponse } from '@/app/api/firsatlar/route';

const MIN_CONFLUENCE = 50;
const LOOKBACK_HOURS = 48;
const COMMISSION = 0.004;

/** Her sinyal tipinin win rate hesabında kullanılan canonical return alanı */
const SIGNAL_CANONICAL_FIELD: Record<string, 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'> = {
  'Altın Çapraz':            'return_30d',
  'Ölüm Çaprazı':            'return_30d',
  'Cup & Handle':            'return_30d',
  'Ters Omuz-Baş-Omuz':      'return_30d',
  'Trend Başlangıcı':        'return_14d',
  'Destek/Direnç Kırılımı':  'return_14d',
  'Higher Lows':             'return_14d',
  'Çift Dip':                'return_14d',
  'Çift Tepe':               'return_14d',
  'Bull Flag':               'return_14d',
  'Bear Flag':               'return_14d',
  'Yükselen Üçgen':          'return_14d',
  'MACD Kesişimi':           'return_7d',
  'RSI Uyumsuzluğu':         'return_7d',
  'Bollinger Sıkışması':     'return_7d',
  'RSI Seviyesi':            'return_3d',
  'Hacim Anomalisi':         'return_3d',
};

type PerfStatRow = {
  signal_type: string | null;
  direction: string | null;
  return_3d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d: number | null;
};

/** signal_type bazında win rate (komisyon dahil net getiri > 0 oranı) */
function computeWinRates(records: PerfStatRow[]): Map<string, { winRate: number; n: number }> {
  const groups = new Map<string, PerfStatRow[]>();
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
      return v != null && Number.isFinite(v);
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

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type SignalEntry = {
  type: string;
  direction: string;
  severity: string;
  weeklyAligned?: boolean;
  stopLoss?: number;
  targetPrice?: number;
  riskRewardRatio?: number;
  atr?: number;
  avgDailyVolumeTL?: number | null;
};

type CandleEntry = { close: number; volume: number };

/** USD ortalama günlük hacim (son 20 gün) × son kapanış → notional ADV */
function calcADV(candles: CandleEntry[], lastClose: number | null): number | null {
  if (!lastClose || lastClose <= 0 || candles.length < 5) return null;
  const last20 = candles.slice(-20);
  const avgVol = last20.reduce((s, c) => s + (c.volume ?? 0), 0) / last20.length;
  return avgVol * lastClose; // USD notional
}

function buildKeyFactors(
  sembol: string,
  alSigs: SignalEntry[],
  satSigs: SignalEntry[],
  confluenceScore: number,
  relVol5: number | null,
  changePercent: number | null,
  adv: number | null,
  weeklyAligned: boolean | null,
  macroScore: number | null,
): string[] {
  const factors: string[] = [];

  // Sinyal tipleri
  const sigNames = [...alSigs, ...satSigs].map((s) => s.type).join(', ');
  if (sigNames) factors.push(`📊 Sinyaller: ${sigNames}`);

  // Güç & uyum
  factors.push(`🎯 Güç: ${confluenceScore} · MTF ${weeklyAligned === true ? '✓ Uyumlu' : weeklyAligned === false ? '✗ Uyumsuz' : '–'}`);

  // Hacim
  if (relVol5 !== null) {
    const label = relVol5 >= 2 ? '⚡ Yüksek hacim' : relVol5 >= 1.3 ? '📈 Artan hacim' : '📉 Zayıf hacim';
    factors.push(`${label}: ${relVol5.toFixed(1)}× ortalama`);
  }

  // ADV (likidite)
  if (adv !== null) {
    const advM = adv / 1_000_000;
    factors.push(`💧 ADV: $${advM >= 1000 ? (advM / 1000).toFixed(1) + 'B' : advM.toFixed(0) + 'M'}`);
  }

  // Günlük değişim
  if (changePercent !== null) {
    const sign = changePercent >= 0 ? '+' : '';
    factors.push(`📅 Gün içi: ${sign}${changePercent.toFixed(2)}%`);
  }

  // Makro uyum
  if (macroScore !== null) {
    const label = macroScore > 20 ? '🌍 Makro: Olumlu' : macroScore < -20 ? '🌍 Makro: Olumsuz' : '🌍 Makro: Nötr';
    factors.push(label);
  }

  return factors;
}

function buildFirsatItem(
  r: Record<string, unknown>,
  direction: 'yukari' | 'asagi',
  signals: SignalEntry[],
  sektorSayaci: Map<string, number>,
  macroScore: number | null,
  winRateMap: Map<string, { winRate: number; n: number }>,
  now: number,
): FirsatItem | null {
  const dirSigs = signals.filter((s) => s.direction === direction);
  if (dirSigs.length === 0) return null;

  const topSig = [...dirSigs].sort((a, b) => {
    const order: Record<string, number> = { güçlü: 3, orta: 2, zayıf: 1 };
    return (order[b.severity] ?? 0) - (order[a.severity] ?? 0);
  })[0]!;

  // En güçlü sinyalin geçmiş win rate'i (en az 5 değerlendirilmiş kayıt)
  const wr = winRateMap.get(topSig.type) ?? null;

  const entryPrice = (r.last_close as number | null) ?? 0;
  if (entryPrice <= 0) return null;

  const candles = (r.candles_json ?? []) as CandleEntry[];
  const adv = calcADV(candles, entryPrice);

  const scannedAt = r.scanned_at as string;
  const ageHours  = (now - new Date(scannedAt).getTime()) / 3_600_000;
  const timeDecay = Math.max(0.3, 1 - ageHours / 96);
  const confluenceScore = r.confluence_score as number;
  const adjustedScore   = Math.round(confluenceScore * timeDecay);

  const sector       = (r.sector as string) ?? 'Other';
  const relVol5      = (r.rel_vol5 as number | null) ?? null;
  const changePercent = (r.change_percent as number | null) ?? null;
  const weeklyAligned = topSig.weeklyAligned ?? null;

  const alSigs  = signals.filter((s) => s.direction === 'yukari');
  const satSigs = signals.filter((s) => s.direction === 'asagi');

  const keyFactors = buildKeyFactors(
    r.sembol as string, alSigs, satSigs,
    confluenceScore, relVol5, changePercent,
    adv, weeklyAligned, macroScore,
  );

  // Geçmiş başarı oranı (varsa en başa ekle — en güçlü sinyal)
  if (wr) {
    keyFactors.unshift(`🏆 Geçmiş başarı: %${Math.round(wr.winRate * 100)} (${wr.n} sinyal)`);
  }

  const macroAlign = macroScore !== null
    ? (macroScore > 20 ? 3 : macroScore < -20 ? -3 : 0)
    : 0;

  return {
    sembol:            r.sembol as string,
    sektorAdi:         sector,
    sektorId:          sector.toLowerCase().replace(/\s+/g, '_'),
    sinyaller:         dirSigs.map((s) => s.type),
    direction,
    confluenceScore,
    adjustedScore,
    entryPrice,
    entryTime:         scannedAt,
    ageHours,
    regime:            null,
    sektorSinyalSayisi: sektorSayaci.get(sector) ?? 1,
    historicalWinRate:  wr ? wr.winRate : null,
    winRateN:           wr ? wr.n : 0,
    avgDailyVolumeTL:   adv,   // USD ADV (alan adı TL ama US için USD kullanıyoruz)
    weeklyAligned,
    stopLoss:           topSig.stopLoss ?? null,
    targetPrice:        topSig.targetPrice ?? null,
    riskRewardRatio:    topSig.riskRewardRatio ?? null,
    kapUyarisi:         null,
    adjustments: {
      timeDecay,
      // Win rate katkısı: >%60 pozitif, <%40 negatif (sadece n≥5 değerlendirilmişse)
      winRate:    wr ? (wr.winRate > 0.6 ? 5 : wr.winRate < 0.4 ? -5 : 0) : 0,
      regimeFit:  0,
      macroAlign,
      mtfAlign:   weeklyAligned === true ? 5 : weeklyAligned === false ? -3 : 0,
      kapEvent:   0,
    },
    tavanScore:      null,
    isTavan:         false,
    isTaban:         false,
    tavanYaklasıyor: false,
    tavanLabel:      null,
    changePercent,
    persistedDays:   null,
    decision: {
      sembol:         r.sembol as string,
      action:         direction === 'yukari' ? 'BUY' : 'SELL',
      score:          adjustedScore,
      confidence:     60,
      direction,
      rating:         'izle',
      stalenessHours: ageHours,
      factors:        [],
      keyFactors,
      compositeScore:  adjustedScore,
      technicalScore:  adjustedScore,
      macroScore:      0,
      sectorScore:     0,
    } as unknown as FirsatItem['decision'],
    investmentScore: null,
    catalyst: null, // US tarafında haber katalisti precompute edilmiyor (TR haber kaynağı)
  };
}

export async function GET(_req: NextRequest) {
  const admin  = createAdminClient();
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();

  const [scanRes, macroRes, statsRes] = await Promise.allSettled([
    admin
      .from('scan_cache')
      .select('sembol, signals_json, confluence_score, rel_vol5, last_close, change_percent, rsi, sector, scanned_at, candles_json')
      .eq('market', 'US')
      .gte('confluence_score', MIN_CONFLUENCE)
      .gte('scanned_at', cutoff)
      .order('confluence_score', { ascending: false })
      .limit(200),
    getMacroFull().catch(() => null),
    // US geçmiş performans — win rate hesabı için (evaluated kayıtlar)
    admin
      .from('signal_performance')
      .select('signal_type, direction, return_3d, return_7d, return_14d, return_30d')
      .eq('market', 'US')
      .eq('evaluated', true),
  ]);

  if (scanRes.status === 'rejected' || scanRes.value.error) {
    return NextResponse.json({ firsatlar: [], makroScore: null, regime: null, toplamSinyal: 0, scannedAt: null, lastRefreshedAt: null });
  }

  const rows = scanRes.value.data ?? [];
  const macroScore = macroRes.status === 'fulfilled' && macroRes.value
    ? macroRes.value.macroScore?.score ?? null
    : null;

  // US win rate haritası (signal_type → { winRate, n })
  const winRateMap = statsRes.status === 'fulfilled' && !statsRes.value.error
    ? computeWinRates((statsRes.value.data ?? []) as PerfStatRow[])
    : new Map<string, { winRate: number; n: number }>();

  // Sektör sinyal sayısı
  const sektorSayaci = new Map<string, number>();
  for (const r of rows) {
    const sector = (r.sector as string) ?? 'Other';
    sektorSayaci.set(sector, (sektorSayaci.get(sector) ?? 0) + 1);
  }

  const firsatlar: FirsatItem[] = [];
  const now = Date.now();

  for (const r of rows) {
    const signals = (r.signals_json ?? []) as SignalEntry[];
    if (signals.length === 0) continue;

    // AL sinyali varsa AL fırsatı oluştur
    const alItem = buildFirsatItem(r as Record<string, unknown>, 'yukari', signals, sektorSayaci, macroScore, winRateMap, now);
    if (alItem) firsatlar.push(alItem);

    // SAT sinyali varsa SAT fırsatı oluştur (AL fırsatı yoksa göster)
    if (!alItem) {
      const satItem = buildFirsatItem(r as Record<string, unknown>, 'asagi', signals, sektorSayaci, macroScore, winRateMap, now);
      if (satItem) firsatlar.push(satItem);
    }
  }

  // adjustedScore'a göre sırala
  firsatlar.sort((a, b) => b.adjustedScore - a.adjustedScore);

  const scannedAt = rows[0]?.scanned_at as string | null ?? null;

  return NextResponse.json({
    firsatlar,
    makroScore: macroScore,
    regime:          null,
    toplamSinyal:    firsatlar.length,
    scannedAt,
    lastRefreshedAt: scannedAt,
  } satisfies FirsatlarResponse);
}
