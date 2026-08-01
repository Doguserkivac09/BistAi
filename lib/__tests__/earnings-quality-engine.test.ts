/**
 * Kâr Kalitesi Motoru (B1) — birim testleri.
 * Senaryolar: kâğıt-üstü kâr, finansman yükü, gerçek faaliyet, banka, yetersiz veri.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeEarningsQuality } from '../earnings-quality-engine';
import type { IsyQuarter } from '../isyatirim-financials';

function q(label: string, year: number, quarter: 1 | 2 | 3 | 4, f: Partial<IsyQuarter['fields']>): IsyQuarter {
  return { year, quarter, label, fields: f, ebitda: (f.operatingProfit ?? 0) + (f.amortization ?? 0) };
}
// 4 özdeş çeyrek üret (TTM için)
function fourQuarters(f: Partial<IsyQuarter['fields']>): IsyQuarter[] {
  return [q('24Q1', 2024, 1, f), q('24Q2', 2024, 2, f), q('24Q3', 2024, 3, f), q('24Q4', 2024, 4, f)];
}

describe('computeEarningsQuality', () => {
  it('kâğıt üstü kâr: net+ ama faaliyet kârı negatif', () => {
    const r = computeEarningsQuality(fourQuarters({
      revenue: 100, grossProfit: 20, operatingProfit: -5, financialIncome: 30,
      financialExpense: -2, netIncome: 18, operatingCashFlow: -3,
    }));
    assert.equal(r.applicable, true);
    assert.equal(r.verdict, 'kağıt-üstü');
    assert.ok(r.flags.some((x) => x.code === 'kağıt-üstü'));
    assert.ok(r.flags.some((x) => x.code === 'faaliyet-zararı'));
  });

  it('finansman yükü: faaliyet kârı+ ama faiz onu yiyor (coverage<1.5)', () => {
    const r = computeEarningsQuality(fourQuarters({
      revenue: 100, grossProfit: 25, operatingProfit: 10, amortization: 2,
      financialExpense: -9, netIncome: 1, operatingCashFlow: 6,
    }));
    assert.equal(r.verdict, 'finansman-yükü');
    assert.ok(r.interestCoverage! < 1.5);
    assert.ok(r.flags.some((x) => x.code === 'finansman-yükü'));
  });

  it('gerçek faaliyet kârı: marj sağlam, faizi karşılıyor, nakde dönüyor', () => {
    const r = computeEarningsQuality(fourQuarters({
      revenue: 100, grossProfit: 35, operatingProfit: 22, amortization: 3,
      financialExpense: -3, netIncome: 16, operatingCashFlow: 14,
    }));
    assert.equal(r.verdict, 'gerçek');
    assert.ok(r.score >= 60);
    assert.ok(r.flags.some((x) => x.code === 'gerçek-faaliyet'));
    assert.ok(Math.abs(r.operatingMargin! - 0.22) < 0.001);
    assert.ok(r.interestCoverage! >= 2);
  });

  it('TMS-29: borçlu şirket + enflasyon → parasal kazanç tahmini', () => {
    const f = {
      revenue: 100, operatingProfit: 5, financialExpense: -20, netIncome: 12, operatingCashFlow: 4,
      cash: 10, tradeReceivables: 20, shortFinDebt: 60, longFinDebt: 40, tradePayablesShort: 30,
    };
    const r = computeEarningsQuality(fourQuarters(f), { inflationRate: 0.4 });
    assert.equal(r.dataQuality, 'tahmini-tms29');
    assert.ok(r.netMonetaryPosition! < 0); // borçlu
    assert.ok(r.estimatedMonetaryGain! > 0); // enflasyonda kazanç
    // net parasal poz = 30 − 130 = -100 → kazanç ≈ 100 × 0.4 = 40; TTM net kâr = 4×12 = 48 → pay ~0.83
    assert.ok(r.monetaryShareOfNet! > 0.5);
    assert.ok(r.flags.some((x) => x.code === 'parasal-şişkin'));
  });

  it('banka → uygulanmaz', () => {
    const r = computeEarningsQuality(fourQuarters({ revenue: 100, operatingProfit: 10, netIncome: 8 }), { isBank: true });
    assert.equal(r.applicable, false);
    assert.equal(r.verdict, 'belirsiz');
  });

  it('yetersiz veri → belirsiz', () => {
    assert.equal(computeEarningsQuality([]).verdict, 'belirsiz');
    assert.equal(computeEarningsQuality(fourQuarters({ revenue: 100 })).verdict, 'belirsiz'); // ebit/net yok
  });

  it('forensic: tahakkuk şişkin (net kâr nakde dönmüyor)', () => {
    const r = computeEarningsQuality(fourQuarters({
      revenue: 100, operatingProfit: 20, amortization: 2, financialExpense: -3,
      netIncome: 40, operatingCashFlow: 5, totalAssets: 200,
    }));
    // accruals = (TTM 160 − 20) / 200 = 0.70 → şişkin
    assert.ok(r.accrualsRatio! > 0.08);
    assert.ok(r.flags.some((f) => f.code === 'tahakkuk-şişkin'));
  });

  it('forensic: operasyon-dışı kâr (vergi öncesi EBIT\'i aşıyor)', () => {
    const r = computeEarningsQuality(fourQuarters({
      revenue: 100, operatingProfit: 5, amortization: 1, financialExpense: -1,
      netIncome: 20, tax: -2, operatingCashFlow: 18, totalAssets: 500,
    }));
    // pretax = 88, ebit = 20 → nonOp = (88-20)/88 ≈ 0.77
    assert.ok(r.nonOperatingShare! > 0.4);
    assert.ok(r.flags.some((f) => f.code === 'operasyon-dışı'));
  });

  it('forensic: aşırı borç (net borç / FAVÖK > 4)', () => {
    const r = computeEarningsQuality(fourQuarters({
      revenue: 100, operatingProfit: 10, amortization: 5, financialExpense: -2,
      netIncome: 5, operatingCashFlow: 8, shortFinDebt: 200, longFinDebt: 100, cash: 10, totalAssets: 400,
    }));
    // netDebt = 290, FAVÖK TTM = (10+5)*4 = 60 → 4.83×
    assert.ok(r.netDebtToEbitda! > 4);
    assert.ok(r.flags.some((f) => f.code === 'aşırı-borç'));
  });

  it('doğruluk: finansal gelir > gider → YANILTICI finansman-yükü ÇIKMAZ', () => {
    // Ekran senaryosu: EBIT zayıf, ama finansal gelir finansman giderini aşıyor (net + finansman)
    const r = computeEarningsQuality(fourQuarters({
      revenue: 100, operatingProfit: 2, amortization: 7, financialExpense: -8, financialIncome: 13,
      tax: -2.6, netIncome: 4, operatingCashFlow: 16, totalAssets: 300,
    }));
    assert.notEqual(r.verdict, 'finansman-yükü');                       // net finansman POZİTİF → yanıltıcı değil
    assert.ok(!r.flags.some((f) => f.code === 'finansman-yükü'));
    assert.ok(r.flags.some((f) => f.code === 'operasyon-dışı'));        // gerçek hikâye: operasyon-dışı bağımlılık
  });

  it('forensic: alacak balonu (alacak hasılattan çok hızlı)', () => {
    const f = (rev: number, recv: number) => ({ revenue: rev, operatingProfit: 10, netIncome: 6, tradeReceivables: recv });
    const qs = [
      q('24Q1', 2024, 1, f(100, 100)), q('24Q2', 2024, 2, f(100, 110)),
      q('24Q3', 2024, 3, f(100, 130)), q('24Q4', 2024, 4, f(100, 180)),
      q('25Q1', 2025, 1, f(110, 260)),
    ];
    const r = computeEarningsQuality(qs);
    // receivablesYoY = (260-100)/100 = 1.6 ; revenueYoY = 0.10 → balon
    assert.ok(r.receivablesYoY! - r.revenueYoY! > 0.25);
    assert.ok(r.flags.some((fl) => fl.code === 'alacak-balonu'));
  });

  it('katman 1: watchTriggers bayraklardan türer (alacak balonu → izle metni)', () => {
    const f = (rev: number, recv: number) => ({ revenue: rev, operatingProfit: 10, netIncome: 6, tradeReceivables: recv });
    const r = computeEarningsQuality([
      q('24Q1', 2024, 1, f(100, 100)), q('24Q2', 2024, 2, f(100, 110)),
      q('24Q3', 2024, 3, f(100, 130)), q('24Q4', 2024, 4, f(100, 180)),
      q('25Q1', 2025, 1, f(110, 260)),
    ]);
    assert.ok(r.watchTriggers.some((w) => w.toLowerCase().includes('alacak')));
  });

  it('katman 2: yükselen marj → operatingTrend iyileşiyor', () => {
    const mk = (op: number) => ({ revenue: 100, operatingProfit: op, netIncome: op / 2 });
    const r = computeEarningsQuality([
      q('24Q1', 2024, 1, mk(5)), q('24Q2', 2024, 2, mk(7)), q('24Q3', 2024, 3, mk(9)), q('24Q4', 2024, 4, mk(12)),
    ]);
    assert.equal(r.operatingTrend?.direction, 'iyileşiyor');
  });

  it('kâr köprüsü hasılat yüzdeleri doğru', () => {
    const r = computeEarningsQuality(fourQuarters({ revenue: 100, grossProfit: 30, operatingProfit: 20, netIncome: 10 }));
    const ebitStep = r.bridge.find((s) => s.key === 'ebit')!;
    assert.ok(Math.abs(ebitStep.pctOfRevenue! - 20) < 0.01); // TTM: 80/400 = 20%
  });
});
