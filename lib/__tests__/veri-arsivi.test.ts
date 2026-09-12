/**
 * Veri arşivi — birim testleri. Çalıştır: npm test
 *
 * Arşivin tek işi: "aynı içerik ikinci kez satır açmasın, değişen içerik açsın".
 * Bu bozulursa arşiv ya sahte revizyonla dolar ya da gerçek revizyonu kaçırır —
 * ikisi de point-in-time iddiasını çürütür. O yüzden teste kilitleniyor.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { kanonikJson, icerikHash, yahooArsivIcerigi, FIYAT_TUREVI_ALANLAR, arsivle, bayatlikSirasi } from '../veri-arsivi';

describe('kanonikJson / icerikHash', () => {
  it('alan sırası hash-i DEĞİŞTİRMEZ (yoksa her koşu sahte revizyon yazar)', () => {
    const a = { revenue: 100, netIncome: 5, equity: null };
    const b = { equity: null, netIncome: 5, revenue: 100 };
    assert.equal(icerikHash(a), icerikHash(b));
  });

  it('değer değişince hash DEĞİŞİR (gerçek revizyon yakalanmalı)', () => {
    assert.notEqual(icerikHash({ revenue: 100 }), icerikHash({ revenue: 101 }));
  });

  it('null ile eksik alanı ayırt eder', () => {
    assert.notEqual(icerikHash({ a: null }), icerikHash({}));
  });

  it('iç içe nesne ve dizide de kararlıdır', () => {
    assert.equal(kanonikJson({ x: [1, { b: 2, a: 1 }] }), '{"x":[1,{"a":1,"b":2}]}');
  });
});

describe('yahooArsivIcerigi', () => {
  const ham = {
    sector: 'Bankacılık', eps: 12.5, returnOnEquity: 0.31,
    // fiyat türevi — arşive GİRMEMELİ
    marketCap: 1_000_000, peRatio: 4.2, currentPrice: 138.4, week52High: 150, priceToBook: 1.1,
    movingAverage50: 130, movingAverage200: 120, week52Low: 90, reportedDate: '2026-09-12',
  };

  it('fiyat türevi alanları arşive ALMAZ (her gün değişip hash-i bozar)', () => {
    const icerik = yahooArsivIcerigi(ham);
    for (const alan of FIYAT_TUREVI_ALANLAR) {
      assert.equal(Object.hasOwn(icerik, alan), false, `${alan} arşive girmemeliydi`);
    }
  });

  it('yavaş değişen temel alanları ALIR', () => {
    const icerik = yahooArsivIcerigi(ham);
    assert.equal(icerik.sector, 'Bankacılık');
    assert.equal(icerik.eps, 12.5);
    assert.equal(icerik.returnOnEquity, 0.31);
  });

  it('yalnız fiyat değişince hash AYNI kalır (sahte revizyon yok)', () => {
    const bugun = yahooArsivIcerigi(ham);
    const yarin = yahooArsivIcerigi({ ...ham, marketCap: 1_200_000, currentPrice: 145.0, peRatio: 4.6 });
    assert.equal(icerikHash(bugun), icerikHash(yarin));
  });

  it('temel alan revize edilince hash DEĞİŞİR', () => {
    const once = yahooArsivIcerigi(ham);
    const sonra = yahooArsivIcerigi({ ...ham, returnOnEquity: 0.28 });
    assert.notEqual(icerikHash(once), icerikHash(sonra));
  });
});

describe('arsivle', () => {
  const kayit = (hash: string) => ({
    kaynak: 'yahoo-temel' as const, sembol: 'GARAN', anahtar: 'ozet',
    icerik: { a: 1 }, icerik_hash: hash,
  });

  it('dryRun yazmaz, ne olacağını raporlar', async () => {
    const r = await arsivle(null, [kayit('h1')], { dryRun: true });
    assert.equal(r.yeni, 1);
    assert.equal(r.degismeyen, 0);
  });

  it('içerik zaten varsa YENİ satır açmaz, görülmeyi günceller', async () => {
    const guncellenen: Array<Record<string, unknown>> = [];
    const eklenen: unknown[] = [];
    const sb = {
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [{ id: 7, kaynak: 'yahoo-temel', sembol: 'GARAN', anahtar: 'ozet', icerik_hash: 'h1', gorulme_sayisi: 3 }],
            error: null,
          }),
        }),
        insert: async (rows: unknown) => { eklenen.push(rows); return { error: null }; },
        update: (patch: Record<string, unknown>) => ({ eq: async () => { guncellenen.push(patch); return { error: null }; } }),
      }),
    };
    const r = await arsivle(sb as unknown as Parameters<typeof arsivle>[0], [kayit('h1')]);
    assert.equal(r.yeni, 0);
    assert.equal(r.degismeyen, 1);
    assert.equal(eklenen.length, 0);
    assert.equal(guncellenen[0]?.gorulme_sayisi, 4);
  });

  it('bütçe kesilse de hiçbir sembol kalıcı olarak atlanmaz (bayatlık sırası)', async () => {
    // C hiç görülmemiş, A dün, B bugün → sıra: C, A, B
    const sb = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: async () => ({
              data: [
                { sembol: 'B', son_gorulme: '2026-09-12T10:00:00Z' },
                { sembol: 'A', son_gorulme: '2026-09-11T10:00:00Z' },
                { sembol: 'B', son_gorulme: '2026-09-10T10:00:00Z' },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };
    const sira = await bayatlikSirasi(sb as unknown as Parameters<typeof bayatlikSirasi>[0], ['A', 'B', 'C']);
    assert.deepEqual(sira, ['C', 'A', 'B']);
  });

  it('içerik değiştiyse YENİ satır açar (revizyon)', async () => {
    const eklenen: unknown[] = [];
    const sb = {
      from: () => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
        insert: async (rows: unknown) => { eklenen.push(rows); return { error: null }; },
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const r = await arsivle(sb as unknown as Parameters<typeof arsivle>[0], [kayit('h2')]);
    assert.equal(r.yeni, 1);
    assert.equal(eklenen.length, 1);
  });
});
