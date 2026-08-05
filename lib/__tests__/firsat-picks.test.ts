/**
 * Fırsat Sicili — birim testleri.
 * Bu dosya ürünün EN HASSAS iddiasını korur: sicil rakamları kendi lehimize
 * eğilemez. Yön düzeltmesi, komisyon, minimum örneklem ve benchmark kuralları
 * burada kilitlenir.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  netReturn, computeHorizonStats, computeTrackRecord, weekStartOf,
  MIN_SAMPLE, COMMISSION_PCT, type FirsatPickRow,
} from '../firsat-picks';

const pick = (over: Partial<FirsatPickRow> = {}): FirsatPickRow => ({
  sembol: 'TEST', week_start: '2026-08-03', tier: 'onayli', direction: 'yukari', score: 70,
  ret_1w: null, bist_ret_1w: null, ret_2w: null, bist_ret_2w: null, ret_4w: null, bist_ret_4w: null,
  ...over,
});

/** n adet pick üret (örneklem eşiğini aşmak için) */
const many = (n: number, over: Partial<FirsatPickRow> = {}) =>
  Array.from({ length: n }, (_, i) => pick({ sembol: `T${i}`, ...over }));

describe('netReturn — yön düzeltmesi + komisyon', () => {
  it('uzun kurulumda ham getiriden komisyon düşülür', () => {
    assert.equal(netReturn(5, 'yukari'), 5 - COMMISSION_PCT);
  });

  it('KISA kurulumda fiyat düşüşü KAZANÇTIR (işaret çevrilir)', () => {
    // -%8 fiyat hareketi, short kurulum → +%8 brüt, komisyon sonrası +%7,6
    assert.equal(netReturn(-8, 'asagi'), 8 - COMMISSION_PCT);
    // Ham getiriyi kullansaydık short'lar sistematik kaybeden görünürdü:
    assert.ok(netReturn(-8, 'asagi') > 0);
  });

  it('komisyon kazananı kaybedene çevirebilir (eşik gerçekçi)', () => {
    assert.ok(netReturn(0.2, 'yukari') < 0);
  });
});

describe('computeHorizonStats — örneklem ve oranlar', () => {
  it(`örneklem ${MIN_SAMPLE} altındaysa oran YAYINLANMAZ (uydurma güven yok)`, () => {
    const rows = many(MIN_SAMPLE - 1, { ret_1w: 10 });
    const s = computeHorizonStats(rows, '1w');
    assert.equal(s.n, MIN_SAMPLE - 1);
    assert.equal(s.winRate, null, '"n=4 ile %100" gibi bir sayı üretilmemeli');
    assert.equal(s.avgNet, null);
  });

  it('örneklem yeterliyse isabet ve ortalama net getiri hesaplanır', () => {
    const rows = [...many(3, { ret_1w: 10 }), ...many(2, { ret_1w: -6 })];
    const s = computeHorizonStats(rows, '1w');
    assert.equal(s.n, 5);
    assert.equal(s.winRate, 60);              // 3/5
    assert.equal(s.avgNet, Math.round(((3 * 9.6 + 2 * -6.4) / 5) * 10) / 10);
  });

  it('değerlendirilmemiş (null) pick istatistiğe GİRMEZ', () => {
    const rows = [...many(5, { ret_1w: 10 }), ...many(20, { ret_1w: null })];
    assert.equal(computeHorizonStats(rows, '1w').n, 5);
  });

  it('BIST karşılaştırması yalnız benchmark verisi olanlardan; yoksa null', () => {
    const noBench = computeHorizonStats(many(6, { ret_1w: 10 }), '1w');
    assert.equal(noBench.beatRate, null);
    assert.equal(noBench.avgExcess, null);
    assert.ok(noBench.winRate !== null, 'benchmark yokluğu isabet oranını engellemez');

    const withBench = computeHorizonStats(many(6, { ret_1w: 10, bist_ret_1w: 4 }), '1w');
    assert.equal(withBench.beatRate, 100);    // net %9,6 > BIST %4
    assert.equal(withBench.avgExcess, 5.6);
  });

  it('KISA kurulumda benchmark da ters çevrilir (düşen piyasada short BIST\'i geçer)', () => {
    // Piyasa %6 düştü, short kurulum %10 kazandırdı → aleyhte kıyas yapılmamalı
    const s = computeHorizonStats(many(6, { direction: 'asagi', ret_1w: -10, bist_ret_1w: -6 }), '1w');
    assert.equal(s.avgNet, 9.6);
    assert.equal(s.avgBist, 6);
    assert.equal(s.beatRate, 100);
  });

  it('her ufuk bağımsız ölçülür', () => {
    const rows = many(6, { ret_1w: 3, ret_4w: 12 });
    assert.equal(computeHorizonStats(rows, '1w').avgNet, 2.6);
    assert.equal(computeHorizonStats(rows, '4w').avgNet, 11.6);
    assert.equal(computeHorizonStats(rows, '2w').n, 0);
  });
});

describe('computeTrackRecord — katman kapsamı', () => {
  it('tier verilirse yalnız o katman ölçülür (yüzeyle sicil AYNI kapsamda olmalı)', () => {
    const rows = [
      ...many(6, { tier: 'onayli', ret_1w: 10 }),
      ...many(6, { tier: 'teknik', ret_1w: -10 }),
    ];
    const onayli = computeTrackRecord(rows, 'onayli');
    assert.equal(onayli.totalPicks, 6);
    assert.equal(onayli.horizons.find((h) => h.horizon === '1w')!.winRate, 100);

    const tumu = computeTrackRecord(rows);
    assert.equal(tumu.totalPicks, 12);
    assert.equal(tumu.horizons.find((h) => h.horizon === '1w')!.winRate, 50);
  });

  it('bekleyen (hiç ufku dolmamış) pick sayısı raporlanır', () => {
    const rows = [...many(3, { ret_1w: 5 }), ...many(4)];
    const rec = computeTrackRecord(rows);
    assert.equal(rec.totalPicks, 7);
    assert.equal(rec.pendingPicks, 4);
  });

  it('boş sicil çökmez, sıfır iddia eder', () => {
    const rec = computeTrackRecord([]);
    assert.equal(rec.totalPicks, 0);
    assert.equal(rec.firstWeek, null);
    assert.ok(rec.horizons.every((h) => h.winRate === null && h.n === 0));
  });
});

describe('weekStartOf — hafta başlangıcı (Pazartesi, UTC)', () => {
  it('hafta içi, Pazartesi ve Pazar doğru Pazartesi\'ye çözülür', () => {
    assert.equal(weekStartOf(new Date('2026-08-05T12:00:00Z')), '2026-08-03'); // Çarşamba
    assert.equal(weekStartOf(new Date('2026-08-03T06:00:00Z')), '2026-08-03'); // Pazartesi
    assert.equal(weekStartOf(new Date('2026-08-09T22:00:00Z')), '2026-08-03'); // Pazar
  });
});
