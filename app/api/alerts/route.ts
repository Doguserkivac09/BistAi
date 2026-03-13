import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { fetchAllMacroQuotes } from '@/lib/macro-data';
import { fetchAllTurkeyMacro } from '@/lib/turkey-macro';
import { fetchAllFredData } from '@/lib/fred';
import { calculateMacroScore } from '@/lib/macro-score';
import { calculateRiskScore } from '@/lib/risk-engine';
import { generateMacroAlerts, generateRiskAlerts } from '@/lib/alerts';

/**
 * Alerts API — Güncel makro/risk uyarıları.
 *
 * GET /api/alerts
 *   → Güncel alert listesi (makro + risk bazlı)
 *
 * Rate limit: 30 req/min per IP
 *
 * Phase 7.3
 */

const MAX_REQUESTS = 30;
const WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`${ip}:alerts`, MAX_REQUESTS, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  try {
    // Makro + risk verilerini çek
    const [macroSnapshot, turkeyData, fredData] = await Promise.all([
      fetchAllMacroQuotes(),
      fetchAllTurkeyMacro(),
      fetchAllFredData(),
    ]);

    const macroScore = calculateMacroScore(macroSnapshot, turkeyData, fredData);
    const riskScore = calculateRiskScore(macroSnapshot, turkeyData);

    // Alert üret (önceki veri olmadan — sadece güncel durum bazlı)
    const macroAlerts = generateMacroAlerts(macroScore, null);
    const riskAlerts = generateRiskAlerts(riskScore, null);

    const allAlerts = [...macroAlerts, ...riskAlerts];

    return NextResponse.json({
      alerts: allAlerts,
      count: allAlerts.length,
      macroScore: macroScore.score,
      riskLevel: riskScore.level,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[api/alerts] Hata:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
