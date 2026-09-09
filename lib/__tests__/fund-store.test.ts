/**
 * Fon kalıcı depolama / artımlı backfill — birim testleri
 * (FON-BACKFILL-PLAN FAZ 3-3 doğrulaması).
 *
 * Bu dosya darboğazın çözümünü kilitler: "elinde olan tarihi TEKRAR ÇEKME".
 * Eski `fetchRawWindow` her koşuda son N iş gününü baştan istiyordu; 429 yiyip
 * hiç derine inemiyordu. Buradaki testler o davranışın geri gelmesini engeller.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  businessDaysBack, pickMissingDays, isDayComplete, categoryStale,
  CATEGORY_TTL_DAYS,
} from '../fund-store';

describe('businessDaysBack', () => {
  it('hafta sonlarını atlar', () => {
    // 2026-09-09 Çarşamba
    const d = businessDaysBack(5, new Date('2026-09-09T12:00:00Z'));
    assert.deepEqual(d, ['2026-09-09', '2026-09-08', '2026-09-07', '2026-09-04', '2026-09-03']);
  });

  it('EN YENİDEN eskiye sıralı döner (güncel veri önceliği)', () => {
    const d = businessDaysBack(3, new Date('2026-09-09T12:00:00Z'));
    assert.ok(d[0]! > d[1]! && d[1]! > d[2]!);
  });

  it('cumartesiden başlarsa ilk iş gününe düşer', () => {
    const d = businessDaysBack(1, new Date('2026-09-12T12:00:00Z')); // Cumartesi
    assert.equal(d[0], '2026-09-11');
  });
});

describe('pickMissingDays — darboğazın çözümü', () => {
  const target = ['2026-09-09', '2026-09-08', '2026-09-07', '2026-09-04', '2026-09-03'];

  it('ELİNDE OLAN tarihleri İSTEMEZ (regresyon: eski kod hepsini tekrar çekiyordu)', () => {
    const covered = new Set(['2026-09-08', '2026-09-04']);
    assert.deepEqual(pickMissingDays(target, covered, 99), ['2026-09-09', '2026-09-07', '2026-09-03']);
  });

  it('hepsi elde ise HİÇBİR istek üretmez', () => {
    assert.deepEqual(pickMissingDays(target, new Set(target), 99), []);
  });

  it('bütçe sınırını aşmaz ve en yeniden başlar', () => {
    assert.deepEqual(pickMissingDays(target, new Set(), 2), ['2026-09-09', '2026-09-08']);
  });

  it('⚠️ REGRESYON: yakın zamanda BOŞ kaydedilen gün atlanır', () => {
    // TEFAS bugünün fiyatlarını akşam yayımlıyor. Bugünün tarihi her koşuda
    // yeniden denenip ~50 sn bütçe yakıyordu (canlıda ölçüldü, 2026-09-09).
    const bosGunler = new Set(['2026-09-09']);
    assert.deepEqual(
      pickMissingDays(target, new Set(), 99, bosGunler),
      ['2026-09-08', '2026-09-07', '2026-09-04', '2026-09-03'],
    );
  });

  it('atlanan gün bütçeden de düşmez (yerine sıradaki alınır)', () => {
    const r = pickMissingDays(target, new Set(), 2, new Set(['2026-09-09']));
    assert.deepEqual(r, ['2026-09-08', '2026-09-07']);
  });

  it('bütçe 0 veya negatifse boş döner', () => {
    assert.deepEqual(pickMissingDays(target, new Set(), 0), []);
    assert.deepEqual(pickMissingDays(target, new Set(), -3), []);
  });
});

describe('isDayComplete — kısmi tarih tuzağı', () => {
  it('dataQuality tam + referans yok → tam sayılır (ilk günler)', () => {
    assert.equal(isDayComplete(2034, 'tam', null), true);
  });

  it('KISMİ çekim asla tam sayılmaz (429 sayfalama ortasında kesti)', () => {
    assert.equal(isDayComplete(1200, 'kısmi', 2000), false);
    assert.equal(isDayComplete(2034, 'kısmi', null), false);
  });

  it('boş gün tam değildir (tatil mi 429 mu ayırt edilemez → tekrar denenir)', () => {
    assert.equal(isDayComplete(0, 'yok', 2000), false);
    assert.equal(isDayComplete(0, 'tam', 2000), false);
  });

  it('satır sayısı referansın %80inin altındaysa tam sayılmaz', () => {
    assert.equal(isDayComplete(1500, 'tam', 2000), false); // %75
    assert.equal(isDayComplete(1650, 'tam', 2000), true);  // %82,5
  });
});

describe('categoryStale — kategori vergisi', () => {
  const now = new Date('2026-09-09T12:00:00Z');

  it('hiç kategori alınmamışsa taze değildir', () => {
    assert.equal(categoryStale(null, now), true);
    assert.equal(categoryStale(undefined, now), true);
  });

  it(`${CATEGORY_TTL_DAYS} günden yeniyse ÇEKİLMEZ (koşu başına ~120 sn tasarruf)`, () => {
    assert.equal(categoryStale('2026-09-08T12:00:00Z', now), false);
    assert.equal(categoryStale('2026-09-04T12:00:00Z', now), false);
  });

  it('TTL dolduysa tazelenir', () => {
    assert.equal(categoryStale('2026-08-20T12:00:00Z', now), true);
  });
});
