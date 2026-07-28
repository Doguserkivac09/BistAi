/**
 * Sinyal denetimi değişiklikleri — birim testleri (2026-07-28).
 *  - computeConfluence: tip-güvenilirlik ağırlığı (RSI Uyumsuzluğu > zayıf ön-sinyaller)
 *  - calculateOBV: kümülatif hacim yönü
 *  - detectMoneyFlowDivergence: null durumları
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateOBV } from '../indicators';
import { computeConfluence, detectMoneyFlowDivergence } from '../signals';
import type { StockSignal, OHLCVCandle } from '@/types';

function sig(type: string, severity: 'güçlü' | 'orta' | 'zayıf', direction: 'yukari' | 'asagi'): StockSignal {
  return { type, sembol: 'TEST', severity, direction, data: {} } as StockSignal;
}

describe('computeConfluence — tip-güvenilirlik ağırlığı', () => {
  it('RSI Uyumsuzluğu (1.35) aynı severity zayıf ön-sinyalden yüksek skor verir', () => {
    const star = computeConfluence([sig('RSI Uyumsuzluğu', 'güçlü', 'yukari')]).score;
    const weak = computeConfluence([sig('Trend Olgunlaşıyor', 'güçlü', 'yukari')]).score;
    assert.ok(star > weak, `RSI(${star}) > Trend Olgunlaşıyor(${weak}) olmalı`);
  });

  it('ağırlıksız tip (varsayılan 1.0) ön-sinyalden yüksek', () => {
    const neutral = computeConfluence([sig('MACD Kesişimi', 'güçlü', 'yukari')]).score;
    const weak = computeConfluence([sig('Yükselen Üçgen', 'güçlü', 'yukari')]).score;
    assert.ok(neutral > weak);
  });

  it('boş sinyal → skor 0', () => {
    assert.equal(computeConfluence([]).score, 0);
  });
});

describe('calculateOBV', () => {
  it('yükseliş +hacim, düşüş −hacim biriktirir', () => {
    const closes  = [10, 11, 10, 12];
    const volumes = [100, 200, 150, 300];
    const obv = calculateOBV(closes, volumes);
    // 0, +200, -150, +300 → [0, 200, 50, 350]
    assert.deepEqual(obv, [0, 200, 50, 350]);
  });
  it('düz kapanış OBV\'yi değiştirmez', () => {
    const obv = calculateOBV([10, 10, 10], [100, 100, 100]);
    assert.deepEqual(obv, [0, 0, 0]);
  });
});

describe('detectMoneyFlowDivergence', () => {
  const flat = (n: number): OHLCVCandle[] =>
    Array.from({ length: n }, (_, i) => ({ date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1_000_000 } as OHLCVCandle));

  it('yetersiz mum → null', () => {
    assert.equal(detectMoneyFlowDivergence('TEST', flat(20)), null);
  });
  it('düz piyasa (pivot yok) → null', () => {
    assert.equal(detectMoneyFlowDivergence('TEST', flat(50)), null);
  });
});
