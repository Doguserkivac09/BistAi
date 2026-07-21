/**
 * VIOP baz (basis) + proxy türetme testleri (FAZ V0 — VIOP-TRADINGVIEW-PLAN.md)
 * Çalıştır: npm test
 *
 * Kapsam:
 *  - estimateBasis: contango (r>q), convergence (vade→0 baz=0), pozitif ölçek
 *  - deriveProxyFutures: tarihsel convergence (eski mum > yeni mum bazı), hacim korunur
 *  - deriveGramTryFromOns: ons-USD → gram-TL birim çevrimi, inner-join tarih hizası
 *  - getActiveViopContracts: iki aktif kontrat, çift-ay çevrimi, vade gelecekte
 *  - getAllActiveViopContracts: tüm varlık sınıfları (endeks/banka/emtia/döviz) düz liste
 *  - daysToExpiry işaret/mantık
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { estimateBasis, spotToFutures, basisRegime, deriveProxyFutures, deriveGramTryFromOns } from '../viop-basis';
import {
  getActiveViopContracts,
  getAllActiveViopContracts,
  daysToExpiry,
  lastBusinessDayOfMonth,
  VIOP_UNDERLYINGS,
  type ViopContract,
} from '../viop-symbols';
import type { OHLCVCandle } from '@/types';

describe('estimateBasis', () => {
  it('vade günü (dte<=0) bazı 0 döndürür (convergence)', () => {
    assert.equal(estimateBasis(10000, 0), 0);
    assert.equal(estimateBasis(10000, -5), 0);
  });

  it('r>q iken pozitif baz (contango) üretir', () => {
    const b = estimateBasis(10000, 90, 0.45, 0.03);
    assert.ok(b > 0, 'baz pozitif olmalı');
    // 10000 * (0.42) * (90/365) ≈ 1035
    assert.ok(Math.abs(b - 1035.6) < 5, `beklenen ~1035, gelen ${b}`);
  });

  it('vadeye kalan gün arttıkça baz büyür', () => {
    const near = estimateBasis(10000, 30);
    const far = estimateBasis(10000, 180);
    assert.ok(far > near);
  });

  it('geçersiz spot 0 döndürür', () => {
    assert.equal(estimateBasis(0, 90), 0);
    assert.equal(estimateBasis(-100, 90), 0);
  });
});

describe('spotToFutures / basisRegime', () => {
  it('spotToFutures = spot + baz', () => {
    const spot = 10000;
    const f = spotToFutures(spot, 90, 0.45, 0.03);
    assert.ok(f > spot);
    assert.equal(f, spot + estimateBasis(spot, 90, 0.45, 0.03));
  });

  it('basisRegime sınıflandırması', () => {
    assert.equal(basisRegime(50), 'contango');
    assert.equal(basisRegime(-50), 'backwardation');
    assert.equal(basisRegime(0), 'flat');
  });
});

// ── Fixture: sabit vade tarihli kontrat ──────────────────────────────────────
function fixtureContract(expiry: Date): ViopContract {
  return {
    code: 'F_XU030TEST',
    underlying: 'XU030',
    cls: 'endeks',
    label: 'XU030 Test',
    expiryMonth: expiry.getUTCMonth(),
    expiryYear: expiry.getUTCFullYear(),
    expiry,
    multiplier: 0.1,
    initialMarginRate: 0.1,
    maintenanceMarginRate: 0.075,
    tickSize: 0.25,
    settlement: 'nakdi',
  };
}

function candle(date: string, close: number): OHLCVCandle {
  return { date, open: close, high: close, low: close, close, volume: 1000 };
}

describe('deriveProxyFutures', () => {
  it('tarihsel convergence: erken mumun bazı, vadeye yakın mumdan büyük', () => {
    const expiry = new Date(Date.UTC(2026, 7, 31)); // 31 Ağu 2026
    const contract = fixtureContract(expiry);
    const spot: OHLCVCandle[] = [
      candle('2026-06-01', 10000), // vadeye ~91 gün
      candle('2026-08-25', 10000), // vadeye ~6 gün
    ];
    const proxy = deriveProxyFutures(spot, contract);
    const basisEarly = proxy.candles[0]!.close - spot[0]!.close;
    const basisLate = proxy.candles[1]!.close - spot[1]!.close;
    assert.ok(basisEarly > basisLate, 'erken mum bazı > geç mum bazı');
    assert.ok(basisLate >= 0);
    assert.equal(proxy.proxy, true);
  });

  it('hacim korunur (proxy spot hacmini taşır)', () => {
    const contract = fixtureContract(new Date(Date.UTC(2026, 7, 31)));
    const spot = [candle('2026-06-01', 10000)];
    const proxy = deriveProxyFutures(spot, contract);
    assert.equal(proxy.candles[0]!.volume, 1000);
  });

  it('contango bazında lastBasis pozitif ve regime contango', () => {
    const contract = fixtureContract(new Date(Date.UTC(2026, 7, 31)));
    const spot = [candle('2026-06-01', 10000)];
    const proxy = deriveProxyFutures(spot, contract);
    assert.ok(proxy.lastBasis > 0);
    assert.equal(proxy.regime, 'contango');
  });
});

describe('deriveGramTryFromOns', () => {
  it('birim çevrimi doğru: gramTRY = (onsUSD / 31.1034768) × usdtry', () => {
    const ons = [candle('2026-07-01', 3110.34768)]; // tam 100 ons-katı → gram hesabı temiz
    const fx = [candle('2026-07-01', 40)];
    const [out] = deriveGramTryFromOns(ons, fx);
    // 3110.34768 / 31.1034768 = 100 → 100 × 40 = 4000
    assert.ok(Math.abs(out!.close - 4000) < 0.01, `beklenen 4000, gelen ${out!.close}`);
  });

  it('tarihi kur serisinde olmayan ons mumu atlanır (inner join)', () => {
    const ons = [candle('2026-07-01', 2000), candle('2026-07-02', 2010)];
    const fx = [candle('2026-07-01', 40)]; // 07-02 yok
    const out = deriveGramTryFromOns(ons, fx);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.date, '2026-07-01');
  });

  it('boş kur serisi → boş sonuç (fabrikasyon yok)', () => {
    const ons = [candle('2026-07-01', 2000)];
    assert.equal(deriveGramTryFromOns(ons, []).length, 0);
  });
});

describe('getActiveViopContracts — vade çevrimi (sınıfa göre)', () => {
  const now = new Date(Date.UTC(2026, 6, 11)); // 11 Tem 2026 (TEK ay)

  it('endeks çift-ay çevrimi: Temmuz atlanır, Ağustos/Ekim/Aralık gelir', () => {
    const active = getActiveViopContracts(now, 'XU030', 3);
    assert.equal(active.length, 3);
    assert.deepEqual(active.map((c) => c.expiryMonth), [7, 9, 11]); // Ağu/Eki/Ara
    for (const c of active) assert.equal(c.expiryMonth % 2, 1, 'çift-ay çevrimi (0-index tek)');
  });

  it('pay (banka) YILIN TÜM AYLARI: yakın vade içinde bulunulan ay (Temmuz)', () => {
    const active = getActiveViopContracts(now, 'GARAN', 3);
    assert.deepEqual(active.map((c) => c.expiryMonth), [6, 7, 8]); // Tem/Ağu/Eyl
  });

  it('döviz her-ay çevrimi: yakın vade Temmuz', () => {
    const active = getActiveViopContracts(now, 'USDTRY', 2);
    assert.deepEqual(active.map((c) => c.expiryMonth), [6, 7]);
  });

  it('yanlış çevrim regresyonu: pay yakın vadesi endeksinkinden ÖNCE gelir', () => {
    // Çift-ay çevrimi tüm sınıflara uygulanırsa GARAN da Ağustos olurdu (dte ~4x fazla)
    const [pay] = getActiveViopContracts(now, 'GARAN', 1);
    const [endeks] = getActiveViopContracts(now, 'XU030', 1);
    assert.ok(pay!.expiry.getTime() < endeks!.expiry.getTime());
  });

  it('yakın kontrat vadesi bugünden sonra', () => {
    assert.ok(getActiveViopContracts(now, 'XU030', 1)[0]!.expiry.getTime() >= now.getTime());
  });

  it('çoklu vade sıralı (yakın < sonraki)', () => {
    const [near, next] = getActiveViopContracts(now, 'XU030', 2);
    assert.ok(near!.expiry.getTime() < next!.expiry.getTime());
  });

  it('ayın son gününde o ayın vadesi hâlâ aktif sayılır (vade günü dahil)', () => {
    const lastDay = new Date(Date.UTC(2026, 6, 31)); // 31 Tem 2026 = Cuma
    const [near] = getActiveViopContracts(lastDay, 'GARAN', 1);
    assert.equal(near!.expiryMonth, 6, 'vade günü henüz geçmedi');
  });
});

describe('getAllActiveViopContracts', () => {
  const now = new Date(Date.UTC(2026, 6, 11));

  it('tüm varlık sınıfları temsil edilir', () => {
    const classes = new Set(getAllActiveViopContracts(now).map((c) => c.cls));
    assert.ok(classes.has('endeks') && classes.has('banka') && classes.has('emtia') && classes.has('doviz'));
  });

  it('dayanak başına TEK (yakın) kontrat üretir — vade tekrarı yok', () => {
    const all = getAllActiveViopContracts(now);
    assert.equal(all.length, Object.keys(VIOP_UNDERLYINGS).length);
    assert.equal(new Set(all.map((c) => c.underlying)).size, all.length);
  });

  it('her kontratın cls/multiplier/settlement alanı dayanak tanımıyla eşleşir', () => {
    for (const c of getAllActiveViopContracts(now)) {
      const def = VIOP_UNDERLYINGS[c.underlying];
      assert.equal(c.cls, def.cls);
      assert.equal(c.multiplier, def.multiplier);
      assert.equal(c.settlement, def.settlement);
    }
  });
});

describe('sözleşme spesifikasyonları (regresyon koruması)', () => {
  it('endeks çarpanı 0,1 — notional = ham endeks × 0,1 (endeks/1000 × 100 adet)', () => {
    // Regresyon: çarpan 10 iken notional 100 kat şişikti (15.914 → 159.142 ₺, gerçek ~1.591 ₺)
    assert.equal(VIOP_UNDERLYINGS.XU030.multiplier, 0.1);
    assert.equal(15914.21 * VIOP_UNDERLYINGS.XU030.multiplier, 1591.421);
  });

  it('pay sözleşmesi 100 adet pay ve FİZİKİ teslimatlı', () => {
    assert.equal(VIOP_UNDERLYINGS.GARAN.multiplier, 100);
    assert.equal(VIOP_UNDERLYINGS.GARAN.settlement, 'fiziki');
  });

  it('döviz sözleşmesi 1.000 birim ve nakdi uzlaşmalı', () => {
    assert.equal(VIOP_UNDERLYINGS.USDTRY.multiplier, 1000);
    assert.equal(VIOP_UNDERLYINGS.USDTRY.settlement, 'nakdi');
  });

  it('emtia 1 gram (gram-TL kotasyon)', () => {
    assert.equal(VIOP_UNDERLYINGS.ALTIN.multiplier, 1);
  });

  it('her dayanakta sürdürme teminatı başlangıçtan DÜŞÜK (margin call önce gelir)', () => {
    for (const def of Object.values(VIOP_UNDERLYINGS)) {
      assert.ok(def.maintenanceMarginRate < def.initialMarginRate, `${def.key}: sürdürme < başlangıç`);
      assert.ok(def.maintenanceMarginRate > 0, `${def.key}: sürdürme pozitif`);
    }
  });
});

describe('daysToExpiry / lastBusinessDayOfMonth', () => {
  it('daysToExpiry gelecekte pozitif', () => {
    const contract = fixtureContract(new Date(Date.UTC(2026, 7, 31)));
    const now = new Date(Date.UTC(2026, 6, 11));
    assert.ok(daysToExpiry(contract, now) > 0);
  });

  it('son iş günü hafta sonuna denk gelmez', () => {
    const d = lastBusinessDayOfMonth(2026, 4); // Mayıs 2026
    assert.ok(d.getUTCDay() !== 0 && d.getUTCDay() !== 6);
  });
});
