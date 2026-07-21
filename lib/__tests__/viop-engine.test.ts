/**
 * VIOP Engine — kaldıraç/likidasyon/vade testleri (FAZ V1 — VIOP-TRADINGVIEW-PLAN.md)
 * Çalıştır: npm test
 *
 * Kapsam:
 *  - Kaldıraç matematiği: notional, teminat, leverage = 1/oran
 *  - Pozisyon boyutu: risk %'sine göre kontrat adedi
 *  - Likidasyon: stop < likidasyon eşiği → güvenli kurgu
 *  - Vade sayacı: rollWarnDays altında roll uyarısı + skor kısması
 *  - Determinizm: aynı girdi aynı çıktı
 *  - Zorunlu kaldıraç risk ibaresi (disclaimer) her zaman var
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeViop, type ViopEngineInput } from '../viop-engine';
import type { ViopContract } from '../viop-symbols';
import type { OHLCVCandle } from '@/types';

function contract(overrides: Partial<ViopContract> = {}): ViopContract {
  return {
    code: 'F_XU0300825',
    underlying: 'XU030',
    cls: 'endeks',
    label: 'XU030 Ağustos 2025',
    expiryMonth: 7,
    expiryYear: 2025,
    expiry: new Date(Date.UTC(2025, 7, 29)),
    multiplier: 0.1,
    initialMarginRate: 0.1,
    maintenanceMarginRate: 0.075,
    tickSize: 0.25,
    settlement: 'nakdi',
    ...overrides,
  };
}

/** Basit trend serisi — yukarı (dir=1) veya aşağı (dir=-1). */
function trendCandles(n: number, start: number, step: number): OHLCVCandle[] {
  const out: OHLCVCandle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    price += step;
    const close = price;
    out.push({
      date: `2025-06-${String((i % 28) + 1).padStart(2, '0')}`,
      open,
      high: Math.max(open, close) + Math.abs(step) * 0.3,
      low: Math.min(open, close) - Math.abs(step) * 0.3,
      close,
      volume: 100_000 + i * 1000,
    });
  }
  return out;
}

function baseInput(overrides: Partial<ViopEngineInput> = {}): ViopEngineInput {
  return {
    contract: contract(),
    candles: trendCandles(60, 10000, 20),
    daysToExpiry: 40,
    basis: 120,
    regime: 'contango',
    ...overrides,
  };
}

describe('analyzeViop — kaldıraç matematiği', () => {
  it('notional = entry × çarpan, teminat = notional × oran, leverage = 1/oran', () => {
    const r = analyzeViop(baseInput());
    const entry = r.risk.entryPrice;
    assert.ok(Math.abs(r.risk.notionalPerContract - entry * 0.1) < 0.01);
    assert.ok(Math.abs(r.risk.initialMarginPerContract - entry * 0.1 * 0.1) < 0.01);
    assert.equal(r.risk.leverage, 10); // 1/0.1
  });

  it('endeks notional gerçekçi büyüklükte (çarpan regresyonu)', () => {
    // Çarpan 10 iken ~10.000 puanlık endekste notional 100.000+ ₺ çıkıyordu (100x şişik).
    // Doğrusu: endeks × 0,1 → birkaç bin ₺ bandı.
    const r = analyzeViop(baseInput());
    assert.ok(r.risk.notionalPerContract < 10_000, `notional ${r.risk.notionalPerContract} makul bandın üstünde`);
    assert.ok(r.risk.notionalPerContract > 100);
  });

  it('sürdürme teminatı başlangıçtan düşük', () => {
    const r = analyzeViop(baseInput());
    assert.ok(r.risk.maintenanceMarginPerContract < r.risk.initialMarginPerContract);
  });
});

describe('analyzeViop — margin call / likidasyon', () => {
  it('margin call eşiği = (başlangıç − sürdürme) oranı, likidasyondan ÖNCE gelir', () => {
    const r = analyzeViop(baseInput());
    assert.equal(r.risk.marginCallMovePct, 2.5); // (0.10 − 0.075) × 100
    assert.equal(r.risk.liquidationMovePct, 10);
    assert.ok(r.risk.marginCallMovePct < r.risk.liquidationMovePct);
  });

  it('stop margin call eşiğinin altındaysa güvenli kurgu bildirilir', () => {
    const r = analyzeViop(baseInput());
    if (r.risk.stopDistancePct < r.risk.marginCallMovePct) {
      assert.equal(r.risk.stopBeforeMarginCall, true);
      assert.match(r.risk.warning, /plan dahilinde stop önce/);
    } else {
      assert.equal(r.risk.stopBeforeMarginCall, false);
      assert.match(r.risk.warning, /teminat tamamlama çağrısı/);
    }
  });
});

describe('analyzeViop — tick yuvarlama', () => {
  it('stop/hedef/giriş sözleşmenin fiyat adımına yuvarlanır', () => {
    const r = analyzeViop(baseInput()); // tickSize 0.25
    for (const p of [r.risk.entryPrice, r.risk.stopPrice, r.risk.targetPrice]) {
      const steps = p / 0.25;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${p} 0,25 adımına yuvarlanmamış`);
    }
  });

  it('pay sözleşmesinde 0,01 adımına yuvarlanır', () => {
    const r = analyzeViop(baseInput({
      contract: contract({ tickSize: 0.01, multiplier: 100, settlement: 'fiziki' }),
      candles: trendCandles(60, 150, 0.4),
    }));
    for (const p of [r.risk.stopPrice, r.risk.targetPrice]) {
      const steps = p / 0.01;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${p} 0,01 adımına yuvarlanmamış`);
    }
  });
});

describe('analyzeViop — uzlaşma / fiziki teslimat', () => {
  it('nakdi sözleşmede teslimat uyarısı YOK', () => {
    const r = analyzeViop(baseInput());
    assert.equal(r.settlement, 'nakdi');
    assert.equal(r.settlementWarning, null);
  });

  it('fiziki teslimatlı pay sözleşmesinde uyarı üretilir ve adet belirtilir', () => {
    const r = analyzeViop(baseInput({
      contract: contract({ settlement: 'fiziki', multiplier: 100, tickSize: 0.01 }),
    }));
    assert.equal(r.settlement, 'fiziki');
    assert.ok(r.settlementWarning);
    assert.match(r.settlementWarning!, /FİZİKİ TESLİMAT/);
    assert.match(r.settlementWarning!, /100 adet/);
  });
});

describe('analyzeViop — vade', () => {
  it('vadeye rollWarnDays altında roll uyarısı verir', () => {
    const r = analyzeViop(baseInput({ daysToExpiry: 5, rollWarnDays: 7 }));
    assert.ok(r.expiry.rollWarning);
    assert.match(r.expiry.rollWarning!, /roll/);
  });

  it('vade uzaksa roll uyarısı null', () => {
    const r = analyzeViop(baseInput({ daysToExpiry: 40 }));
    assert.equal(r.expiry.rollWarning, null);
  });

  it('vadeye az kalınca skor kısılır', () => {
    const far = analyzeViop(baseInput({ daysToExpiry: 40 }));
    const near = analyzeViop(baseInput({ daysToExpiry: 3, rollWarnDays: 7 }));
    assert.ok(near.score <= far.score);
  });
});

describe('analyzeViop — makro hizası', () => {
  it('boğa makrosu long skoru artırır, ayı makrosu düşürür', () => {
    const bull = analyzeViop(baseInput({ macro: { biasScore: 80, label: 'risk-on' } }));
    const bear = analyzeViop(baseInput({ macro: { biasScore: -80, label: 'risk-off' } }));
    // Yukarı trend serisi long yön üretir → boğa hizalı skor ≥ ayı
    if (bull.direction === 'long') {
      assert.ok(bull.score >= bear.score);
    }
  });

  it('yüksek makro riski skoru kısar', () => {
    const calm = analyzeViop(baseInput({ macro: { riskScore: 10 } }));
    const risky = analyzeViop(baseInput({ macro: { riskScore: 85 } }));
    assert.ok(risky.score <= calm.score);
  });
});

describe('analyzeViop — genel', () => {
  it('kaldıraç risk ibaresi (disclaimer) her zaman mevcut', () => {
    const r = analyzeViop(baseInput());
    assert.match(r.disclaimer, /yatırım tavsiyesi değildir/);
    assert.match(r.disclaimer, /kaldıraçl/i);
  });

  it('determinizm: aynı girdi birebir aynı çıktı', () => {
    const inp = baseInput();
    const a = analyzeViop(inp);
    const b = analyzeViop(inp);
    assert.deepEqual(a, b);
  });

  it('skor 0-100 aralığında', () => {
    const r = analyzeViop(baseInput());
    assert.ok(r.score >= 0 && r.score <= 100);
  });

  it('rationale AL/SAT emri değil, senaryo dili içerir', () => {
    const r = analyzeViop(baseInput());
    assert.match(r.rationale, /senaryo/);
  });
});
