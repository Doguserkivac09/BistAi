/**
 * Fon runner korumaları — birim testleri (FON-BACKFILL-PLAN FAZ 3-2).
 *
 * Bu üç koruma CANLI VERİDE yakalanmış hatalardan doğdu ama hiçbirinin testi
 * yoktu. Bu dosya onları regresyona kilitler:
 *   1) risk ölçülemiyorsa "risk-ayarlı skor" ÜRETİLMEZ (631 fonun tamamı 70 çıkmıştı)
 *   2) kötü koşu iyi store'u EZMEZ (store 631 → 0'a düşmüştü)
 *   3) mutlak bayrak = BAĞLAM, ayrıştırıcı bayrak = EMSALE GÖRELİ (kalibrasyon kuralı)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCompositeScore, selectPublished, buildFlags,
  MIN_PEER, type Measured,
} from '../fund-runner';
import { computeFlows } from '../fund-flows';

function m(over: Partial<Measured> = {}): Measured {
  return {
    code: 'AAA', name: 'Test Fonu', investors: 5000, size: 1e9, category: 1,
    nominal: 40, excess: 3, real: 6,
    volatility: 12, sharpe: 0.8, maxDrawdown: -5,
    observations: 200, asOf: '2026-09-09',
    flow: computeFlows([]),
    ...over,
  };
}

describe('computeCompositeScore — "risk yoksa skor yok"', () => {
  it('⚠️ REGRESYON: Sharpe null iken skor ÜRETİLMEZ', () => {
    // Canlıda (2026-09-09) pencere 11 gözlemdi, Sharpe null kaldı ve skor
    // yalnız `excess`ten türeyip 631 fonun TAMAMINDA 70 çıkıyordu.
    const s = computeCompositeScore(m({ sharpe: null, volatility: null }), { sharpe: 0.5, vol: 10 }, true);
    assert.equal(s, null);
  });

  it('⚠️ REGRESYON: kategori medyanı Sharpe null iken de skor üretilmez', () => {
    assert.equal(computeCompositeScore(m(), { sharpe: null, vol: 10 }, true), null);
  });

  it('emsal güvenilir değilse skor üretilmez (n < MIN_PEER)', () => {
    assert.equal(computeCompositeScore(m(), { sharpe: 0.5, vol: 10 }, false), null);
  });

  it('risk bileşeni varsa skor üretilir ve 0-100 aralığındadır', () => {
    const s = computeCompositeScore(m(), { sharpe: 0.5, vol: 10 }, true);
    assert.ok(s != null && s >= 0 && s <= 100);
  });

  it('emsalinden yüksek Sharpe daha yüksek skor verir', () => {
    const iyi = computeCompositeScore(m({ sharpe: 1.2 }), { sharpe: 0.6, vol: 12 }, true)!;
    const zayif = computeCompositeScore(m({ sharpe: 0.3 }), { sharpe: 0.6, vol: 12 }, true)!;
    assert.ok(iyi > zayif);
  });

  it('eksik volatilite bileşeninde ağırlık yeniden normalize edilir (0 sayılmaz)', () => {
    const s = computeCompositeScore(m({ volatility: null }), { sharpe: 0.8, vol: null }, true);
    assert.ok(s != null && s > 0, 'eksik bileşen skoru sıfıra çekmemeli');
  });
});

describe('selectPublished — kötü koşu iyi store\'u ezmesin', () => {
  const onceki = Array.from({ length: 600 }, (_, i) => ({ code: `F${i}` }));

  it('⚠️ REGRESYON: koşu yarıdan az ölçtüyse ÖNCEKİ yayınlanır', () => {
    // Canlıda kısmi çekimde yatırımcı sayısı boş geldi, evren eşiği herkesi
    // eledi ve store 631 → 0'a düştü.
    const r = selectPublished([], onceki);
    assert.equal(r.weak, true);
    assert.equal(r.items.length, 600);
  });

  it('sınırın hemen üstünde yayın YENİ ölçümdür', () => {
    const taze = onceki.slice(0, 400); // %66
    const r = selectPublished(taze, onceki);
    assert.equal(r.weak, false);
    assert.equal(r.items.length, 400);
  });

  it('ilk koşuda (önceki yok) yayın her zaman tazedir', () => {
    const r = selectPublished([{ code: 'A' }], null);
    assert.equal(r.weak, false);
    assert.equal(r.items.length, 1);
  });
});

describe('buildFlags — kalibrasyon kuralı', () => {
  it('mutlak bayraklar BAĞLAMDIR: emsal güvenilmese de gösterilir', () => {
    const f = buildFlags(m({ excess: -4, real: -2 }), null);
    const ids = f.map((x) => x.id);
    assert.ok(ids.includes('fon-fazla-neg'));
    assert.ok(ids.includes('fon-reel-neg'));
  });

  it('⚠️ emsal güvenilmezse AYRIŞTIRICI bayrak üretilmez (sektör iddia edilmez)', () => {
    const f = buildFlags(m({ sharpe: 3.0 }), null);
    assert.equal(f.some((x) => x.id.startsWith('fon-risk-ayarli')), false);
    assert.equal(f.some((x) => x.id === 'fon-dusuk-dalga'), false);
  });

  it('emsal güvenilirse ve belirgin ayrışma varsa göreli bayrak çıkar', () => {
    const f = buildFlags(m({ sharpe: 1.5 }), { sharpe: 0.6, vol: 20, n: MIN_PEER });
    assert.ok(f.some((x) => x.id === 'fon-risk-ayarli-iyi'));
  });

  it('emsalinin altında kalan fon uyarı alır', () => {
    const f = buildFlags(m({ sharpe: 0.2 }), { sharpe: 1.0, vol: 20, n: MIN_PEER });
    const zayif = f.find((x) => x.id === 'fon-risk-ayarli-zayif');
    assert.ok(zayif && zayif.tone === 'warn');
  });

  it('ölçülemeyen metrik için bayrak UYDURULMAZ', () => {
    const f = buildFlags(m({ excess: null, real: null, sharpe: null, volatility: null }), null);
    assert.deepEqual(f, []);
  });
});
