/**
 * Portföydeki hisseler için aktif sinyaller.
 * GET /api/portfolyo/sinyaller?semboller=THYAO,GARAN,ASELS
 * Yanıt: Record<sembol, { type, direction, severity }[]>
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals } from '@/lib/signals';

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get('semboller');
  if (!param) return NextResponse.json({});

  const semboller = param
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20); // max 20 sembol

  const results = await Promise.allSettled(
    semboller.map(async (sembol) => {
      const { candles } = await fetchOHLCV(sembol, 90);
      if (candles.length === 0) return { sembol, signals: [] };
      const signals = detectAllSignals(sembol, candles);
      return {
        sembol,
        signals: signals.map((s) => ({
          type:      s.type,
          direction: s.direction,
          severity:  s.severity,
        })),
      };
    })
  );

  const out: Record<string, { type: string; direction: string; severity: string }[]> = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      out[r.value.sembol] = r.value.signals;
    }
  }

  return NextResponse.json(out);
}
