/**
 * Vortex Indicator + Vortex Kesişimi sinyali — birim testleri.
 * Çalıştır: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateVortex } from '../indicators';
import { detectVortexCross } from '../signals';
import type { OHLCVCandle } from '@/types';

function candle(i: number, o: number, h: number, l: number, c: number): OHLCVCandle {
  return { date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`, open: o, high: h, low: l, close: c, volume: 1_000_000 } as OHLCVCandle;
}

describe('calculateVortex', () => {
  it('güçlü yükseliş → VI+ > VI- (son değer)', () => {
    const highs: number[] = [], lows: number[] = [], closes: number[] = [];
    let p = 100;
    for (let i = 0; i < 30; i++) { p += 2; highs.push(p + 1); lows.push(p - 1); closes.push(p); }
    const { viPlus, viMinus } = calculateVortex(highs, lows, closes, 14);
    const last = viPlus.length - 1;
    assert.ok(Number.isFinite(viPlus[last]!) && Number.isFinite(viMinus[last]!));
    assert.ok(viPlus[last]! > viMinus[last]!, 'yükselişte VI+ baskın olmalı');
  });

  it('güçlü düşüş → VI- > VI+ (son değer)', () => {
    const highs: number[] = [], lows: number[] = [], closes: number[] = [];
    let p = 200;
    for (let i = 0; i < 30; i++) { p -= 2; highs.push(p + 1); lows.push(p - 1); closes.push(p); }
    const { viPlus, viMinus } = calculateVortex(highs, lows, closes, 14);
    const last = viPlus.length - 1;
    assert.ok(viMinus[last]! > viPlus[last]!, 'düşüşte VI- baskın olmalı');
  });

  it('ilk `period` eleman NaN (yeterli veri yok)', () => {
    const arr = Array.from({ length: 20 }, (_, i) => 100 + i);
    const { viPlus } = calculateVortex(arr.map((x) => x + 1), arr.map((x) => x - 1), arr, 14);
    assert.ok(Number.isNaN(viPlus[5]!));
    assert.ok(Number.isFinite(viPlus[19]!));
  });
});

describe('detectVortexCross', () => {
  it('düşüşten yükselişe dönüş → bullish Vortex Kesişimi (yukari)', () => {
    const candles: OHLCVCandle[] = [];
    let p = 240;
    for (let i = 0; i < 16; i++) { p -= 4; candles.push(candle(i, p, p + 2, p - 2, p)); }  // düşüş → VI- baskın
    for (let i = 0; i < 14; i++) { p += 5; candles.push(candle(16 + i, p, p + 2, p - 2, p)); } // sert/uzun yükseliş → VI+ keser
    const sig = detectVortexCross('TEST', candles);
    assert.ok(sig, 'kesişim sinyali üretilmeli');
    assert.equal(sig!.type, 'Vortex Kesişimi');
    assert.equal(sig!.direction, 'yukari');
  });

  it('yetersiz mum → null', () => {
    const candles = Array.from({ length: 10 }, (_, i) => candle(i, 100, 101, 99, 100));
    assert.equal(detectVortexCross('TEST', candles), null);
  });

  it('düz piyasa → kesişim yok (null)', () => {
    const candles = Array.from({ length: 30 }, (_, i) => candle(i, 100, 100.5, 99.5, 100));
    assert.equal(detectVortexCross('TEST', candles), null);
  });
});
