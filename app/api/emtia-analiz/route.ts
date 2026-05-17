/**
 * GET /api/emtia-analiz
 *
 * Kurumsal düzeyde çoklu enstrüman analizi.
 * Günlük + haftalık MTF, ATR volatilite, pivot seviyeleri,
 * korelasyon bazlı makro rejim tespiti.
 *
 * Cache: 15 dakika
 */

import { NextResponse } from 'next/server';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals, computeConfluence } from '@/lib/signals';
import {
  INSTRUMENTS,
  type InstrumentAnalysis,
  type MacroRegimeSummary,
  type VolatilityLevel,
  type MtfAlignment,
} from '@/lib/emtia-instruments';
import type { OHLCVCandle } from '@/types';

// ── Teknik Hesaplama Yardımcıları ─────────────────────────────────────

function calcRSI(candles: OHLCVCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const closes = candles.map((c) => c.close);
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) g += d; else l -= d;
  }
  g /= period; l /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    g = (g * (period - 1) + Math.max(0, d))  / period;
    l = (l * (period - 1) + Math.max(0, -d)) / period;
  }
  if (l === 0) return 100;
  return Math.round((100 - 100 / (1 + g / l)) * 10) / 10;
}

function calcATRPct(candles: OHLCVCandle[], period = 14): number | null {
  if (candles.length < period + 2) return null;
  const trs: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!.close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
  }
  const atr = trs.reduce((s, v) => s + v, 0) / trs.length;
  const price = candles[candles.length - 1]!.close;
  return Math.round((atr / price) * 10000) / 100; // % olarak
}

function volatilityLevel(atrPct: number | null): VolatilityLevel | null {
  if (atrPct == null) return null;
  if (atrPct < 0.8)  return 'dusuk';
  if (atrPct < 1.8)  return 'normal';
  if (atrPct < 3.0)  return 'yukseldi';
  return 'yuksek';
}

function calcRelVol5(candles: OHLCVCandle[]): number | null {
  if (candles.length < 6) return null;
  const lastVol = candles[candles.length - 1]?.volume ?? 0;
  const avg5 = candles.slice(-6, -1).reduce((s, c) => s + c.volume, 0) / 5;
  return avg5 > 0 ? Math.round((lastVol / avg5) * 100) / 100 : null;
}

/** Günlük mumlardan haftalık mumlar türet */
function toWeeklyCandles(daily: OHLCVCandle[]): OHLCVCandle[] {
  const weekly: OHLCVCandle[] = [];
  let wk: OHLCVCandle | null = null;
  for (const d of daily) {
    const dDate = new Date(d.date);
    const day   = dDate.getDay(); // 1=Mon ... 5=Fri
    if (!wk || day === 1) {
      if (wk) weekly.push(wk);
      wk = { ...d };
    } else {
      wk.high   = Math.max(wk.high, d.high);
      wk.low    = Math.min(wk.low, d.low);
      wk.close  = d.close;
      wk.volume = (wk.volume ?? 0) + (d.volume ?? 0);
    }
  }
  if (wk) weekly.push(wk);
  return weekly;
}

/** EMA(n) son değeri */
function ema(candles: OHLCVCandle[], n: number): number | null {
  if (candles.length < n) return null;
  const k = 2 / (n + 1);
  let e = candles[candles.length - n]!.close;
  for (let i = candles.length - n + 1; i < candles.length; i++) {
    e = candles[i]!.close * k + e * (1 - k);
  }
  return e;
}

/** Günlük Pivot S1/R1 */
function calcPivots(candles: OHLCVCandle[]): { s1: number | null; r1: number | null } {
  const prev = candles[candles.length - 2];
  if (!prev) return { s1: null, r1: null };
  const pivot = (prev.high + prev.low + prev.close) / 3;
  return {
    s1: parseFloat((2 * pivot - prev.high).toFixed(2)),
    r1: parseFloat((2 * pivot - prev.low).toFixed(2)),
  };
}

/** MTF uyumu: günlük yön + haftalık yön */
function calcMtfAlignment(
  dailyRsi: number | null,
  weeklyRsi: number | null,
  dailySignals: Array<{ direction: string }>,
): MtfAlignment | null {
  if (!dailyRsi || !weeklyRsi) return null;
  const dailyUp  = dailyRsi > 50;
  const weeklyUp = weeklyRsi > 50;
  if (dailyUp && weeklyUp)   return 'uyumlu';
  if (!dailyUp && !weeklyUp) return 'uyumlu';
  return 'karisik';
}

/** Momentum (n gün % değişim) */
function momentum(candles: OHLCVCandle[], n: number): number | null {
  if (candles.length < n + 1) return null;
  const now  = candles[candles.length - 1]!.close;
  const past = candles[candles.length - 1 - n]!.close;
  return parseFloat((((now - past) / past) * 100).toFixed(2));
}

// ── Karar Motoru ──────────────────────────────────────────────────────

function makeDecision(
  signals: Array<{ type: string; direction: string; severity: string }>,
  confluenceScore: number | null,
  rsi: number | null,
  weeklyRsi: number | null,
  mtf: MtfAlignment | null,
  momentum5d: number | null,
  momentum30d: number | null,
): { decision: 'AL' | 'TUT' | 'SAT'; score: number; reason: string; bull: string[]; bear: string[]; confidence: 'dusuk' | 'orta' | 'yuksek' } {
  const conf = confluenceScore ?? 0;
  const r    = rsi ?? 50;
  const wr   = weeklyRsi ?? 50;
  const m5   = momentum5d ?? 0;
  const m30  = momentum30d ?? 0;
  const yukari = signals.filter((s) => s.direction === 'yukari').length;
  const asagi  = signals.filter((s) => s.direction === 'asagi').length;

  const bull: string[] = [];
  const bear: string[] = [];

  // ── Faktörler topla ────────────────────────────────────────────────
  if (conf >= 70)   bull.push(`Güçlü sinyal bütünlüğü (${conf})`);
  if (yukari >= 3)  bull.push(`${yukari} yukarı sinyal uyumu`);
  if (r < 35)       bull.push(`RSI aşırı satım (${r}) — dönüş bölgesi`);
  if (r > 55 && r < 70) bull.push(`RSI güçlü momentum bölgesi (${r})`);
  if (wr > 55)      bull.push(`Haftalık RSI pozitif (${wr})`);
  if (mtf === 'uyumlu' && r > 50) bull.push('Günlük + haftalık trend uyumu');
  if (m5 > 3)       bull.push(`5 günlük güçlü momentum +${m5}%`);
  if (m30 > 8)      bull.push(`Aylık trend sağlam +${m30}%`);

  if (conf >= 70 && asagi > yukari) bear.push(`Baskın aşağı sinyal (${asagi})`);
  if (r > 75)       bear.push(`RSI aşırı alım (${r}) — düzeltme riski`);
  if (wr > 75)      bear.push(`Haftalık RSI aşırı alım (${wr})`);
  if (mtf === 'uyumlu' && r < 50) bear.push('Günlük + haftalık aşağı trend uyumu');
  if (m5 < -3)      bear.push(`5 günlük baskı ${m5}%`);
  if (m30 < -10)    bear.push(`Aylık trend zayıf ${m30}%`);

  // ── Karar ─────────────────────────────────────────────────────────
  let decision: 'AL' | 'TUT' | 'SAT' = 'TUT';
  let score = 50;

  const bullScore = bull.length * 15 + (conf >= 70 ? 10 : 0) + (r < 40 ? 10 : 0);
  const bearScore = bear.length * 15 + (r > 75 ? 10 : 0);

  if (bullScore > bearScore + 15 && conf >= 50 && yukari >= asagi) {
    decision = 'AL'; score = Math.min(95, 50 + bullScore);
  } else if (bearScore > bullScore + 15 && (asagi > 0 || r > 70)) {
    decision = 'SAT'; score = Math.min(95, 50 + bearScore);
  }

  // Güven seviyesi
  const confidence: 'dusuk' | 'orta' | 'yuksek' =
    conf >= 75 && mtf === 'uyumlu' ? 'yuksek' :
    conf >= 55 ? 'orta' : 'dusuk';

  const reason = decision === 'AL'
    ? bull[0] ?? 'Teknik görünüm olumlu'
    : decision === 'SAT'
    ? bear[0] ?? 'Teknik görünüm olumsuz'
    : signals.length === 0
      ? 'Net yön sinyali yok — izle'
      : `Karışık sinyaller (${yukari}↑ ${asagi}↓)`;

  return { decision, score, reason, bull, bear, confidence };
}

// ── Makro Rejim Tespiti ───────────────────────────────────────────────

function detectMacroRegime(results: InstrumentAnalysis[]): MacroRegimeSummary {
  const get = (ns: string) => results.find((r) => r.nameShort === ns);
  const usd   = get('USD/TRY');
  const gold  = get('XAU/USD');
  const bist  = get('XU100');
  const brent = get('BRENT');
  const silver = get('XAG/USD');

  const signals: string[] = [];
  let riskScore = 50; // 50 = nötr, yüksek = risk-off

  // USD/TRY trendi
  const usdM5 = usd?.momentum5d ?? 0;
  if (usdM5 > 1.5) { riskScore += 15; signals.push('USD/TRY yükseliyor → TL baskı altında'); }
  else if (usdM5 < -1.5) { riskScore -= 10; signals.push('USD/TRY gerileyiyor → TL göreli toparlanma'); }

  // Altın trendi
  const goldM5 = gold?.momentum5d ?? 0;
  if (goldM5 > 1) { riskScore += 10; signals.push('Altın güçleniyor → risk iştahı zayıf / jeopolitik gerilim'); }
  else if (goldM5 < -1.5) { riskScore -= 8; signals.push('Altın gerileyiyor → risk iştahı arttı'); }

  // BIST trendi
  const bistM5 = bist?.momentum5d ?? 0;
  const bistRsi = bist?.rsi ?? 50;
  if (bistM5 > 2 && bistRsi < 70) { riskScore -= 12; signals.push('BIST momentum güçlü → yerel risk iştahı var'); }
  else if (bistM5 < -2) { riskScore += 10; signals.push('BIST baskı altında → savunmacı konumlanma'); }

  // Petrol trendi
  const brentM5 = brent?.momentum5d ?? 0;
  if (brentM5 > 3)  signals.push('Petrol yükseliyor → enflasyon baskısı / enerji maliyeti');
  if (brentM5 < -3) signals.push('Petrol düşüyor → küresel talep kaygısı');

  // Altın/Gümüş oranı (risk iştahı için iyi gösterge)
  const goldClose  = gold?.lastClose ?? 0;
  const silverClose = silver?.lastClose ?? 0;
  if (goldClose > 0 && silverClose > 0) {
    const ratio = goldClose / silverClose;
    if (ratio > 88) signals.push(`Altın/Gümüş oranı yüksek (${ratio.toFixed(0)}) → risk-off sinyali`);
    else if (ratio < 72) signals.push(`Altın/Gümüş oranı düşük (${ratio.toFixed(0)}) → risk-on ortamı`);
  }

  const clampedScore = Math.max(0, Math.min(100, riskScore));

  const regime =
    clampedScore >= 65 ? 'risk_off' :
    clampedScore <= 35 ? 'risk_on'  : 'notr';

  const regimeLabel =
    regime === 'risk_off' ? 'Risk-Off 🔴' :
    regime === 'risk_on'  ? 'Risk-On 🟢'  : 'Nötr 🟡';

  const regimeDesc =
    regime === 'risk_off'
      ? 'Piyasalar savunmacı. Altın, dolar ve güvenli varlıklar öne çıkıyor. Risk varlıklarında dikkatli olun.'
      : regime === 'risk_on'
      ? 'Risk iştahı var. Hisse ve emtia talep görüyor. Pozisyon oluşturmak için görece uygun ortam.'
      : 'Karışık sinyaller. Net yön yok, seçici ve sektörel yaklaşım önerilir.';

  return { regime, regimeLabel, regimeDesc, signals, riskScore: clampedScore };
}

// ── Cache ─────────────────────────────────────────────────────────────
let cache: { instruments: InstrumentAnalysis[]; regime: MacroRegimeSummary; expiry: number } | null = null;
const CACHE_TTL = 15 * 60_000;

export async function GET() {
  if (cache && Date.now() < cache.expiry) {
    return NextResponse.json(
      { ok: true, instruments: cache.instruments, regime: cache.regime, cached: true },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
    );
  }

  const results = await Promise.allSettled(
    INSTRUMENTS.map(async (inst) => {
      const { candles, changePercent } = await fetchOHLCV(inst.symbol, 365);
      if (candles.length < 30) throw new Error('Yetersiz veri');

      // Haftalık mumlar türet
      const weekly = toWeeklyCandles(candles);

      // Teknik hesaplamalar
      const signals     = detectAllSignals(inst.nameShort, candles);
      const conf        = signals.length > 0 ? computeConfluence(signals) : null;
      const rsi         = calcRSI(candles);
      const weeklyRsi   = calcRSI(weekly, 14);
      const relVol5     = calcRelVol5(candles);
      const atrPct      = calcATRPct(candles);
      const volLevel    = volatilityLevel(atrPct);
      const mtf         = calcMtfAlignment(rsi, weeklyRsi, signals);
      const m5          = momentum(candles, 5);
      const m30         = momentum(candles, 30);
      const { s1, r1 }  = calcPivots(candles);
      const last        = candles[candles.length - 1]!;

      // 52H
      const last252  = candles.slice(-252);
      const hi52     = Math.max(...last252.map((c) => c.high));
      const lo52     = Math.min(...last252.map((c) => c.low));
      const pctFromH = parseFloat((((last.close - hi52) / hi52) * 100).toFixed(2));

      // Haftalık trend: EMA10 vs EMA30 haftalık
      const wEma10 = ema(weekly, 10);
      const wEma30 = ema(weekly, 30);
      const weeklyTrend = wEma10 && wEma30
        ? (wEma10 > wEma30 * 1.002 ? 'yukari' : wEma10 < wEma30 * 0.998 ? 'asagi' : 'yatay')
        : null;

      const chg = changePercent ?? (
        candles.length >= 2
          ? ((last.close - candles[candles.length-2]!.close) / candles[candles.length-2]!.close) * 100
          : null
      );

      const { decision, score, reason, bull, bear, confidence } =
        makeDecision(signals, conf?.score ?? null, rsi, weeklyRsi, mtf, m5, m30);

      return {
        symbol: inst.symbol, name: inst.name, nameShort: inst.nameShort,
        category: inst.category, currency: inst.currency, icon: inst.icon, desc: inst.desc,
        lastClose:       last.close,
        changePercent:   chg,
        momentum5d:      m5,
        momentum30d:     m30,
        rsi,
        weeklyRsi,
        relVol5,
        confluenceScore: conf?.score ?? null,
        atrPct,
        volatilityLevel: volLevel,
        weeklyTrend:     weeklyTrend as 'yukari' | 'asagi' | 'yatay' | null,
        mtfAlignment:    mtf,
        signals: signals.map((s) => ({ type: s.type, direction: s.direction, severity: s.severity })),
        decision, decisionScore: score, confidence, keyReason: reason,
        bullFactors: bull, bearFactors: bear,
        support52w:  lo52,
        resistance52w: hi52,
        pivotS1: s1, pivotR1: r1,
        pctFromHigh: pctFromH,
        error: null,
      } satisfies InstrumentAnalysis;
    })
  );

  const instruments: InstrumentAnalysis[] = results.map((r, i) => {
    const inst = INSTRUMENTS[i]!;
    if (r.status === 'fulfilled') return r.value;
    return {
      symbol: inst.symbol, name: inst.name, nameShort: inst.nameShort,
      category: inst.category, currency: inst.currency, icon: inst.icon, desc: inst.desc,
      lastClose: null, changePercent: null, momentum5d: null, momentum30d: null,
      rsi: null, weeklyRsi: null, relVol5: null, confluenceScore: null,
      atrPct: null, volatilityLevel: null, weeklyTrend: null, mtfAlignment: null,
      signals: [], decision: 'TUT', decisionScore: 0, confidence: 'dusuk',
      keyReason: 'Veri alınamadı', bullFactors: [], bearFactors: [],
      support52w: null, resistance52w: null, pivotS1: null, pivotR1: null,
      pctFromHigh: null, error: r.reason instanceof Error ? r.reason.message : 'Hata',
    };
  });

  const regime = detectMacroRegime(instruments);
  cache = { instruments, regime, expiry: Date.now() + CACHE_TTL };

  return NextResponse.json(
    { ok: true, instruments, regime, cached: false },
    { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
  );
}
