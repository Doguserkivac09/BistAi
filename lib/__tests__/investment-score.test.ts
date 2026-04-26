/**
 * Investment Score — Fixture Tests
 *
 * Çalıştır: npm test
 * Node native test runner + tsx loader ile çalışır.
 *
 * Amaç: Skor motorunun kritik davranışlarını donmuş tutmak.
 * Herhangi bir ağırlık/formül değişikliğinde buradaki bir test kırılır.
 *
 * Kapsam:
 *  - Rating band sınırları (29/30, 44/45, 64/65, 79/80)
 *  - Null-tolerance: hiç metrik yok, sadece bir boyut var
 *  - D/E normalizasyonu (yüzde vs oran)
 *  - Enflasyon düzeltmesi: nominal → reel, F/K üst sınır
 *  - Geriye uyumluluk: inflation undefined → global formül
 *  - Confidence seviyeleri
 *  - Ağırlık normalizasyonu: bir boyut null olunca diğerlerine dağıtım
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeInvestableScore,
  labelFromScore,
  DEFAULT_WEIGHTS,
  type InflationContext,
} from '../investment-score';
import type { YahooFundamentals } from '../yahoo-fundamentals';

// ── Test fixture factory ───────────────────────────────────────────────────

/**
 * Tüm alanlar null ile başlayan bir Fundamentals iskeleti. Testler
 * değiştirmek istediği alanı override eder.
 */
function makeFundamentals(overrides: Partial<YahooFundamentals> = {}): YahooFundamentals {
  return {
    symbol: 'TEST.IS',
    shortName: 'Test Şirketi',
    sector: '',
    industry: '',
    marketCap: null,
    peRatio: null,
    eps: null,
    bookValue: null,
    priceToBook: null,
    profitMargin: null,
    dividendYield: null,
    week52High: null,
    week52Low: null,
    movingAverage50: null,
    movingAverage200: null,
    currentRatio: null,
    totalDebt: null,
    totalCash: null,
    institutionsPercentHeld: null,
    insidersPercentHeld: null,
    shortRatio: null,
    pegRatio: null,
    enterpriseToEbitda: null,
    revenueGrowth: null,
    earningsGrowth: null,
    returnOnEquity: null,
    returnOnAssets: null,
    operatingMargins: null,
    debtToEquity: null,
    beta: null,
    freeCashflow: null,
    reportedDate: new Date().toISOString(),
    source: 'yahoo',
    ...overrides,
  };
}

// ── Rating band sınırları ──────────────────────────────────────────────────

describe('labelFromScore — rating band sınırları', () => {
  it('80+ → Güçlü Al', () => {
    assert.equal(labelFromScore(80), 'Güçlü Al');
    assert.equal(labelFromScore(100), 'Güçlü Al');
    assert.equal(labelFromScore(95), 'Güçlü Al');
  });

  it('65-79 → Al', () => {
    assert.equal(labelFromScore(79), 'Al');
    assert.equal(labelFromScore(65), 'Al');
  });

  it('45-64 → Tut', () => {
    assert.equal(labelFromScore(64), 'Tut');
    assert.equal(labelFromScore(45), 'Tut');
    assert.equal(labelFromScore(50), 'Tut');
  });

  it('30-44 → Sat', () => {
    assert.equal(labelFromScore(44), 'Sat');
    assert.equal(labelFromScore(30), 'Sat');
  });

  it('<30 → Güçlü Sat', () => {
    assert.equal(labelFromScore(29), 'Güçlü Sat');
    assert.equal(labelFromScore(0), 'Güçlü Sat');
  });
});

// ── Null-tolerance ─────────────────────────────────────────────────────────

describe('Null-tolerance — eksik veri davranışı', () => {
  it('Hiç metrik yok → skor 50 (nötr), confidence low, tüm ağırlıklar 0', () => {
    const f = makeFundamentals();
    const s = computeInvestableScore(f);

    assert.equal(s.score, 50, 'Tüm null durumda nötr fallback olmalı');
    assert.equal(s.confidence, 'low');
    assert.equal(s.presentCount, 0);
    assert.equal(s.missingMetrics.length, 14);
    assert.deepEqual(s.appliedWeights, { valuation: 0, growth: 0, profitability: 0, risk: 0 });
  });

  it('Sadece valuation boyutu var → valuation ağırlığı 1.0, diğerleri 0', () => {
    const f = makeFundamentals({ peRatio: 10, priceToBook: 1.5 });
    const s = computeInvestableScore(f);

    assert.equal(s.appliedWeights.valuation, 1, 'Tek boyut varsa ağırlığı 1 olmalı');
    assert.equal(s.appliedWeights.growth, 0);
    assert.equal(s.appliedWeights.profitability, 0);
    assert.equal(s.appliedWeights.risk, 0);
    assert.equal(s.presentCount, 2);
    assert.equal(s.confidence, 'low'); // 2 metrik < 7
  });

  it('İki boyut (val + risk) → ağırlıklar 0.30/0.25 → normalize 0.545/0.455', () => {
    const f = makeFundamentals({ peRatio: 10, beta: 1 });
    const s = computeInvestableScore(f);

    const totalBase = DEFAULT_WEIGHTS.valuation + DEFAULT_WEIGHTS.risk;
    const expectedVal = DEFAULT_WEIGHTS.valuation / totalBase;
    const expectedRisk = DEFAULT_WEIGHTS.risk / totalBase;

    assert.ok(Math.abs(s.appliedWeights.valuation - expectedVal) < 0.01);
    assert.ok(Math.abs(s.appliedWeights.risk - expectedRisk) < 0.01);
    assert.equal(s.appliedWeights.growth, 0);
    assert.equal(s.appliedWeights.profitability, 0);
  });
});

// ── Confidence seviyeleri ──────────────────────────────────────────────────

describe('Confidence — metrik sayısına göre güven', () => {
  it('12+ metrik → high', () => {
    const f = makeFundamentals({
      peRatio: 15, pegRatio: 1, priceToBook: 2, enterpriseToEbitda: 10,
      revenueGrowth: 0.1, earningsGrowth: 0.15,
      returnOnEquity: 0.15, returnOnAssets: 0.07, operatingMargins: 0.12, profitMargin: 0.08,
      debtToEquity: 0.5, currentRatio: 1.5, freeCashflow: 1e9, beta: 1,
    });
    const s = computeInvestableScore(f);
    assert.equal(s.presentCount, 14);
    assert.equal(s.confidence, 'high');
  });

  it('7-11 metrik → medium', () => {
    const f = makeFundamentals({
      peRatio: 15, priceToBook: 2, returnOnEquity: 0.15, returnOnAssets: 0.07,
      operatingMargins: 0.12, debtToEquity: 0.5, currentRatio: 1.5,
    });
    const s = computeInvestableScore(f);
    assert.equal(s.presentCount, 7);
    assert.equal(s.confidence, 'medium');
  });

  it('<7 metrik → low', () => {
    const f = makeFundamentals({ peRatio: 15, priceToBook: 2, beta: 1 });
    const s = computeInvestableScore(f);
    assert.equal(s.presentCount, 3);
    assert.equal(s.confidence, 'low');
  });
});

// ── D/E normalizasyonu ─────────────────────────────────────────────────────

describe('D/E normalizasyonu — yüzde vs oran', () => {
  it('D/E 150 (yüzde) → 1.5 olarak yorumlanır, makul risk skoru', () => {
    const fPercent = makeFundamentals({ debtToEquity: 150, currentRatio: 1.5 });
    const fRatio   = makeFundamentals({ debtToEquity: 1.5, currentRatio: 1.5 });

    const sPercent = computeInvestableScore(fPercent);
    const sRatio   = computeInvestableScore(fRatio);

    // Her ikisi aynı risk skorunu üretmeli (1.5 oran → 50 skor)
    assert.equal(sPercent.subScores.risk, sRatio.subScores.risk);
  });

  it('D/E 5 → büyük yüzde değil, oran (çok yüksek borç)', () => {
    const f = makeFundamentals({ debtToEquity: 5, currentRatio: 1.5 });
    const s = computeInvestableScore(f);
    // D/E 5 >> 3 (scale max) → reverse edilince 0
    // currentRatio 1.5 → triangular optimal → 100
    // ortalama = 50
    assert.equal(s.subScores.risk, 50);
  });

  it('D/E 0 (borçsuz) → en iyi risk puanı katkısı', () => {
    const f = makeFundamentals({ debtToEquity: 0, currentRatio: 1.5, freeCashflow: 1e9, beta: 1 });
    const s = computeInvestableScore(f);
    assert.ok(s.subScores.risk >= 90, `Borçsuz + sağlıklı şirket risk skoru 90+ olmalı, alındı: ${s.subScores.risk}`);
  });
});

// ── Beta skoru ─────────────────────────────────────────────────────────────

describe('Beta skoru — 1 civarı optimal', () => {
  it('Beta 1 → mükemmel (|β-1|=0)', () => {
    const f = makeFundamentals({ beta: 1 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.risk, 100);
  });

  it('Beta 2.5 → |1.5| cap → 0', () => {
    const f = makeFundamentals({ beta: 2.5 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.risk, 0);
  });

  it('Beta -0.5 → |1.5| cap → 0 (mutlak değer simetrik)', () => {
    const f = makeFundamentals({ beta: -0.5 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.risk, 0);
  });
});

// ── FCF eşiği ──────────────────────────────────────────────────────────────

describe('FCF — pozitif/negatif eşik', () => {
  it('FCF pozitif → 100', () => {
    const f = makeFundamentals({ freeCashflow: 1 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.risk, 100);
  });

  it('FCF negatif → 0', () => {
    const f = makeFundamentals({ freeCashflow: -1e9 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.risk, 0);
  });
});

// ── F/K (valuation) davranışı ──────────────────────────────────────────────

describe('Valuation — F/K scale davranışı', () => {
  it('F/K 5 (minimum) → 100 puan (en iyi)', () => {
    const f = makeFundamentals({ peRatio: 5 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.valuation, 100);
  });

  it('F/K 40 (maksimum) → 0 puan (en kötü)', () => {
    const f = makeFundamentals({ peRatio: 40 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.valuation, 0);
  });

  it('F/K 22.5 (ortalama) → 50 puan', () => {
    const f = makeFundamentals({ peRatio: 22.5 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.valuation, 50);
  });

  it('F/K aşırı yüksek (500) → clamp → 0 puan (NaN değil)', () => {
    const f = makeFundamentals({ peRatio: 500 });
    const s = computeInvestableScore(f);
    assert.equal(s.subScores.valuation, 0);
    assert.ok(isFinite(s.score));
  });
});

// ── Enflasyon düzeltmesi ───────────────────────────────────────────────────

describe('Enflasyon düzeltmesi — TÜFE bağlamı', () => {
  const tufe30: InflationContext = { tufeYoy: 30, source: 'tcmb' };

  it('inflation verilmezse → inflationAdjustment undefined (geriye uyumlu)', () => {
    const f = makeFundamentals({ peRatio: 15 });
    const s = computeInvestableScore(f);
    assert.equal(s.inflationAdjustment, undefined);
  });

  it('inflation verilirse → inflationAdjustment.applied true, tufe doğru', () => {
    const f = makeFundamentals({ peRatio: 15 });
    const s = computeInvestableScore(f, DEFAULT_WEIGHTS, tufe30);
    assert.equal(s.inflationAdjustment?.applied, true);
    assert.equal(s.inflationAdjustment?.tufeYoy, 30);
  });

  it('TÜFE %30 → F/K üst sınırı 40 × (1 + 0.3 × 0.75) = 49', () => {
    const f = makeFundamentals({ peRatio: 15 });
    const s = computeInvestableScore(f, DEFAULT_WEIGHTS, tufe30);
    // 40 × (1 + min(0.3 × 0.75, 1.5)) = 40 × 1.225 = 49
    assert.ok(Math.abs(s.inflationAdjustment!.peUpperBoundUsed - 49) < 0.01);
  });

  it('Reel büyüme: nominal %60 + TÜFE %30 → reel ~%23 (Fisher)', () => {
    const f = makeFundamentals({ revenueGrowth: 0.6 });
    const s = computeInvestableScore(f, DEFAULT_WEIGHTS, tufe30);
    // (1.6 / 1.3) - 1 = 0.2308
    assert.ok(
      Math.abs((s.inflationAdjustment?.realRevenueGrowth ?? 0) - 0.2308) < 0.001,
      `Reel büyüme 0.2308 olmalı, alındı: ${s.inflationAdjustment?.realRevenueGrowth}`
    );
  });

  it('Reel büyüme: nominal %15 + TÜFE %30 → reel negatif (şirket küçülüyor)', () => {
    const f = makeFundamentals({ revenueGrowth: 0.15 });
    const s = computeInvestableScore(f, DEFAULT_WEIGHTS, tufe30);
    assert.ok(
      (s.inflationAdjustment?.realRevenueGrowth ?? 0) < 0,
      'Enflasyonun altında nominal büyüme reel küçülme sayılmalı'
    );
  });

  it('Enflasyon F/K üst sınırı genişlettiğinde daha hafif ceza', () => {
    // F/K 45 global (5-40) → clamp 40 → 0 skor
    // F/K 45 enflasyonlu (5-49) → clamp 45 → (45-5)/(49-5) reverse = ~9
    const f = makeFundamentals({ peRatio: 45 });
    const sGlobal    = computeInvestableScore(f);
    const sInflation = computeInvestableScore(f, DEFAULT_WEIGHTS, tufe30);
    assert.ok(
      sInflation.subScores.valuation > sGlobal.subScores.valuation,
      'Enflasyon düzeltmeli skor globalden daha yumuşak olmalı'
    );
  });

  it('Çok yüksek enflasyon (%200) → F/K üst sınırı 2.5× cap edilir', () => {
    const tufe200: InflationContext = { tufeYoy: 200, source: 'tcmb' };
    const f = makeFundamentals({ peRatio: 30 });
    const s = computeInvestableScore(f, DEFAULT_WEIGHTS, tufe200);
    // 40 × (1 + min(2.0 × 0.75, 1.5)) = 40 × 2.5 = 100
    assert.equal(s.inflationAdjustment?.peUpperBoundUsed, 100);
  });
});

// ── Senaryo testleri (gerçek hisse benzetimi) ─────────────────────────────

describe('Senaryo — sağlıklı büyük-cap', () => {
  it('Güçlü temeller → Al / Güçlü Al (65+)', () => {
    const f = makeFundamentals({
      peRatio: 12, pegRatio: 0.8, priceToBook: 1.2, enterpriseToEbitda: 8,
      revenueGrowth: 0.15, earningsGrowth: 0.20,
      returnOnEquity: 0.22, returnOnAssets: 0.12, operatingMargins: 0.25, profitMargin: 0.15,
      debtToEquity: 0.3, currentRatio: 1.6, freeCashflow: 5e9, beta: 1.1,
    });
    const s = computeInvestableScore(f);
    assert.ok(s.score >= 65, `Sağlıklı büyük-cap için 65+ bekleniyordu, alındı: ${s.score}`);
    assert.ok(['Al', 'Güçlü Al'].includes(s.ratingLabel));
  });
});

describe('Senaryo — zayıf temeller', () => {
  it('Yüksek F/K + negatif büyüme + negatif ROE → Sat / Güçlü Sat (<45)', () => {
    const f = makeFundamentals({
      peRatio: 80, pegRatio: 2.5, priceToBook: 4.5, enterpriseToEbitda: 25,
      revenueGrowth: -0.15, earningsGrowth: -0.25,
      returnOnEquity: -0.10, returnOnAssets: -0.05, operatingMargins: -0.08, profitMargin: -0.10,
      debtToEquity: 2.8, currentRatio: 0.6, freeCashflow: -2e9, beta: 1.8,
    });
    const s = computeInvestableScore(f);
    assert.ok(s.score < 45, `Zayıf temeller için <45 bekleniyordu, alındı: ${s.score}`);
    assert.ok(['Sat', 'Güçlü Sat'].includes(s.ratingLabel));
  });
});

describe('Senaryo — BIST + enflasyon düzeltmesi dürüstlük testi', () => {
  it('Nominal %15 gelir büyümesi + TÜFE %30 → enflasyonsuz skor > enflasyonlu skor', () => {
    const tufe30: InflationContext = { tufeYoy: 30, source: 'tcmb' };
    // BIMAS benzeri: nominal pozitif büyüme ama reel negatif
    const f = makeFundamentals({
      peRatio: 24, priceToBook: 2.7,
      revenueGrowth: 0.095, earningsGrowth: 0.25,
      returnOnEquity: 0.116, returnOnAssets: 0.032, operatingMargins: 0.034, profitMargin: 0.028,
      debtToEquity: 31.6, currentRatio: 1.03, freeCashflow: 9e9, beta: 0,
    });
    const sGlobal    = computeInvestableScore(f);
    const sInflation = computeInvestableScore(f, DEFAULT_WEIGHTS, tufe30);

    assert.ok(
      sInflation.score < sGlobal.score,
      `Enflasyon düzeltmesi düşük büyümeyi cezalandırmalı: ${sGlobal.score} → ${sInflation.score}`
    );
    assert.ok(
      sInflation.inflationAdjustment!.realRevenueGrowth! < 0,
      'Reel gelir büyümesi negatif olmalı'
    );
  });
});
