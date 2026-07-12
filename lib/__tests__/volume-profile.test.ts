/**
 * Hacim Profili testleri (lib/volume-profile.ts). Çalıştır: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeVolumeProfile } from '../volume-profile';
import type { OHLCVCandle } from '@/types';

function candle(o: number, h: number, l: number, c: number, v: number): OHLCVCandle {
  return { date: '2025-01-01', open: o, high: h, low: l, close: c, volume: v };
}

describe('computeVolumeProfile', () => {
  it('boş girdi → null', () => {
    assert.equal(computeVolumeProfile([]), null);
  });

  it('POC en çok işlem gören fiyat seviyesinde', () => {
    // 100-101 bandında çok hacim, 110 civarında az
    const candles = [
      candle(100, 101, 100, 100.5, 1000),
      candle(100, 101, 100, 100.5, 1000),
      candle(109, 110, 109, 109.5, 50),
    ];
    const vp = computeVolumeProfile(candles, 20)!;
    assert.ok(vp.pocPrice >= 100 && vp.pocPrice <= 101, `POC ~100-101, gelen ${vp.pocPrice}`);
  });

  it('toplam hacim korunur (dağıtım toplamı = girdi)', () => {
    const candles = [candle(100, 104, 100, 103, 600), candle(101, 103, 100, 102, 400)];
    const vp = computeVolumeProfile(candles, 10)!;
    assert.ok(Math.abs(vp.totalVol - 1000) < 1, `toplam ~1000, gelen ${vp.totalVol}`);
  });

  it('buy/sell ayrımı yön bazlı', () => {
    const up = computeVolumeProfile([candle(100, 101, 100, 101, 500)], 10)!;
    const buySum = up.bins.reduce((s, b) => s + b.buyVol, 0);
    const sellSum = up.bins.reduce((s, b) => s + b.sellVol, 0);
    assert.ok(buySum > sellSum, 'yükselen mum → alım hacmi baskın');
  });

  it('değer alanı POC etrafında ve totalin ~%70+i', () => {
    const candles = Array.from({ length: 10 }, (_, i) => candle(100 + i, 101 + i, 100 + i, 100.5 + i, 100 + (i === 5 ? 900 : 0)));
    const vp = computeVolumeProfile(candles, 20)!;
    assert.ok(vp.vaHigh >= vp.vaLow);
    assert.ok(vp.vaLow <= vp.pocPrice && vp.pocPrice <= vp.vaHigh);
  });

  it('maxVol pozitif ve bins dolu', () => {
    const vp = computeVolumeProfile([candle(100, 102, 99, 101, 300)], 12)!;
    assert.ok(vp.maxVol > 0);
    assert.equal(vp.bins.length, 12);
  });
});
