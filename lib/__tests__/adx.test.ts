/**
 * ADX / DMI — birim testleri.
 *
 * ⚠️ EN KRİTİK TEST: **ADX YÖNSÜZDÜR.** Yüksek ADX "yükseliş" demek değildir;
 * yalnız trendin GÜÇLÜ olduğunu söyler. Aynı şiddetteki düşüş trendi de aynı
 * ADX'i üretir. Bu karışırsa "ADX yüksek → al" gibi tamamen yanlış bir kural
 * doğar. Test bunu kalıcı olarak engelliyor.
 *
 * İkinci kritik nokta: Wilder yumuşatması SMA değildir. SMA kullanmak
 * TradingView/Matriks ile sapma yaratır — kullanıcı ekranda başka sayı görür.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateADX } from '../indicators';

/** Doğrusal trend üretir: her mumda `adim` kadar hareket, sabit aralık. */
function trend(n: number, baslangic: number, adim: number, aralik = 1) {
  const highs: number[] = [], lows: number[] = [], closes: number[] = [];
  let p = baslangic;
  for (let i = 0; i < n; i++) {
    closes.push(p);
    highs.push(p + aralik);
    lows.push(p - aralik);
    p += adim;
  }
  return { highs, lows, closes };
}

/** Yatay testere: yön yok, sadece gürültü. */
function testere(n: number, taban = 100, genlik = 1) {
  const highs: number[] = [], lows: number[] = [], closes: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = taban + (i % 2 === 0 ? genlik : -genlik);
    closes.push(p);
    highs.push(p + 0.5);
    lows.push(p - 0.5);
  }
  return { highs, lows, closes };
}

const son = (a: number[]) => a[a.length - 1]!;

describe('calculateADX — yön ayrımı', () => {
  it('güçlü YÜKSELİŞ → +DI > −DI', () => {
    const { highs, lows, closes } = trend(80, 100, 1.5);
    const r = calculateADX(highs, lows, closes);
    assert.ok(son(r.plusDi) > son(r.minusDi), `+DI ${son(r.plusDi)} > −DI ${son(r.minusDi)} olmalı`);
  });

  it('güçlü DÜŞÜŞ → −DI > +DI', () => {
    const { highs, lows, closes } = trend(80, 200, -1.5);
    const r = calculateADX(highs, lows, closes);
    assert.ok(son(r.minusDi) > son(r.plusDi), `−DI ${son(r.minusDi)} > +DI ${son(r.plusDi)} olmalı`);
  });

  it('⚠️ ADX YÖNSÜZ: aynı şiddetteki yükseliş ve düşüş BENZER ADX üretir', () => {
    const yukari = calculateADX(...Object.values(trend(80, 100, 1.5)) as [number[], number[], number[]]);
    const asagi = calculateADX(...Object.values(trend(80, 200, -1.5)) as [number[], number[], number[]]);
    const fark = Math.abs(son(yukari.adx) - son(asagi.adx));
    assert.ok(fark < 5, `ADX yönden bağımsız olmalı; fark ${fark.toFixed(1)} (yukarı ${son(yukari.adx).toFixed(1)}, aşağı ${son(asagi.adx).toFixed(1)})`);
  });
});

describe('calculateADX — trend gücü', () => {
  it('trendli seride ADX yüksek, yatay seride DÜŞÜK', () => {
    const trendli = calculateADX(...Object.values(trend(80, 100, 1.5)) as [number[], number[], number[]]);
    const yatay = calculateADX(...Object.values(testere(80)) as [number[], number[], number[]]);
    assert.ok(son(trendli.adx) > son(yatay.adx),
      `trendli ${son(trendli.adx).toFixed(1)} > yatay ${son(yatay.adx).toFixed(1)} olmalı`);
  });

  it('ADX 0-100 aralığında kalır', () => {
    const r = calculateADX(...Object.values(trend(120, 50, 0.8)) as [number[], number[], number[]]);
    for (const v of r.adx) {
      if (Number.isFinite(v)) assert.ok(v >= 0 && v <= 100, `ADX aralık dışı: ${v}`);
    }
  });

  it('+DI ve −DI 0-100 aralığında kalır', () => {
    const r = calculateADX(...Object.values(testere(100)) as [number[], number[], number[]]);
    for (const v of [...r.plusDi, ...r.minusDi]) {
      if (Number.isFinite(v)) assert.ok(v >= 0 && v <= 100, `DI aralık dışı: ${v}`);
    }
  });
});

describe('calculateADX — warmup ve yetersiz veri', () => {
  it('ilk `period` eleman DI için NaN', () => {
    const r = calculateADX(...Object.values(trend(60, 100, 1)) as [number[], number[], number[]], 14);
    for (let i = 0; i < 14; i++) assert.ok(Number.isNaN(r.plusDi[i]), `index ${i} NaN olmalı`);
    assert.ok(Number.isFinite(r.plusDi[14]), 'index 14 dolu olmalı');
  });

  it('ADX `2*period-1`den itibaren dolu — daha erken ÜRETİLMEZ', () => {
    const r = calculateADX(...Object.values(trend(60, 100, 1)) as [number[], number[], number[]], 14);
    for (let i = 0; i < 27; i++) assert.ok(Number.isNaN(r.adx[i]), `index ${i} NaN olmalı`);
    assert.ok(Number.isFinite(r.adx[27]), 'index 27 (2*14-1) dolu olmalı');
  });

  it('⚠️ yetersiz veri → hepsi NaN, uydurma YOK', () => {
    const r = calculateADX([1, 2, 3], [0, 1, 2], [1, 2, 3], 14);
    assert.ok(r.adx.every((v) => Number.isNaN(v)));
    assert.ok(r.plusDi.every((v) => Number.isNaN(v)));
  });

  it('boş girdi çökmez', () => {
    const r = calculateADX([], [], []);
    assert.deepEqual(r.adx, []);
  });
});

describe('calculateADX — Wilder yumuşatması (SMA DEĞİL)', () => {
  it('ADX kademeli değişir — ani sıçrama yapmaz', () => {
    const { highs, lows, closes } = trend(120, 100, 1.2);
    const r = calculateADX(highs, lows, closes);
    const dolu = r.adx.filter((v) => Number.isFinite(v));
    for (let i = 1; i < dolu.length; i++) {
      const d = Math.abs(dolu[i]! - dolu[i - 1]!);
      assert.ok(d < 15, `ardışık ADX farkı çok büyük (${d.toFixed(1)}) — yumuşatma bozuk olabilir`);
    }
  });

  it('trend tersine dönünce +DI/−DI yer değiştirir', () => {
    const yukari = trend(60, 100, 1.5);
    const asagi = trend(60, 190, -1.5);
    const highs = [...yukari.highs, ...asagi.highs];
    const lows = [...yukari.lows, ...asagi.lows];
    const closes = [...yukari.closes, ...asagi.closes];
    const r = calculateADX(highs, lows, closes);
    assert.ok(r.plusDi[55]! > r.minusDi[55]!, 'ilk yarıda +DI baskın');
    assert.ok(son(r.minusDi) > son(r.plusDi), 'ikinci yarıda −DI baskın');
  });
});
