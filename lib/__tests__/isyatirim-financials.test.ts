/**
 * İş Yatırım çeyreklik katman — saf fonksiyon testleri (fetch hariç).
 * Kümülatif→standalone differencing + TTM + dönem referansları.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  toStandaloneQuarters,
  computeTTM,
  recentQuarterRefs,
  type IsyPeriodData,
} from '../isyatirim-financials';

// ASELS 2024 gerçek kümülatif (milyar TL, ×1e9): P3/P6/P9/P12
function p(year: number, period: 3 | 6 | 9 | 12, revenue: number, op: number, equity: number): IsyPeriodData {
  return { year, period, fields: { revenue, operatingProfit: op, equity, amortization: 0 } };
}

describe('toStandaloneQuarters — kümülatif → tek çeyrek', () => {
  it('gelir kalemi yıl-içi fark, bilanço snapshot', () => {
    const periods = [
      p(2024, 3, 20.9, 6.2, 102.9),
      p(2024, 6, 48.2, 12.6, 113.3),
      p(2024, 9, 80.9, 19.2, 125.4),
      p(2024, 12, 157.3, 35.8, 185.0),
    ];
    const q = toStandaloneQuarters(periods);
    assert.equal(q.length, 4);
    // Gelir standalone (fark)
    assert.ok(Math.abs(q[0]!.fields.revenue! - 20.9) < 0.01); // Q1 = P3
    assert.ok(Math.abs(q[1]!.fields.revenue! - 27.3) < 0.01); // Q2 = 48.2 - 20.9
    assert.ok(Math.abs(q[2]!.fields.revenue! - 32.7) < 0.01); // Q3 = 80.9 - 48.2
    assert.ok(Math.abs(q[3]!.fields.revenue! - 76.4) < 0.01); // Q4 = 157.3 - 80.9
    // Faaliyet karı standalone
    assert.ok(Math.abs(q[3]!.fields.operatingProfit! - 16.6) < 0.01); // 35.8 - 19.2
    // Özkaynak SNAPSHOT (fark ALINMAZ)
    assert.equal(q[3]!.fields.equity, 185.0);
    assert.equal(q[1]!.fields.equity, 113.3);
  });

  it('label ve quarter doğru', () => {
    const q = toStandaloneQuarters([p(2025, 3, 30, 9, 200)]);
    assert.equal(q[0]!.label, '2025Q1');
    assert.equal(q[0]!.quarter, 1);
  });

  it('eksik dönem atlanır (yalnız mevcut çeyrekler)', () => {
    const q = toStandaloneQuarters([p(2024, 3, 20, 6, 100), p(2024, 9, 80, 19, 125)]);
    // P6 yok → Q2 üretilmez; Q3 prev=P6 yok → fark alınamaz, kümülatif kalır
    assert.deepEqual(q.map((x) => x.quarter), [1, 3]);
  });

  it('ebitda = operatingProfit + amortization', () => {
    const periods = [{ year: 2025, period: 3 as const, fields: { operatingProfit: 9, amortization: 1.5 } }];
    const q = toStandaloneQuarters(periods);
    assert.equal(q[0]!.ebitda, 10.5);
  });
});

describe('computeTTM', () => {
  it('son 4 çeyreğin akış toplamı, bilanço snapshot', () => {
    const periods = [
      p(2024, 3, 20, 6, 100), p(2024, 6, 48, 12, 110),
      p(2024, 9, 80, 19, 120), p(2024, 12, 157, 35, 180),
    ];
    const q = toStandaloneQuarters(periods);
    const ttm = computeTTM(q)!;
    assert.ok(ttm);
    // TTM gelir = tüm standalone çeyrekler toplamı = yıl kümülatifi (157)
    assert.ok(Math.abs(ttm.revenue! - 157) < 0.01);
    // Özkaynak = son çeyrek snapshot
    assert.equal(ttm.equity, 180);
  });

  it('4 çeyrekten az → null', () => {
    const q = toStandaloneQuarters([p(2025, 3, 30, 9, 200)]);
    assert.equal(computeTTM(q), null);
  });
});

describe('recentQuarterRefs', () => {
  it('8 çeyrek geriye, yıl geçişi doğru', () => {
    const refs = recentQuarterRefs(2025, 1);
    assert.equal(refs.length, 8);
    assert.deepEqual(refs[0], { year: 2025, period: 3 });
    assert.deepEqual(refs[1], { year: 2024, period: 12 });
    assert.deepEqual(refs[4], { year: 2024, period: 3 });
    assert.deepEqual(refs[7], { year: 2023, period: 6 });
  });
});
