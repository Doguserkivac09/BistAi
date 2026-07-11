/**
 * İndikatör matematiği testleri (lib/indicators.ts).
 * Çalıştır: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateEMA,
  calculateSMA,
  calculateRSI,
  calculateBollingerBands,
  calculateMACD,
} from '../indicators';

describe('calculateSMA', () => {
  it('period penceresinin ortalamasını verir', () => {
    const sma = calculateSMA([1, 2, 3, 4, 5], 3);
    // ilk 2 ham, sonra ortalama
    assert.equal(sma[2], 2); // (1+2+3)/3
    assert.equal(sma[3], 3); // (2+3+4)/3
    assert.equal(sma[4], 4); // (3+4+5)/3
  });
});

describe('calculateEMA', () => {
  it('sabit seride sabit kalır', () => {
    const ema = calculateEMA([5, 5, 5, 5, 5], 3);
    assert.equal(ema[ema.length - 1], 5);
  });
  it('yükselen seride son EMA < son fiyat (gecikme)', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8];
    const ema = calculateEMA(vals, 3);
    assert.ok(ema[ema.length - 1]! < 8);
    assert.ok(ema[ema.length - 1]! > 5);
  });
});

describe('calculateRSI', () => {
  it('sürekli yükseliş → RSI 100', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const rsi = calculateRSI(closes, 14);
    assert.equal(rsi[rsi.length - 1], 100);
  });
  it('ilk period 50 ile doldurulur', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const rsi = calculateRSI(closes, 14);
    assert.equal(rsi[0], 50);
    assert.equal(rsi[13], 50);
  });
});

describe('calculateBollingerBands', () => {
  it('upper ≥ middle ≥ lower', () => {
    const closes = [10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20, 19, 21];
    const bb = calculateBollingerBands(closes, 20);
    const i = closes.length - 1;
    assert.ok(bb.upper[i]! >= bb.middle[i]!);
    assert.ok(bb.middle[i]! >= bb.lower[i]!);
  });
  it('sabit seride bantlar orta çizgiye eşit (σ=0)', () => {
    const closes = Array.from({ length: 25 }, () => 10);
    const bb = calculateBollingerBands(closes, 20);
    const i = closes.length - 1;
    assert.equal(bb.upper[i], 10);
    assert.equal(bb.lower[i], 10);
  });
});

describe('calculateMACD', () => {
  it('macd/signal/histogram aynı uzunlukta', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const { macd, signal, histogram } = calculateMACD(closes);
    assert.equal(macd.length, closes.length);
    assert.equal(signal.length, closes.length);
    assert.equal(histogram.length, closes.length);
  });
  it('histogram = macd - signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
    const { macd, signal, histogram } = calculateMACD(closes);
    const i = closes.length - 1;
    assert.ok(Math.abs(histogram[i]! - (macd[i]! - signal[i]!)) < 1e-9);
  });
  it('istikrarlı yükselişte macd pozitif (hızlı EMA > yavaş EMA)', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const { macd } = calculateMACD(closes);
    assert.ok(macd[macd.length - 1]! > 0);
  });
});
