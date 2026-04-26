/**
 * Investable Edge — Investment Score (Deterministik Skor Motoru)
 *
 * Saf TypeScript. Hiç dış çağrı yok. Reproducible, auditable, hızlı.
 *
 * Formül:
 *   Skor = 0.30·Valuation + 0.25·Growth + 0.20·Profitability + 0.25·Risk
 *   Aralık: 0-100 (yüksek = daha yatırım yapılabilir)
 *
 * Null-tolerance: Eksik metrik olan boyutların ağırlığı mevcut boyutlara
 * orantılı yeniden dağıtılır. `appliedWeights` gerçek kullanılan ağırlıkları
 * döndürür.
 *
 * Confidence:
 *   high   : 12+ metrik mevcut
 *   medium : 7-11 metrik
 *   low    : <7 metrik (UI "veri eksik" uyarısı göstermeli)
 *
 * Rating etiketleri:
 *   >=80 Güçlü Al | 65-79 Al | 45-64 Tut | 30-44 Sat | <30 Güçlü Sat
 */

import type { YahooFundamentals } from './yahoo-fundamentals';

// ── Tipler ────────────────────────────────────────────────────────────────

export type InvestableRating =
  | 'Güçlü Al'
  | 'Al'
  | 'Tut'
  | 'Sat'
  | 'Güçlü Sat';

export type InvestableConfidence = 'high' | 'medium' | 'low';

export interface InvestableSubScores {
  valuation: number;     // 0-100 (düşük F/K → yüksek skor)
  growth: number;        // 0-100
  profitability: number; // 0-100
  risk: number;          // 0-100 (düşük risk → yüksek skor)
}

export interface InvestableWeights {
  valuation: number;
  growth: number;
  profitability: number;
  risk: number;
}

export interface InvestableScore {
  score: number;                          // 0-100
  subScores: InvestableSubScores;
  appliedWeights: InvestableWeights;      // Null-tolerant normalize sonrası gerçek ağırlıklar
  missingMetrics: string[];
  presentCount: number;                   // Toplam 16 metrikten kaçı var
  totalMetrics: number;                   // Sabit: 16
  confidence: InvestableConfidence;
  ratingLabel: InvestableRating;
  /**
   * Enflasyon düzeltmesi uygulandıysa dolu olur. Yoksa undefined (geriye uyumlu).
   * UI'da "Enflasyon %X ile düzeltildi" badge'i için kullanılır.
   */
  inflationAdjustment?: {
    applied: boolean;
    tufeYoy: number;                       // Yıllık TÜFE yüzde (örn 30.5)
    realRevenueGrowth: number | null;      // Reel gelir büyümesi (oran, 0.15 = %15)
    realEarningsGrowth: number | null;     // Reel kâr büyümesi
    peUpperBoundUsed: number;              // F/K üst sınır (40 × multiplier)
  };
}

/**
 * Enflasyon bağlamı — opsiyonel parametre olarak geçilir.
 * Yüksek enflasyon ortamında F/K şişer, nominal büyüme yanıltıcı olur.
 */
export interface InflationContext {
  tufeYoy: number;                         // Yıllık TÜFE yüzde (örn 30.5)
  source?: string;                         // 'tcmb' | 'fallback' (opsiyonel, loglama için)
}

// ── Varsayılan ağırlıklar (global) ────────────────────────────────────────

export const DEFAULT_WEIGHTS: InvestableWeights = {
  valuation:     0.30,
  growth:        0.25,
  profitability: 0.20,
  risk:          0.25,
};

// ── Yardımcı: 0-100 skalayıcı ─────────────────────────────────────────────

/**
 * Bir değeri [min, max] aralığından 0-100 skalaya clamp eder.
 *
 * @param reverse - true ise küçük değer daha iyi (örn: F/K, borç/özsermaye)
 *                  false ise büyük değer daha iyi (örn: ROE, büyüme)
 */
function scale(
  val: number | null | undefined,
  min: number,
  max: number,
  reverse = false,
): number | null {
  if (val === null || val === undefined || !isFinite(val)) return null;
  if (max === min) return null;

  const clamped = Math.max(min, Math.min(max, val));
  const pct = ((clamped - min) / (max - min)) * 100;
  return reverse ? 100 - pct : pct;
}

/**
 * Current ratio gibi "optimal nokta" olan metrik: 0→0, optimal→100, çok yüksek→azalır
 * Üçgen skor: [min, optimal] yükselir, [optimal, max] düşer, ekstremlerde 0.
 */
function triangular(
  val: number | null | undefined,
  min: number,
  optimal: number,
  max: number,
): number | null {
  if (val === null || val === undefined || !isFinite(val)) return null;
  if (val <= min || val >= max) return 0;
  if (val <= optimal) return ((val - min) / (optimal - min)) * 100;
  return ((max - val) / (max - optimal)) * 100;
}

/**
 * Birden fazla null-olabilir skor'un ortalamasını alır.
 * Sadece null olmayanlar dahil edilir. Hepsi null ise null döner.
 */
function mean(scores: Array<number | null>): number | null {
  const valid = scores.filter((s): s is number => s !== null && isFinite(s));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ── Alt-skor hesaplayıcılar ───────────────────────────────────────────────

/**
 * Enflasyon düzeltme çarpanı — F/K üst sınırını yüksek enflasyonda genişletir.
 *
 * Mantık: Yüksek enflasyon ortamında nominal EPS şişer (geçen yılın düşük
 * TL kazançları bugünkü fiyatla kıyaslanır), F/K tavan yapar. Global 5-40
 * skalası Türkiye gibi ülkelerde tüm hisseleri otomatik "kötü değerleme"
 * kategorisine iter. Üst sınırı enflasyonla ölçekleyip makul aralığa çekeriz.
 *
 * Formül: multiplier = 1 + min(tufe/100 × 0.75, 1.5) → üst sınır 2.5x ile kaplı.
 * Örn: %30 enflasyon → 1.225x (40 → 49), %60 → 1.45x (40 → 58), %100+ → 2.5x
 *
 * Seçim gerekçesi:
 * - 1:1 (katsayı 1.0) aşırı telafi olur, yüksek F/K her zaman meşrulaşır
 * - 0.5 altı çok muhafazakar, hâlâ distorted sinyal verir
 * - 0.75 BIST için kalibre edilmiş denge — yüksek F/K'yı yine cezalandırır
 *   ama kör cezaya dönüştürmez
 */
function inflationPEMultiplier(tufeYoy: number): number {
  const boost = Math.min((tufeYoy / 100) * 0.75, 1.5);
  return 1 + boost;
}

/**
 * Nominal büyümeyi reel büyümeye çevirir (Fisher denklemi).
 *
 * Fisher: (1 + nominal) = (1 + real) × (1 + inflation)
 * Çözüm: real = (1 + nominal) / (1 + inflation) - 1
 *
 * Örn: Nominal %15 büyüme + %30 enflasyon → Reel -%11.5 (gerçekten küçülme)
 * Örn: Nominal %60 büyüme + %30 enflasyon → Reel +%23 (gerçek büyüme)
 *
 * @param nominal - Oran olarak (0.15 = %15)
 * @param tufeYoy - Yüzde olarak (30 = %30)
 */
function toRealGrowth(nominal: number, tufeYoy: number): number {
  return (1 + nominal) / (1 + tufeYoy / 100) - 1;
}

/**
 * Valuation alt-skoru (0-100).
 * Metrikler: F/K, PEG, F/DD, EV/FAVÖK — düşük = daha iyi (reverse).
 *
 * Enflasyon düzeltmesi: `inflation` verildiğinde F/K üst sınırı genişler.
 * PEG zaten büyümeyi hesaba kattığı için enflasyondan nispeten bağımsız.
 * F/DD ve EV/FAVÖK oran bazlı — direkt etkilenmez.
 */
function computeValuation(
  f: YahooFundamentals,
  inflation?: InflationContext,
): {
  score: number | null;
  metricsUsed: string[];
  peUpperBound: number;
} {
  const peMultiplier = inflation ? inflationPEMultiplier(inflation.tufeYoy) : 1;
  const peUpperBound = 40 * peMultiplier;

  const pe    = scale(f.peRatio, 5, peUpperBound, true);   // F/K 5→100, üst→0
  const peg   = scale(f.pegRatio, 0.5, 3, true);           // PEG 0.5→100, 3→0
  const pb    = scale(f.priceToBook, 0.5, 5, true);        // F/DD 0.5→100, 5→0
  const evEb  = scale(f.enterpriseToEbitda, 3, 20, true);  // EV/FAVÖK 3→100, 20→0

  const metricsUsed: string[] = [];
  if (pe !== null)   metricsUsed.push('peRatio');
  if (peg !== null)  metricsUsed.push('pegRatio');
  if (pb !== null)   metricsUsed.push('priceToBook');
  if (evEb !== null) metricsUsed.push('enterpriseToEbitda');

  return { score: mean([pe, peg, pb, evEb]), metricsUsed, peUpperBound };
}

/**
 * Growth alt-skoru (0-100).
 * Yahoo büyüme oranları 0-1 arası geliyor (0.15 = %15). UI'da %'ye çevrilir.
 * Skor ölçeği: gelir büyümesi [-20%, +40%], kâr büyümesi [-30%, +50%].
 *
 * Enflasyon düzeltmesi: `inflation` verildiğinde nominal büyüme reel büyümeye
 * çevrilir (Fisher). Böylece enflasyonun altında kalan "büyüme" gerçek küçülme
 * olarak skorlanır. Örn: BIST hissesi nominal %20 büyüme + %30 TÜFE → reel -%7.7.
 */
function computeGrowth(
  f: YahooFundamentals,
  inflation?: InflationContext,
): {
  score: number | null;
  metricsUsed: string[];
  realRevenueGrowth: number | null;
  realEarningsGrowth: number | null;
} {
  // Nominal → reel dönüşüm (enflasyon varsa)
  const realRev = (f.revenueGrowth !== null && inflation)
    ? toRealGrowth(f.revenueGrowth, inflation.tufeYoy)
    : f.revenueGrowth;
  const realEarn = (f.earningsGrowth !== null && inflation)
    ? toRealGrowth(f.earningsGrowth, inflation.tufeYoy)
    : f.earningsGrowth;

  const revPct = realRev !== null ? realRev * 100 : null;
  const earnPct = realEarn !== null ? realEarn * 100 : null;

  const revScore  = scale(revPct, -20, 40);
  const earnScore = scale(earnPct, -30, 50);

  const metricsUsed: string[] = [];
  if (revScore !== null)  metricsUsed.push('revenueGrowth');
  if (earnScore !== null) metricsUsed.push('earningsGrowth');

  return {
    score: mean([revScore, earnScore]),
    metricsUsed,
    realRevenueGrowth: realRev,
    realEarningsGrowth: realEarn,
  };
}

/**
 * Profitability alt-skoru (0-100).
 * Yahoo oran alanları 0-1 arası (0.15 = %15). UI'da %'ye çevrilir.
 * Ölçekler: ROE [0, 30%], ROA [0, 15%], OpMargin [0, 30%], NetMargin [0, 20%]
 */
function computeProfitability(f: YahooFundamentals): {
  score: number | null;
  metricsUsed: string[];
} {
  const roePct    = f.returnOnEquity   !== null ? f.returnOnEquity   * 100 : null;
  const roaPct    = f.returnOnAssets   !== null ? f.returnOnAssets   * 100 : null;
  const opMargPct = f.operatingMargins !== null ? f.operatingMargins * 100 : null;
  const netMargPct = f.profitMargin    !== null ? f.profitMargin    * 100 : null;

  const roeScore  = scale(roePct, 0, 30);
  const roaScore  = scale(roaPct, 0, 15);
  const opScore   = scale(opMargPct, 0, 30);
  const netScore  = scale(netMargPct, 0, 20);

  const metricsUsed: string[] = [];
  if (roeScore !== null) metricsUsed.push('returnOnEquity');
  if (roaScore !== null) metricsUsed.push('returnOnAssets');
  if (opScore !== null)  metricsUsed.push('operatingMargins');
  if (netScore !== null) metricsUsed.push('profitMargin');

  return { score: mean([roeScore, roaScore, opScore, netScore]), metricsUsed };
}

/**
 * Risk alt-skoru (0-100, yüksek = düşük risk, yatırımcı için iyi).
 *
 * - Debt/Equity: Yahoo bunu genelde yüzde olarak döner (150 = %150). Bazı
 *   versiyonlarda oran (1.5) olarak geliyor. 10'dan büyükse yüzde kabul
 *   edip 100'e böleriz.
 * - Current Ratio: triangular, optimal 1.5 (0.5 altında riskli, 3 üstünde
 *   aşırı muhafazakar).
 * - FCF: pozitif = 100, negatif = 0 (eşik skoru).
 * - Beta: 1'e yakınlık ödüllendirilir (Math.abs(beta-1), 0-1.5, reverse).
 */
function computeRisk(f: YahooFundamentals): {
  score: number | null;
  metricsUsed: string[];
} {
  // Debt/Equity normalize: Yahoo yüzde olarak döndürürse 100'e böl.
  let d2eRatio: number | null = f.debtToEquity;
  if (d2eRatio !== null && d2eRatio > 10) d2eRatio = d2eRatio / 100;
  const d2eScore = scale(d2eRatio, 0, 3, true); // Borç/Özsermaye 0→100, 3→0

  const currScore = triangular(f.currentRatio, 0.3, 1.5, 4);

  let fcfScore: number | null = null;
  if (f.freeCashflow !== null) {
    fcfScore = f.freeCashflow > 0 ? 100 : 0;
  }

  const betaScore =
    f.beta !== null
      ? scale(Math.abs(f.beta - 1), 0, 1.5, true) // |beta-1| 0→100, 1.5→0
      : null;

  const metricsUsed: string[] = [];
  if (d2eScore !== null)  metricsUsed.push('debtToEquity');
  if (currScore !== null) metricsUsed.push('currentRatio');
  if (fcfScore !== null)  metricsUsed.push('freeCashflow');
  if (betaScore !== null) metricsUsed.push('beta');

  return { score: mean([d2eScore, currScore, fcfScore, betaScore]), metricsUsed };
}

// ── Ana motor ─────────────────────────────────────────────────────────────

/**
 * Investment Score hesaplar. Deterministik, null-tolerant, test edilebilir.
 *
 * @param f - Yahoo Fundamentals tüm alanları
 * @param customWeights - Varsayılan ağırlıkları geçersiz kıl (opsiyonel)
 * @param inflation - TÜFE bağlamı. Verilirse F/K üst sınırı genişler + büyüme
 *                    reel hale çevrilir. null/undefined → global formül (geriye uyumlu).
 */
export function computeInvestableScore(
  f: YahooFundamentals,
  customWeights: InvestableWeights = DEFAULT_WEIGHTS,
  inflation?: InflationContext,
): InvestableScore {
  const val  = computeValuation(f, inflation);
  const gro  = computeGrowth(f, inflation);
  const pro  = computeProfitability(f);
  const ris  = computeRisk(f);

  // Hangi boyutların skoru var? Olmayanların ağırlığını yeniden dağıt.
  const dimensions = [
    { key: 'valuation'     as const, score: val.score, baseWeight: customWeights.valuation },
    { key: 'growth'        as const, score: gro.score, baseWeight: customWeights.growth },
    { key: 'profitability' as const, score: pro.score, baseWeight: customWeights.profitability },
    { key: 'risk'          as const, score: ris.score, baseWeight: customWeights.risk },
  ];

  const presentDimensions = dimensions.filter(d => d.score !== null);
  const sumPresentBaseWeights = presentDimensions.reduce((s, d) => s + d.baseWeight, 0);

  // Applied weights: eksik boyutlar 0, mevcutlar orantılı 1'e normalize
  const appliedWeights: InvestableWeights = {
    valuation:     0,
    growth:        0,
    profitability: 0,
    risk:          0,
  };

  let weightedSum = 0;
  if (sumPresentBaseWeights > 0) {
    for (const d of presentDimensions) {
      const w = d.baseWeight / sumPresentBaseWeights;
      appliedWeights[d.key] = w;
      weightedSum += (d.score as number) * w;
    }
  }

  const finalScore = presentDimensions.length === 0
    ? 50 // Hiç metrik yoksa nötr fallback
    : Math.round(weightedSum);

  const subScores: InvestableSubScores = {
    valuation:     val.score === null ? 50 : Math.round(val.score),
    growth:        gro.score === null ? 50 : Math.round(gro.score),
    profitability: pro.score === null ? 50 : Math.round(pro.score),
    risk:          ris.score === null ? 50 : Math.round(ris.score),
  };

  // Mevcut vs eksik metrikler
  const allTrackedMetrics = [
    'peRatio', 'pegRatio', 'priceToBook', 'enterpriseToEbitda',
    'revenueGrowth', 'earningsGrowth',
    'returnOnEquity', 'returnOnAssets', 'operatingMargins', 'profitMargin',
    'debtToEquity', 'currentRatio', 'freeCashflow', 'beta',
  ];
  const presentMetrics = [
    ...val.metricsUsed, ...gro.metricsUsed, ...pro.metricsUsed, ...ris.metricsUsed,
  ];
  const missingMetrics = allTrackedMetrics.filter(m => !presentMetrics.includes(m));

  // Confidence: 14 metrikten kaçı var
  const presentCount = presentMetrics.length;
  const confidence: InvestableConfidence =
    presentCount >= 12 ? 'high' :
    presentCount >=  7 ? 'medium' :
                         'low';

  const inflationAdjustment = inflation
    ? {
        applied: true,
        tufeYoy: inflation.tufeYoy,
        realRevenueGrowth: gro.realRevenueGrowth,
        realEarningsGrowth: gro.realEarningsGrowth,
        peUpperBoundUsed: val.peUpperBound,
      }
    : undefined;

  return {
    score:          finalScore,
    subScores,
    appliedWeights,
    missingMetrics,
    presentCount,
    totalMetrics:   allTrackedMetrics.length,
    confidence,
    ratingLabel:    labelFromScore(finalScore),
    inflationAdjustment,
  };
}

// ── Rating labels ─────────────────────────────────────────────────────────

export function labelFromScore(score: number): InvestableRating {
  if (score >= 80) return 'Güçlü Al';
  if (score >= 65) return 'Al';
  if (score >= 45) return 'Tut';
  if (score >= 30) return 'Sat';
  return 'Güçlü Sat';
}

/**
 * UI için rating rengi (Tailwind class).
 */
export function colorFromRating(rating: InvestableRating): {
  text: string;
  bg: string;
  ring: string;
} {
  switch (rating) {
    case 'Güçlü Al':  return { text: 'text-emerald-400', bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/40' };
    case 'Al':        return { text: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'ring-emerald-400/30' };
    case 'Tut':       return { text: 'text-amber-300',   bg: 'bg-amber-500/10',   ring: 'ring-amber-400/30' };
    case 'Sat':       return { text: 'text-orange-400',  bg: 'bg-orange-500/10',  ring: 'ring-orange-400/30' };
    case 'Güçlü Sat': return { text: 'text-red-400',     bg: 'bg-red-500/15',     ring: 'ring-red-500/40' };
  }
}
