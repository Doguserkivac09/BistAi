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
    label: 'XU030 Ağustos 2025',
    expiryMonth: 7,
    expiryYear: 2025,
    expiry: new Date(Date.UTC(2025, 7, 29)),
    multiplier: 10,
    initialMarginRate: 0.1,
    tickSize: 0.25,
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
    assert.equal(r.risk.notionalPerContract, Math.round(entry * 10));
    assert.equal(
      r.risk.initialMarginPerContract,
      Math.round(entry * 10 * 0.1),
    );
    assert.equal(r.risk.leverage, 10); // 1/0.1
  });

  it('pozisyon boyutu risk %\'sine göre hesaplanır', () => {
    const r = analyzeViop(baseInput({ account: { equity: 1_000_000, riskPct: 0.02 } }));
    assert.ok(r.risk.positionSizeContracts !== null);
    assert.ok(r.risk.positionSizeContracts! >= 0);
    // Manuel doğrulama: floor(20000 / (stopMesafesi × 10))
    const stopDist = Math.abs(r.risk.entryPrice - r.risk.stopPrice);
    const expected = Math.floor(20000 / (stopDist * 10));
    assert.equal(r.risk.positionSizeContracts, expected);
  });

  it('hesap yoksa pozisyon boyutu null', () => {
    const r = analyzeViop(baseInput());
    assert.equal(r.risk.positionSizeContracts, null);
  });
});

describe('analyzeViop — likidasyon', () => {
  it('likidasyon eşiği = teminat oranı × 100', () => {
    const r = analyzeViop(baseInput());
    assert.equal(r.risk.liquidationMovePct, 10);
  });

  it('makul stop mesafesi likidasyondan önce devrede (güvenli kurgu)', () => {
    const r = analyzeViop(baseInput());
    // Trend serisinde stop mesafesi tipik olarak %10 altında
    if (r.risk.stopDistancePct < 10) {
      assert.equal(r.risk.stopBeforeLiquidation, true);
      assert.match(r.risk.warning, /plan dahilinde stop önce/);
    }
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
