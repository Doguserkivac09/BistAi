/**
 * GET /api/emtia-analiz
 *
 * Endeks, emtia ve döviz enstrümanlarında teknik sinyal analizi.
 * BIST hisseleriyle aynı sinyal motoru → AL / TUT / SAT kararı.
 *
 * Cache: 15 dakika
 */

import { NextResponse } from 'next/server';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals, computeConfluence } from '@/lib/signals';
import { INSTRUMENTS, type InstrumentAnalysis } from '@/lib/emtia-instruments';
import type { OHLCVCandle } from '@/types';

/** RSI(14) son değeri */
function calcRSI(candles: OHLCVCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const closes = candles.map((c) => c.close);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(0, d))  / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 10) / 10;
}

/** relVol5 */
function calcRelVol5(candles: OHLCVCandle[]): number | null {
  if (candles.length < 6) return null;
  const lastVol = candles[candles.length - 1]?.volume ?? 0;
  const avg5 = candles.slice(-6, -1).reduce((s, c) => s + c.volume, 0) / 5;
  return avg5 > 0 ? Math.round((lastVol / avg5) * 100) / 100 : null;
}

/** AL / TUT / SAT kararı + özet gerekçe */
function makeDecision(
  signals: Array<{ type: string; direction: string; severity: string }>,
  confluenceScore: number | null,
  rsi: number | null,
): { decision: 'AL' | 'TUT' | 'SAT'; score: number; reason: string } {
  const conf = confluenceScore ?? 0;
  const r    = rsi ?? 50;
  const yukariSigs = signals.filter((s) => s.direction === 'yukari').length;
  const asagiSigs  = signals.filter((s) => s.direction === 'asagi').length;

  if (conf >= 65 && yukariSigs > asagiSigs && r < 80) {
    return {
      decision: 'AL', score: Math.min(100, conf + 10),
      reason: conf >= 80
        ? `Güçlü teknik altyapı (${conf}) — ${yukariSigs} yukarı sinyal`
        : `Pozitif momentum (${conf}) — sinyal uyumu var`,
    };
  }
  if ((conf >= 65 && asagiSigs > yukariSigs) || (r > 80 && asagiSigs > 0)) {
    return {
      decision: 'SAT', score: Math.min(100, conf + 10),
      reason: r > 80
        ? `Aşırı alım (RSI ${r}) + ${asagiSigs} aşağı sinyal`
        : `Zayıf momentum (${conf}) — ${asagiSigs} aşağı sinyal`,
    };
  }
  if (conf >= 45 && yukariSigs > 0 && asagiSigs === 0) {
    return { decision: 'AL', score: conf, reason: `Orta güçlü sinyal (${conf}), yukarı yön` };
  }
  if (conf >= 45 && asagiSigs > 0 && yukariSigs === 0) {
    return { decision: 'SAT', score: conf, reason: `Orta güçlü sinyal (${conf}), aşağı yön` };
  }
  return {
    decision: 'TUT', score: 50,
    reason: signals.length === 0
      ? 'Belirgin teknik sinyal yok — bekle'
      : `Karışık sinyaller (${yukariSigs}↑ ${asagiSigs}↓) — net yön yok`,
  };
}

// ── In-memory cache ──────────────────────────────────────────────────
let cache: { data: InstrumentAnalysis[]; expiry: number } | null = null;
const CACHE_TTL = 15 * 60_000;

export async function GET() {
  if (cache && Date.now() < cache.expiry) {
    return NextResponse.json(
      { ok: true, instruments: cache.data, cached: true },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
    );
  }

  const results = await Promise.allSettled(
    INSTRUMENTS.map(async (inst) => {
      const { candles, changePercent } = await fetchOHLCV(inst.symbol, 365);
      if (candles.length < 20) throw new Error('Yetersiz veri');

      const signals = detectAllSignals(inst.nameShort, candles);
      const conf    = signals.length > 0 ? computeConfluence(signals) : null;
      const rsi     = calcRSI(candles);
      const relVol5 = calcRelVol5(candles);
      const last    = candles[candles.length - 1];
      const last252 = candles.slice(-252);
      const highs   = last252.map((c) => c.high);
      const lows    = last252.map((c) => c.low);

      const chg = changePercent ?? (
        candles.length >= 2
          ? ((candles[candles.length-1]!.close - candles[candles.length-2]!.close)
             / candles[candles.length-2]!.close) * 100
          : null
      );

      const { decision, score, reason } = makeDecision(signals, conf?.score ?? null, rsi);

      return {
        symbol:        inst.symbol,
        name:          inst.name,
        nameShort:     inst.nameShort,
        category:      inst.category,
        currency:      inst.currency,
        icon:          inst.icon,
        desc:          inst.desc,
        lastClose:     last?.close ?? null,
        changePercent: chg,
        rsi,
        relVol5,
        confluenceScore: conf?.score ?? null,
        signals: signals.map((s) => ({ type: s.type, direction: s.direction, severity: s.severity })),
        decision,
        decisionScore: score,
        keyReason:     reason,
        support52w:    lows.length > 0  ? Math.min(...lows)  : null,
        resistance52w: highs.length > 0 ? Math.max(...highs) : null,
        error:         null,
      } satisfies InstrumentAnalysis;
    })
  );

  const instruments: InstrumentAnalysis[] = results.map((r, i) => {
    const inst = INSTRUMENTS[i]!;
    if (r.status === 'fulfilled') return r.value;
    return {
      symbol: inst.symbol, name: inst.name, nameShort: inst.nameShort,
      category: inst.category, currency: inst.currency, icon: inst.icon, desc: inst.desc,
      lastClose: null, changePercent: null, rsi: null, relVol5: null,
      confluenceScore: null, signals: [],
      decision: 'TUT', decisionScore: 0, keyReason: 'Veri alınamadı',
      support52w: null, resistance52w: null,
      error: r.reason instanceof Error ? r.reason.message : 'Bilinmeyen hata',
    };
  });

  cache = { data: instruments, expiry: Date.now() + CACHE_TTL };

  return NextResponse.json(
    { ok: true, instruments, cached: false },
    { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
  );
}
