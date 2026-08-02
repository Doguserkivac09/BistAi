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
import type { SymbolCatalyst } from '@/lib/news-impact';
import { isScoringV2, regimeGate, type RegimeGate, type ScoringSurface } from '@/lib/scoring-config';

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
  /** Haber katalisti — taze material haberin yönü/durumu (news-impact'ten precompute) */
  catalyst?: SymbolCatalyst | null;
  /** Piyasa rejimi — getMarketRegime() çıktısı: bull_trend | bear_trend | sideways */
  regime?: string | null;
  /** Göreli hacim (son hacim / 5g ort) — scan_cache.rel_vol5; hacim teyidi için */
  relVol5?: number | null;
  /** Sonraki bilançoya kalan takvim günü — binary event riski (precompute'tan) */
  daysUntilEarnings?: number | null;
  /** Verinin toplandığı zaman (ISO) — time decay için */
  scannedAt: string;
  /** Veri kaynağı: DB snapshot (cron) vs canlı Yahoo */
  dataSource: DecisionDataSource;

  // ── SCORING v2 (SKOR-MIMARISI-PLAN) — hepsi opsiyonel; verilmezse v1 davranışı ──
  /** Skor yüzeyi (ufka göre v2 ağırlığı). Vars. 'short'. */
  surface?: ScoringSurface;
  /**
   * v2 açık/kapa EXPLICIT override — A/B harness (aynı girdide v1+v2) ve testler için.
   * undefined → isScoringV2(surface) (global flag). Bu alan olmadan A/B ölçümü yapılamaz.
   */
  scoringV2?: boolean;
  /**
   * Temel red-flag'ler — v2 kısa vadede YUKARI sinyale VETO (toplamsal +puan DEĞİL,
   * yalnız skor tavanı + güven cezası). Verilmezse veto no-op.
   */
  fundamental?: {
    /** Beneish M-Score kâr manipülasyonu şüphesi. */
    beneishSuspect?: boolean;
    /** Altman Z'' iflas/sıkıntı bölgesi. */
    altmanDistress?: boolean;
    /** İleriye dönük GARP verdict'i (forward-outlook). */
    garpVerdict?: 'firsat' | 'pahali_ama_hakli' | 'deger_tuzagi' | 'gercekten_pahali' | null;
    /**
     * BANKA rotası (K1) — bankalarda Piotroski/Altman/Beneish "uygulanmaz" döner,
     * yani yukarıdaki red-flag'ler ASLA tetiklenmez ve banka veto katmanından
     * denetimsiz geçerdi. `bankRedFlag` o kör noktayı kapatır: bugünkü Kademe 1
     * tetikleyicisi reel ROE'nin negatif olması (nominal kâr var, özkaynak eriyor).
     */
    bankRedFlag?: boolean;
  } | null;
  /**
   * Hisse-özel makro DUYARLILIK katkısı (±puan, exposure-map.exposureContribution'dan).
   * Kesitte değişken olduğu için v2 ranking'e MEŞRU girer. Verilmezse 0 (FAZ 2'de bağlanır).
   */
  exposureAdj?: number | null;
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
  /** Sektör momentum uyumu (±puan) — sinyal yönü sektör rüzgârıyla hizalı mı */
  sectorAlign: number;
  /** Hacim teyidi (±puan) — rel_vol5 yüksek = hareket hacimle destekli */
  volumeConfirm: number;
  /** Bilanço yakınlığı riski (±puan, negatif) — yaklaşan bilanço binary event */
  earningsRisk: number;
  /** KAP event riski (±puan, negatif) */
  kapEvent: number;
  /** Haber katalisti uyumu (±puan) — taze hizalı haber + / ters haber − */
  catalyst: number;
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

  // ── SCORING v2 çıktıları (v1'de null/false) ──
  /** Rejim kapısı — skaler makrodan (skor değil): posture/güven/eşik/sinyal sayısı. */
  regimeGate?: RegimeGate | null;
  /** Temel veto tetiklendi mi (v2 kısa vade + yukarı sinyal + red-flag). */
  fundamentalVetoed?: boolean;
  /** Bu çıktı v2 skorlamasıyla mı üretildi (şeffaflık/A-B etiketi). */
  scoringV2?: boolean;
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

/**
 * Sektör momentum ayarlaması (P1-1) — sektör kompozit skoru (-100..+100) sinyal
 * yönüyle hizalıysa mütevazı bonus, tersse biraz daha ağır ceza.
 * macroAlign ölçeğiyle uyumlu tutuldu (±5/−7 yerine ±5/−6).
 */
function sectorAdjustment(direction: DecisionDirection, sectorMomentum: SectorMomentum | null | undefined): number {
  if (!sectorMomentum || direction === 'notr') return 0;
  const s = sectorMomentum.compositeScore;
  if (!Number.isFinite(s)) return 0;
  // Eşik ±25: tanh ölçeğinde ~%10+ 20g sektör hareketi (canlı dağılım -28..+18
  // gözlendi; ±30 pratikte hiç tetiklenmiyordu, macroAlign ±20 ile tutarlı)
  if (direction === 'yukari' && s >=  25) return 5;
  if (direction === 'asagi'  && s <= -25) return 5;
  if (direction === 'yukari' && s <= -25) return -6;
  if (direction === 'asagi'  && s >=  25) return -6;
  return 0;
}

/**
 * Hacim teyidi (P1-2) — rel_vol5 (son hacim / 5g ort):
 *  ≥1.5 → hareket hacimle destekli (+4); <0.7 → ilgisiz/cansız tahta (−4).
 * Yön-bağımsız: hacim her iki yönde de hareketin gerçekliğini teyit eder.
 */
function volumeAdjustment(direction: DecisionDirection, relVol5: number | null | undefined): number {
  if (relVol5 == null || !Number.isFinite(relVol5) || direction === 'notr') return 0;
  if (relVol5 >= 1.5) return 4;
  if (relVol5 < 0.7)  return -4;
  return 0;
}

/**
 * Bilanço yakınlığı (FAZ 2) — yaklaşan bilanço bir "binary event"tir: teknik
 * sinyal o belirsizliği bilemez. Bilanço ≤3 işlem günü (~5 takvim günü) içindeyse
 * skoru düşürür ve güveni azaltır. Yön-bağımsız (her iki yönde de risk).
 * Geçmiş bilanço (gün < 0) cezalandırılmaz — etki haberle zaten fiyatlandı.
 */
function earningsAdjustment(daysUntilEarnings: number | null | undefined): number {
  if (daysUntilEarnings == null || !Number.isFinite(daysUntilEarnings)) return 0;
  if (daysUntilEarnings < 0) return 0;
  if (daysUntilEarnings <= 5) return -8;
  return 0;
}

function kapEventAdjustment(kapRisk: DecisionInput['kapRisk']): number {
  return kapRisk?.var ? -10 : 0;
}

/**
 * Haber katalisti ayarlaması — teknik sinyal × taze material haber çapraz kontrolü.
 *  - Teyit (haber yönü = sinyal yönü): + (taze/fiyatlanmamış güçlü, zaten fiyatlandı zayıf)
 *  - Çelişki (haber yönü ≠ sinyal yönü): − (tuzak riski; biraz daha ağır cezalandırılır)
 * strengthMag içinde durum (unpriced/priced) ve tazelik çürümesi zaten kodlu.
 */
const CATALYST_MAX_PTS = 12;
function catalystAdjustment(direction: DecisionDirection, catalyst: SymbolCatalyst | null | undefined): number {
  if (!catalyst || catalyst.sentiment === 'nötr' || catalyst.strengthMag < 0.15) return 0;
  const sigSign = direction === 'yukari' ? 1 : direction === 'asagi' ? -1 : 0;
  if (sigSign === 0) return 0;
  const catSign = catalyst.sentiment === 'pozitif' ? 1 : -1;
  const pts = Math.round(catalyst.strengthMag * CATALYST_MAX_PTS);
  // Hizalı → +; ters → − (çelişki biraz daha ağır)
  return catSign === sigSign ? pts : -Math.round(pts * 1.15);
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

/**
 * Temel VETO (v2, yalnız kısa vade + YUKARI yön). Temel red-flag varsa yukarı yönlü
 * teknik sinyale güvenilmez → skoru TAVANLA (toplamsal +puan YOK) + güveni kır.
 * Aşağı yönde uygulanmaz: zayıf temel, düşüş senaryosunu zaten teyit eder.
 * Ufak "veto" felsefesi: temel skora sızmaz, yalnız yanlış-pozitifi keser.
 */
function fundamentalVeto(
  direction: DecisionDirection,
  fundamental: DecisionInput['fundamental'],
  surface: ScoringSurface,
): { scoreCap: number | null; confidencePenalty: number } {
  if (surface !== 'short' || direction !== 'yukari' || !fundamental) {
    return { scoreCap: null, confidencePenalty: 0 };
  }
  // Sert red-flag: kâr manipülasyonu / iflas bölgesi → yukarı sinyali "Al" eşiğinin
  // (65) ve "Tut" bandının altına (40) kırp, güveni ciddi düşür.
  if (fundamental.beneishSuspect || fundamental.altmanDistress) {
    return { scoreCap: 40, confidencePenalty: 25 };
  }
  // Banka karşılığı: sanayi red-flag'leri bankada hesaplanamaz → banka motorunun
  // sert bayrağı aynı tavanı uygular (yoksa banka veto katmanından muaf kalırdı).
  if (fundamental.bankRedFlag) {
    return { scoreCap: 40, confidencePenalty: 25 };
  }
  // Yumuşak: değer tuzağı (ucuz görünüp haklı sebeple ucuz) → tavan + orta ceza.
  if (fundamental.garpVerdict === 'deger_tuzagi') {
    return { scoreCap: 55, confidencePenalty: 15 };
  }
  return { scoreCap: null, confidencePenalty: 0 };
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
  const factorSigns = [factors.regimeFit, factors.macroAlign, factors.mtfAlign, factors.sectorAlign].filter((f) => f !== 0);
  if (factorSigns.length >= 2) {
    const positiveCount = factorSigns.filter((f) => f > 0).length;
    const negativeCount = factorSigns.filter((f) => f < 0).length;
    if (positiveCount > 0 && negativeCount > 0) conf -= 10; // çelişki
  }

  // Yaklaşan bilanço → binary event, güven düşer
  if (factors.earningsRisk < 0) conf -= 8;

  // KAP event → güven ciddi düşer
  if (factors.kapEvent < 0) conf -= 10;

  // Haber katalisti: teyit güveni artırır, çelişki ciddi düşürür (tuzak riski)
  if (factors.catalyst > 0) conf += 5;
  else if (factors.catalyst < 0) conf -= 12;

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
    signals, macroScore, sectorMomentum, riskScore, historicalWinRate,
    kapRisk, catalyst, regime, relVol5, daysUntilEarnings, scannedAt, dataSource,
  } = input;

  const surface: ScoringSurface = input.surface ?? 'short';
  // v2 açık mı: explicit override (A/B harness) yoksa global flag+yüzey kademesi
  const useV2 = input.scoringV2 ?? isScoringV2(surface);

  const now = Date.now();
  const scannedTs = new Date(scannedAt).getTime();
  const stalenessHours = Number.isFinite(scannedTs)
    ? Math.max(0, (now - scannedTs) / 3_600_000)
    : 0;

  // Sinyal yoksa: skor 50 (nötr), karar Tut
  if (!signals.length) {
    const emptyFactors: DecisionFactors = {
      confluence: 0, timeDecay: 1, winRateAdj: 0, regimeFit: 0,
      macroAlign: 0, mtfAlign: 0, sectorAlign: 0, volumeConfirm: 0,
      earningsRisk: 0, kapEvent: 0, catalyst: 0, riskMultiplier: 1,
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
  const sectorAlign = sectorAdjustment(direction, sectorMomentum);
  const volumeConfirm = volumeAdjustment(direction, relVol5);
  const earningsRisk = earningsAdjustment(daysUntilEarnings);
  const kapEvent   = kapEventAdjustment(kapRisk);
  const catalystAdj = catalystAdjustment(direction, catalyst);
  const riskMult   = riskMultiplier(riskScore);

  // 4. Skor hesabı — v1 vs v2 ayrımı (v2 flag arkasında; kapalıysa bit-bazında aynı)
  let score: number;
  let gate: RegimeGate | null = null;
  let vetoed = false;
  let confidencePenaltyV2 = 0;

  if (useV2) {
    // RANKING = teknik + hisse-ÖZEL riskler (kesitte değişken → sıralamayı ayrıştırır).
    // ÇIKARILAN (skaler → skordan çıktı): macroAlign, regimeFit, sectorAlign → kapı/context;
    // riskMultiplier → kapı güven çarpanı. Bunlar hâlâ factors'ta (şeffaflık/context).
    // exposureAdj (hisse-özel makro duyarlılığı) skora GİRER — kesitte değişken (FAZ 2).
    const exposureAdj = Number.isFinite(input.exposureAdj ?? NaN) ? (input.exposureAdj as number) : 0;
    const rankingRaw =
      confluence.score * timeDecay +
      winRateAdj + mtfAlign + volumeConfirm +
      earningsRisk + kapEvent + catalystAdj + exposureAdj;
    let s = Math.max(0, Math.min(100, Math.round(rankingRaw)));

    // Temel VETO (kısa vade, yukarı): skor tavanı + güven cezası (toplamsal +puan YOK)
    const veto = fundamentalVeto(direction, input.fundamental ?? null, surface);
    if (veto.scoreCap != null) { s = Math.min(s, veto.scoreCap); vetoed = true; }
    confidencePenaltyV2 = veto.confidencePenalty;

    score = s;
    gate = regimeGate(regime ?? null);
  } else {
    // v1 — DEĞİŞMEDEN (SCORING_V2 kapalıyken bit-bazında aynı çıktı)
    const rawMagnitude =
      confluence.score * timeDecay +
      winRateAdj + regimeFit + macroAlign + mtfAlign + sectorAlign + volumeConfirm +
      earningsRisk + kapEvent + catalystAdj;
    const riskAdjusted = rawMagnitude * riskMult;
    score = Math.max(0, Math.min(100, Math.round(riskAdjusted)));
  }

  const factors: DecisionFactors = {
    confluence: confluence.score,
    timeDecay: Math.round(timeDecay * 100) / 100,
    winRateAdj: Math.round(winRateAdj),
    regimeFit,
    macroAlign,
    mtfAlign,
    sectorAlign,
    volumeConfirm,
    earningsRisk,
    kapEvent,
    catalyst: catalystAdj,
    riskMultiplier: Math.round(riskMult * 100) / 100,
  };

  const rating = deriveRating(score, direction);
  let confidence = deriveConfidence(score, factors, signals.length);

  if (useV2) {
    // v2 güven: temel veto cezası − sonra rejim kapısı çarpanı (skaler makro güveni kısar)
    confidence = Math.max(0, Math.min(100, Math.round(
      (confidence - confidencePenaltyV2) * (gate?.confidenceMultiplier ?? 1),
    )));
  }

  return {
    score,
    direction,
    rating,
    confidence,
    factors,
    stalenessHours: Math.round(stalenessHours * 10) / 10,
    dataSource,
    scannedAt,
    regimeGate: gate,
    fundamentalVetoed: vetoed,
    scoringV2: useV2,
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
/**
 * Kullanıcıya GÖSTERİLECEK nötr etiket. İç `DecisionRating` (Al/Sat) mantık/testte kalır;
 * ekranda emir/tavsiye dili yerine analitik skor-görünüm dili gösterilir (yasal: yatırım
 * tavsiyesi çağrışımından kaçınma). Renkler iç rating'e göre eşlenmeye devam eder.
 */
export function displayRating(rating: DecisionRating): string {
  switch (rating) {
    case 'Güçlü Al':  return 'Güçlü Pozitif';
    case 'Al':        return 'Pozitif';
    case 'Tut':       return 'Nötr';
    case 'Sat':       return 'Zayıf';
    case 'Güçlü Sat': return 'Riskli';
  }
}

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

// 1.1.0 (2026-06-11): sectorAlign (P1-1) + volumeConfirm (P1-2) faktörleri eklendi
// 1.2.0 (2026-06-12): earningsRisk (FAZ 2) — yaklaşan bilanço binary event cezası
// 2.0.0 (2026-07-23): SCORING_V2 (flag arkasında) — ranking/kapı ayrımı + temel veto +
//                     hisse-özel exposure katkısı. Flag kapalıyken 1.2.0 ile bit-bazında aynı.
export const DECISION_ENGINE_VERSION = '2.0.0';
export const SIGNIFICANT_SCORE_DELTA = 15;
