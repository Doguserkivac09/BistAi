/**
 * Karar Motoru — Tek gerçek kaynağı (Single Source of Truth)
 *
 * Hem /api/firsatlar (DB snapshot) hem /api/hisse-analiz (canlı) bu modülü kullanır.
 * Aynı sinyal/bağlam girdisi → aynı karar. Veri kaynağı farkı yalnızca
 * stalenessHours ve dataSource alanlarında expose edilir.
 *
 * Tasarım kararları:
 * 1. TÜM sinyaller dikkate alınır — "dominant signal" seçimi YOK.
 *    Fırsatlar'daki çoğunluk oyu ile detay sayfasındaki tek-sinyal bug'ı giderilir.
 * 2. Tek ölçek: 0-100 skor + yön (yukari/asagi/notr) ayrı alan.
 *    Eski -100..+100 ölçeğine geri uyum helper ile sağlanır.
 * 3. Adjustments şeffaf: factors objesi her ayarlamayı ayrı ayrı döner.
 *
 * Ağırlıklar `lib/composite-signal.ts` ve `/api/firsatlar` ile uyumlu tutuldu.
 */

import type { StockSignal } from '@/types';
import { computeConfluence } from '@/lib/signals';
import type { MacroScoreResult } from '@/lib/macro-score';
import type { SectorMomentum } from '@/lib/sector-engine';
import type { RiskScoreResult } from '@/lib/risk-engine';

// ── Sabitler ─────────────────────────────────────────────────────────

/** Exponential decay yarı-ömrü (saat) — 48h'de confluence etkisi yarıya iner */
const TIME_DECAY_HALF_H = 48;

/** Win rate güvenilirlik için min örneklem */
const MIN_N_FOR_WR = 20;

/** Komisyon (round-trip) — net getiri hesabında kullanılan */
const COMMISSION_ROUNDTRIP = 0.004;

// ── Tipler ───────────────────────────────────────────────────────────

export type DecisionDirection = 'yukari' | 'asagi' | 'notr';
export type DecisionRating = 'Güçlü Al' | 'Al' | 'Tut' | 'Sat' | 'Güçlü Sat';
export type DecisionDataSource = 'db_snapshot' | 'live';

export interface DecisionInput {
  /** Tüm sinyaller — "dominant" seçimi engine içinde YAPILMAZ (tümü dikkate alınır) */
  signals: StockSignal[];
  macroScore?: MacroScoreResult | null;
  sectorMomentum?: SectorMomentum | null;
  riskScore?: RiskScoreResult | null;
  historicalWinRate?: { winRate: number; n: number } | null;
  kapRisk?: { var: boolean; mesaj: string } | null;
  /** Piyasa rejimi — getMarketRegime() çıktısı: bull_trend | bear_trend | sideways */
  regime?: string | null;
  /** Verinin toplandığı zaman (ISO) — time decay için */
  scannedAt: string;
  /** Veri kaynağı: DB snapshot (cron) vs canlı Yahoo */
  dataSource: DecisionDataSource;
}

export interface DecisionFactors {
  /** Confluence skoru (0-100) — tüm sinyallerin toplu gücü */
  confluence: number;
  /** Zaman bozunumu çarpanı (0-1) */
  timeDecay: number;
  /** Geçmiş win rate ayarlaması (±puan) */
  winRateAdj: number;
  /** Rejim uyumu (±puan) */
  regimeFit: number;
  /** Makro uyumu (±puan) */
  macroAlign: number;
  /** Multi-timeframe (haftalık) uyumu (±puan) */
  mtfAlign: number;
  /** KAP event riski (±puan, negatif) */
  kapEvent: number;
  /** Risk seviyesi ayarlaması (çarpan) */
  riskMultiplier: number;
}

export interface DecisionOutput {
  /** Tek standart ölçek: 0-100 */
  score: number;
  /** Karar yönü */
  direction: DecisionDirection;
  /** Türkçe etiket */
  rating: DecisionRating;
  /** Güven (0-100) */
  confidence: number;
  /** Şeffaflık: hangi faktör ne kadar etkiledi */
  factors: DecisionFactors;
  /** Veri yaşı (saat) — now - scannedAt */
  stalenessHours: number;
  /** Veri kaynağı */
  dataSource: DecisionDataSource;
  /** scannedAt zamanını geri döndür (UI için) */
  scannedAt: string;
}

// ── Ayarlama fonksiyonları (firsatlar ile uyumlu) ────────────────────

function timeDecayMultiplier(ageHours: number): number {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 1;
  return Math.pow(0.5, ageHours / TIME_DECAY_HALF_H);
}

function winRateAdjustment(winRate: number | null | undefined, n: number): number {
  if (winRate == null || n < MIN_N_FOR_WR) return 0;
  // 50% → 0, 65% → +12, 35% → -12; cap ±15
  const delta = (winRate - 0.5) * 80;
  return Math.max(-15, Math.min(15, delta));
}

function regimeAdjustment(direction: DecisionDirection, regime: string | null | undefined): number {
  if (!regime || direction === 'notr') return 0;
  if (direction === 'yukari' && regime === 'bull_trend') return 8;
  if (direction === 'asagi'  && regime === 'bear_trend') return 8;
  if (direction === 'yukari' && regime === 'bear_trend') return -10;
  if (direction === 'asagi'  && regime === 'bull_trend') return -10;
  return 0;
}

function macroAdjustment(direction: DecisionDirection, macroScoreValue: number | null | undefined): number {
  if (macroScoreValue == null || direction === 'notr') return 0;
  if (direction === 'yukari' && macroScoreValue >=  20) return 5;
  if (direction === 'asagi'  && macroScoreValue <= -20) return 5;
  if (direction === 'yukari' && macroScoreValue <= -20) return -7;
  if (direction === 'asagi'  && macroScoreValue >=  20) return -7;
  return 0;
}

/**
 * Multi-timeframe ayarlaması — çoğunluk sinyallerinin weeklyAligned bayrağı.
 * Dominant sinyallerde true sayısı > false sayısı ise +6; false baskınsa -8.
 */
function mtfAdjustment(dominantSignals: StockSignal[]): number {
  let aligned = 0, misaligned = 0;
  for (const s of dominantSignals) {
    if (s.weeklyAligned === true) aligned++;
    else if (s.weeklyAligned === false) misaligned++;
  }
  if (aligned === 0 && misaligned === 0) return 0;
  if (aligned > misaligned) return 6;
  if (misaligned > aligned) return -8;
  return 0;
}

function kapEventAdjustment(kapRisk: DecisionInput['kapRisk']): number {
  return kapRisk?.var ? -10 : 0;
}

/**
 * Risk çarpanı — yüksek risk ortamında kararın büyüklüğünü azaltır.
 */
function riskMultiplier(riskScore: RiskScoreResult | null | undefined): number {
  if (!riskScore) return 1;
  switch (riskScore.level) {
    case 'low':      return 1.05;
    case 'medium':   return 1.00;
    case 'high':     return 0.85;
    case 'critical': return 0.70;
    default:         return 1.00;
  }
}

// ── Yön ve rating çıkarımı ────────────────────────────────────────────

/**
 * Confluence hesabından dominant yönü al — computeConfluence zaten
 * yukari/asagi sayım + severity'ye göre dominant belirler.
 * Burada 'notr' için confluence'in 'nötr' çıktısını map'liyoruz.
 */
function deriveDirection(signals: StockSignal[]): DecisionDirection {
  if (signals.length === 0) return 'notr';
  const { dominantDirection } = computeConfluence(signals);
  if (dominantDirection === 'yukari') return 'yukari';
  if (dominantDirection === 'asagi')  return 'asagi';
  return 'notr';
}

function deriveRating(score: number, direction: DecisionDirection): DecisionRating {
  // Skor büyüklüğü karar gücünü belirler; yön Al/Sat polaritesini belirler.
  // Nötr yönde hiç "al" veya "sat" üretme — her durumda Tut.
  if (direction === 'notr') return 'Tut';

  if (direction === 'yukari') {
    if (score >= 80) return 'Güçlü Al';
    if (score >= 65) return 'Al';
    if (score >= 40) return 'Tut';
    if (score >= 25) return 'Sat';
    return 'Güçlü Sat'; // çok düşük skor + yukari yön → aslında direnç; konservatif davran
  }

  // asagi
  if (score >= 80) return 'Güçlü Sat';
  if (score >= 65) return 'Sat';
  if (score >= 40) return 'Tut';
  if (score >= 25) return 'Al';
  return 'Güçlü Al';
}

function deriveConfidence(
  score: number,
  factors: DecisionFactors,
  signalCount: number,
): number {
  // Temel güven: skor büyüklüğü (merkezi değerden uzaklık)
  const distanceFromNeutral = Math.abs(score - 50);
  let conf = Math.min(90, distanceFromNeutral * 1.5);

  // Confluence katkısı (tek sinyal < çoklu sinyal)
  if (signalCount >= 3) conf += 5;
  else if (signalCount === 1) conf -= 10;

  // Zaman bozunumu güveni düşürür (eski veri)
  conf *= factors.timeDecay;

  // Çelişkili faktörler güveni düşürür
  const factorSigns = [factors.regimeFit, factors.macroAlign, factors.mtfAlign].filter((f) => f !== 0);
  if (factorSigns.length >= 2) {
    const positiveCount = factorSigns.filter((f) => f > 0).length;
    const negativeCount = factorSigns.filter((f) => f < 0).length;
    if (positiveCount > 0 && negativeCount > 0) conf -= 10; // çelişki
  }

  // KAP event → güven ciddi düşer
  if (factors.kapEvent < 0) conf -= 10;

  return Math.max(0, Math.min(100, Math.round(conf)));
}

// ── Ana fonksiyon ────────────────────────────────────────────────────

/**
 * Tek karar motoru.
 *
 * @param input Tüm sinyaller + bağlam. "Dominant signal" seçimi ARTIK YOK —
 *              computeConfluence tüm sinyalleri toplu değerlendirir.
 * @returns Tek standart çıktı — her tüketici aynı formatı kullanır.
 */
export function computeDecision(input: DecisionInput): DecisionOutput {
  const {
    signals, macroScore, sectorMomentum: _sectorMomentum, riskScore, historicalWinRate,
    kapRisk, regime, scannedAt, dataSource,
  } = input;
  void _sectorMomentum; // sector henüz skora direk yansımıyor (Phase 2 için rezerv)

  const now = Date.now();
  const scannedTs = new Date(scannedAt).getTime();
  const stalenessHours = Number.isFinite(scannedTs)
    ? Math.max(0, (now - scannedTs) / 3_600_000)
    : 0;

  // Sinyal yoksa: skor 50 (nötr), karar Tut
  if (!signals.length) {
    const emptyFactors: DecisionFactors = {
      confluence: 0, timeDecay: 1, winRateAdj: 0, regimeFit: 0,
      macroAlign: 0, mtfAlign: 0, kapEvent: 0, riskMultiplier: 1,
    };
    return {
      score: 50,
      direction: 'notr',
      rating: 'Tut',
      confidence: 0,
      factors: emptyFactors,
      stalenessHours: Math.round(stalenessHours * 10) / 10,
      dataSource,
      scannedAt,
    };
  }

  // 1. Confluence — computeConfluence tüm sinyalleri toplu değerlendirir (yön çoğunluğu + severity + kategori)
  const confluence = computeConfluence(signals);
  const direction = deriveDirection(signals);

  // 2. Dominant yöndeki sinyaller (MTF ayarlaması için)
  const dominantSignals = signals.filter((s) =>
    direction === 'notr' ? true :
    direction === 'yukari' ? s.direction === 'yukari' :
    s.direction === 'asagi'
  );

  // 3. Ayarlamalar
  const timeDecay = timeDecayMultiplier(stalenessHours);
  const winRateAdj = winRateAdjustment(historicalWinRate?.winRate, historicalWinRate?.n ?? 0);
  const regimeFit  = regimeAdjustment(direction, regime ?? null);
  const macroAlign = macroAdjustment(direction, macroScore?.score ?? null);
  const mtfAlign   = mtfAdjustment(dominantSignals);
  const kapEvent   = kapEventAdjustment(kapRisk);
  const riskMult   = riskMultiplier(riskScore);

  // 4. Skor hesabı: confluence × timeDecay + ayarlamalar, sonra risk çarpanı
  const rawMagnitude =
    confluence.score * timeDecay +
    winRateAdj + regimeFit + macroAlign + mtfAlign + kapEvent;

  const riskAdjusted = rawMagnitude * riskMult;
  const score = Math.max(0, Math.min(100, Math.round(riskAdjusted)));

  const factors: DecisionFactors = {
    confluence: confluence.score,
    timeDecay: Math.round(timeDecay * 100) / 100,
    winRateAdj: Math.round(winRateAdj),
    regimeFit,
    macroAlign,
    mtfAlign,
    kapEvent,
    riskMultiplier: Math.round(riskMult * 100) / 100,
  };

  const rating = deriveRating(score, direction);
  const confidence = deriveConfidence(score, factors, signals.length);

  return {
    score,
    direction,
    rating,
    confidence,
    factors,
    stalenessHours: Math.round(stalenessHours * 10) / 10,
    dataSource,
    scannedAt,
  };
}

// ── Geri-uyumluluk helper'ları ────────────────────────────────────────

/**
 * 0-100 skoru eski -100..+100 kompozit skor ölçeğine çevirir.
 * Yukari yön: 50 → 0, 100 → +100
 * Aşağı yön:  50 → 0, 100 → -100
 */
export function toLegacyCompositeScore(score: number, direction: DecisionDirection): number {
  const magnitude = (score - 50) * 2; // -100..+100
  if (direction === 'asagi') return -Math.abs(magnitude);
  if (direction === 'yukari') return Math.abs(magnitude);
  return 0;
}

/**
 * Rating'i eski CompositeDecision tipine map'ler (geri-uyumluluk).
 */
export function toLegacyDecision(rating: DecisionRating): 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' {
  switch (rating) {
    case 'Güçlü Al': return 'STRONG_BUY';
    case 'Al':       return 'BUY';
    case 'Tut':      return 'HOLD';
    case 'Sat':      return 'SELL';
    case 'Güçlü Sat':return 'STRONG_SELL';
  }
}

// ── DB satırlarından StockSignal üretme (firsatlar için) ──────────────

/**
 * `signal_performance` DB satırlarını StockSignal[] şekline çevirir.
 * DB'de severity kolonu yok — confluence_score'dan geriye çıkarım yapılır
 * (yaklaşık bir eşleme; karar engine'ının confluence hesabı yeniden yapılacağı
 * için kritik değil).
 */
export interface DBSignalRow {
  signal_type: string;
  direction: string;
  sembol: string;
  confluence_score?: number | null;
  weekly_aligned?: boolean | null;
  stop_loss?: number | null;
  target_price?: number | null;
  risk_reward_ratio?: number | null;
  avg_daily_volume_tl?: number | null;
  entry_price?: number | null;
}

export function dbRowsToStockSignals(rows: DBSignalRow[]): StockSignal[] {
  return rows.map((r) => {
    // Severity çıkarımı: confluence_score'un satır başına düşen gücüne yakın
    // (gerçek severity DB'de tutulmuyor; yalnızca sayısal ağırlık için approx)
    const avgConfluence = r.confluence_score ?? 0;
    const severity: 'güçlü' | 'orta' | 'zayıf' =
      avgConfluence >= 65 ? 'güçlü' :
      avgConfluence >= 35 ? 'orta'  : 'zayıf';

    const directionNormalized: 'yukari' | 'asagi' | 'nötr' =
      r.direction === 'yukari' ? 'yukari' :
      r.direction === 'asagi'  ? 'asagi'  : 'nötr';

    const signal: StockSignal = {
      type: r.signal_type,
      sembol: r.sembol,
      severity,
      direction: directionNormalized,
      data: {},
      weeklyAligned: r.weekly_aligned ?? undefined,
      stopLoss: r.stop_loss ?? undefined,
      targetPrice: r.target_price ?? undefined,
      riskRewardRatio: r.risk_reward_ratio ?? undefined,
      entryPrice: r.entry_price ?? undefined,
      avgDailyVolumeTL: r.avg_daily_volume_tl ?? undefined,
    };
    return signal;
  });
}

// ── Dışa aktarılan sabitler ─────────────────────────────────────────

export const DECISION_ENGINE_VERSION = '1.0.0';
export const SIGNIFICANT_SCORE_DELTA = 15;
