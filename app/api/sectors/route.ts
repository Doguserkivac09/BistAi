import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getAllSectors, getSymbolsBySector, SECTORS, SECTOR_REPRESENTATIVES } from '@/lib/sectors';
import { analyzeSector, analyzeAllSectors } from '@/lib/sector-engine';
import { fetchOHLCV } from '@/lib/yahoo';
import { getMacroScore } from '@/lib/macro-service';
import type { SectorId } from '@/lib/sectors';
import type { OHLCVCandle } from '@/types';

/**
 * Sektör Momentum API.
 *
 * GET /api/sectors
 *   → Tüm sektörlerin listesi + momentum skorları
 *
 * GET /api/sectors?id=banka
 *   → Tek sektör detaylı analiz
 *
 * GET /api/sectors?list=true
 *   → Sadece sektör listesi (hızlı, veri çekme yok)
 *
 * Rate limit: 20 req/min per IP
 *
 * Phase 5.4
 */

const MAX_REQUESTS = 20;
const WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`${ip}:sectors`, MAX_REQUESTS, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  const { searchParams } = request.nextUrl;

  // Sadece sektör listesi (statik, uzun cache)
  if (searchParams.get('list') === 'true') {
    return NextResponse.json(
      { sectors: getAllSectors() },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  }

  // Tek sektör detay
  const sectorId = searchParams.get('id') as SectorId | null;
  if (sectorId && SECTORS[sectorId]) {
    return handleSingleSector(sectorId);
  }

  // Tüm sektörler özet
  return handleAllSectors();
}

async function handleSingleSector(sectorId: SectorId): Promise<NextResponse> {
  try {
    const symbols = getSymbolsBySector(sectorId);
    if (symbols.length === 0) {
      return NextResponse.json({ error: 'Sektörde hisse bulunamadı.' }, { status: 404 });
    }

    const [sectorData, macroScore] = await Promise.all([
      fetchSectorData(symbols),
      getMacroScore().catch(() => null),
    ]);

    const analysis = analyzeSector(sectorId, sectorData, macroScore);
    return NextResponse.json(
      analysis,
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error(`[api/sectors] Hata (${sectorId}):`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleAllSectors(): Promise<NextResponse> {
  try {
    const allSectors = getAllSectors();
    const macroScore = await getMacroScore().catch(() => null);

    const sectorDataMap = {} as Record<SectorId, Record<string, OHLCVCandle[]>>;
    const fetchPromises: Array<Promise<void>> = [];

    // Tek SoT: frontend'in kullandığı SECTOR_REPRESENTATIVES (B3 fix)
    // → API ve UI aynı hisse seti üzerinden hesaplar, makro alignment + composite tutarlı.
    for (const sector of allSectors) {
      const reps = SECTOR_REPRESENTATIVES[sector.id];
      const symbols = reps && reps.length > 0 ? reps : sector.symbols.slice(0, 5);
      fetchPromises.push(
        fetchSectorData(symbols).then((data) => {
          sectorDataMap[sector.id] = data;
        })
      );
    }

    await Promise.all(fetchPromises);

    const snapshot = analyzeAllSectors(sectorDataMap, macroScore);
    return NextResponse.json(
      snapshot,
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[api/sectors] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Yardımcı ────────────────────────────────────────────────────────

async function fetchSectorData(
  symbols: string[]
): Promise<Record<string, OHLCVCandle[]>> {
  const results = await Promise.allSettled(
    symbols.map(async (s) => {
      // 60 işlem günü için en az ~90 takvim günü gerek; 120 güvenli (B1 fix)
      const { candles: data } = await fetchOHLCV(s, 120);
      return { symbol: s, data };
    })
  );

  const out: Record<string, OHLCVCandle[]> = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.data.length > 0) {
      out[r.value.symbol] = r.value.data;
    }
  }
  return out;
}
