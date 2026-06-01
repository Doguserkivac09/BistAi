export const dynamic = 'force-dynamic';
/**
 * GET /api/firsatlar-us
 *
 * scan_cache (market='US') → FirsatItem uyumlu response.
 * /api/firsatlar'ın US karşılığı — signal_performance yerine scan_cache okur.
 *
 * Eksik alanlar (BIST-specific):
 *  - kapUyarisi: null (SEC/haber kontrolü ilerleyen fazda)
 *  - historicalWinRate: null (US signal_performance henüz yok)
 *  - avgDailyVolumeTL: USD bazlı, null
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import type { FirsatItem, FirsatlarResponse } from '@/app/api/firsatlar/route';

const MIN_CONFLUENCE = 50;
const LOOKBACK_HOURS = 48;

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(_req: NextRequest) {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();

  const [scanRes, macroRes] = await Promise.allSettled([
    admin
      .from('scan_cache')
      .select('sembol, signals_json, confluence_score, rel_vol5, last_close, change_percent, rsi, sector, scanned_at, candles_json')
      .eq('market', 'US')
      .gte('confluence_score', MIN_CONFLUENCE)
      .gte('scanned_at', cutoff)
      .order('confluence_score', { ascending: false })
      .limit(100),
    getMacroFull().catch(() => null),
  ]);

  if (scanRes.status === 'rejected' || scanRes.value.error) {
    return NextResponse.json({ firsatlar: [], makroScore: null, regime: null, toplamSinyal: 0, scannedAt: null, lastRefreshedAt: null });
  }

  const rows = scanRes.value.data ?? [];
  const macroScore = macroRes.status === 'fulfilled' && macroRes.value
    ? macroRes.value.macroScore?.score ?? null
    : null;

  // Sektör sinyal sayısı
  const sektorSayaci = new Map<string, number>();
  for (const r of rows) {
    const sector = (r.sector as string) ?? 'Other';
    sektorSayaci.set(sector, (sektorSayaci.get(sector) ?? 0) + 1);
  }

  const firsatlar: FirsatItem[] = [];
  const now = Date.now();

  for (const r of rows) {
    const signals = (r.signals_json ?? []) as Array<{
      type: string; direction: string; severity: string;
      weeklyAligned?: boolean; stopLoss?: number; targetPrice?: number; riskRewardRatio?: number;
      atr?: number;
    }>;

    // Sadece AL yönlü sinyaller
    const alSigs = signals.filter((s) => s.direction === 'yukari');
    if (alSigs.length === 0) continue;

    const topSig = [...alSigs].sort((a, b) => {
      const order: Record<string, number> = { güçlü: 3, orta: 2, zayıf: 1 };
      return (order[b.severity] ?? 0) - (order[a.severity] ?? 0);
    })[0]!;

    const entryPrice = (r.last_close as number | null) ?? 0;
    if (entryPrice <= 0) continue;

    const scannedAt  = r.scanned_at as string;
    const ageHours   = (now - new Date(scannedAt).getTime()) / 3_600_000;
    const timeDecay  = Math.max(0.3, 1 - ageHours / 96);  // 4 gün decay
    const adjustedScore = Math.round((r.confluence_score as number) * timeDecay);

    const sector = (r.sector as string) ?? 'Other';

    firsatlar.push({
      sembol:            r.sembol as string,
      sektorAdi:         sector,
      sektorId:          sector.toLowerCase().replace(/\s+/g, '_'),
      sinyaller:         alSigs.map((s) => s.type),
      direction:         'yukari',
      confluenceScore:   r.confluence_score as number,
      adjustedScore,
      entryPrice,
      entryTime:         scannedAt,
      ageHours,
      regime:            null,
      sektorSinyalSayisi: sektorSayaci.get(sector) ?? 1,
      historicalWinRate:  null,
      winRateN:           0,
      avgDailyVolumeTL:   null,  // USD bazlı, TL metrik yok
      weeklyAligned:      topSig.weeklyAligned ?? null,
      stopLoss:           topSig.stopLoss ?? null,
      targetPrice:        topSig.targetPrice ?? null,
      riskRewardRatio:    topSig.riskRewardRatio ?? null,
      kapUyarisi:         null,  // US: KAP yok (SEC/haber Faz 2'de)
      adjustments: {
        timeDecay,
        winRate:    0,
        regimeFit:  0,
        macroAlign: macroScore !== null ? (macroScore > 20 ? 3 : macroScore < -20 ? -3 : 0) : 0,
        mtfAlign:   topSig.weeklyAligned === true ? 5 : topSig.weeklyAligned === false ? -3 : 0,
        kapEvent:   0,
      },
      tavanScore:      null,
      isTavan:         false,
      isTaban:         false,
      tavanYaklasıyor: false,
      tavanLabel:      null,
      changePercent:   (r.change_percent as number | null) ?? null,
      persistedDays:   null,
      decision:        {
        sembol: r.sembol as string, action: 'BUY', score: adjustedScore, confidence: 60,
        direction: 'yukari', rating: 'izle', stalenessHours: ageHours,
        factors: [], keyFactors: [`US · Conf:${r.confluence_score} · relVol:${(r.rel_vol5 as number | null)?.toFixed(1) ?? '?'}x`],
        compositeScore: adjustedScore, technicalScore: adjustedScore, macroScore: 0, sectorScore: 0,
      } as unknown as FirsatItem['decision'],
      investmentScore: null,
    });
  }

  // adjustedScore'a göre sırala
  firsatlar.sort((a, b) => b.adjustedScore - a.adjustedScore);

  const scannedAt = rows[0]?.scanned_at as string | null ?? null;

  return NextResponse.json({
    firsatlar,
    makroScore:      macroScore,
    regime:          null,
    toplamSinyal:    firsatlar.length,
    scannedAt,
    lastRefreshedAt: scannedAt,
  } satisfies FirsatlarResponse);
}
