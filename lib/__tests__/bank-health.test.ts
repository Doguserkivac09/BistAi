/**
 * Banka Sağlık Motoru — Kademe 1 (K1) birim testleri.
 * Kapsam: reel ROE bayrağı · emsal çifte-olumsuz · sanayi rotaya GİRMEZ ·
 * eksik veride skor uydurulmaz · ağırlık yeniden normalize.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeBankHealth, realRoePct, isBankSector } from '../bank-health';
import type { PeerValuation } from '../peer-valuation';

const peer = (over: Partial<PeerValuation> = {}): PeerValuation => ({
  sector: 'banka',
  count: 17,
  reliable: true,
  pe: { value: 4, median: 5, pctVsMedian: -20 },
  pb: { value: 0.8, median: 1, pctVsMedian: -20 },
  evEbitda: { value: null, median: null, pctVsMedian: null },
  roe: { value: 0.4, median: 0.35, pctVsMedian: 14 },
  relativeScore: 70,
  label: 'sektöre göre ucuz',
  ...over,
});

describe('isBankSector — rota kapısı', () => {
  it('yalnız banka sektörü girer; sigorta/sanayi GİRMEZ', () => {
    assert.equal(isBankSector('banka'), true);
    assert.equal(isBankSector('sigorta_finans'), false);
    assert.equal(isBankSector('sanayi'), false);
    assert.equal(isBankSector('holding'), false);
  });

  it('sanayi sembolü banka rotasına girmez (regresyon)', () => {
    const r = computeBankHealth({ sectorId: 'sanayi', peer: peer(), roe: 0.5, inflationYoy: 30 });
    assert.equal(r.applicable, false);
    assert.equal(r.score, null);
  });
});

describe('realRoePct', () => {
  it('nominal ROE oranından enflasyonu düşer', () => {
    assert.equal(realRoePct(0.45, 30), 15);   // %45 − %30
    assert.equal(realRoePct(0.28, 35), -7);   // reel negatif
  });
  it('enflasyon yoksa nominal döner; ROE yoksa null', () => {
    assert.equal(realRoePct(0.2, null), 20);
    assert.equal(realRoePct(null, 30), null);
  });
});

describe('computeBankHealth — Kademe 1 tespitleri', () => {
  it('reel ROE negatif VE ROE emsal medyanının altında → sert bayrak (ayrıştırıcı)', () => {
    const r = computeBankHealth({
      sectorId: 'banka',
      peer: peer({ roe: { value: 0.25, median: 0.35, pctVsMedian: -29 } }),
      roe: 0.25, inflationYoy: 35,
    });
    assert.equal(r.applicable, true);
    assert.equal(r.redFlag, true);
    assert.equal(r.verdict, 'zayif');
    assert.ok(r.flags.some((f) => f.id === 'bank-real-roe-neg' && f.tone === 'warn'));
  });

  it('reel ROE negatif AMA emsal medyanının ÜSTÜNDE → uyarı var, VETO yok', () => {
    // Sektörün tamamı reel negatifken (TÜFE > sektör ROE) bu olgu ayrıştırıcı değildir:
    // uyarı gösterilir ama banka üründen silinmez.
    const r = computeBankHealth({
      sectorId: 'banka',
      peer: peer({ roe: { value: 0.3, median: 0.24, pctVsMedian: 25 } }),
      roe: 0.3, inflationYoy: 33,
    });
    assert.equal(r.redFlag, false);
    assert.ok(r.flags.some((f) => f.id === 'bank-real-roe-neg'), 'uyarı gizlenmemeli');
  });

  it('derin reel kayıp (≤ −15 puan) emsal medyanı olmasa da veto üretir', () => {
    const r = computeBankHealth({ sectorId: 'banka', peer: null, roe: 0.12, inflationYoy: 33 });
    assert.equal(r.redFlag, true);
  });

  it('reel ROE pozitif + emsale göre ucuz → sağlıklı, sert bayrak YOK', () => {
    const r = computeBankHealth({ sectorId: 'banka', peer: peer(), roe: 0.5, inflationYoy: 30 });
    assert.equal(r.redFlag, false);
    assert.equal(r.verdict, 'saglikli');
    assert.ok(r.flags.some((f) => f.id === 'bank-real-roe-pos'));
    assert.ok(r.flags.some((f) => f.id === 'bank-cheap-strong-roe'));
  });

  it('emsale göre pahalı + ROE medyan altı → çifte olumsuz bayrağı', () => {
    const r = computeBankHealth({
      sectorId: 'banka',
      peer: peer({ relativeScore: 20, label: 'sektöre göre pahalı', roe: { value: 0.2, median: 0.35, pctVsMedian: -43 } }),
      roe: 0.4, inflationYoy: 30,
    });
    assert.ok(r.flags.some((f) => f.id === 'bank-expensive-weak-roe' && f.tone === 'warn'));
    assert.equal(r.redFlag, false); // reel ROE pozitif → sert bayrak değil
  });

  it('güvenilmez emsal (n<5) verdict’e katılmaz — skor yalnız reel ROE’den', () => {
    const unreliable = peer({ count: 3, reliable: false, relativeScore: 100 });
    const withPeer = computeBankHealth({ sectorId: 'banka', peer: unreliable, roe: 0.45, inflationYoy: 30 });
    const noPeer = computeBankHealth({ sectorId: 'banka', peer: null, roe: 0.45, inflationYoy: 30 });
    assert.equal(withPeer.score, noPeer.score);
    assert.ok(!withPeer.flags.some((f) => f.id.startsWith('bank-cheap') || f.id.startsWith('bank-expensive')));
  });

  it('hiç girdi yoksa skor UYDURULMAZ (ölçülemedi)', () => {
    const r = computeBankHealth({ sectorId: 'banka', peer: null, roe: null, inflationYoy: 30 });
    assert.equal(r.applicable, true);
    assert.equal(r.score, null);
    assert.equal(r.verdict, 'olculemedi');
    assert.equal(r.dataQuality, 'yok');
  });

  it('Kademe 1 her zaman "kısmi veri" etiketler (tam veri iddia etmez)', () => {
    const r = computeBankHealth({ sectorId: 'banka', peer: peer(), roe: 0.5, inflationYoy: 30 });
    assert.equal(r.tier, 1);
    assert.equal(r.dataQuality, 'kısmi');
  });
});

// ── KADEME 2 (K2): gelir kalitesi + marj + risk maliyeti ────────────────────
import { computeBankMetrics } from '../bank-health';
import type { BankFields } from '../isyatirim-bank';

const bf = (over: Partial<BankFields> = {}): BankFields => ({
  interestIncome: 1000, interestExpense: 700, netInterestIncome: 300,
  netFeeIncome: 200, tradingProfit: 20, otherOperatingIncome: 30,
  totalOperatingIncome: 550, provisions: 60, operatingExpense: 250,
  netIncome: 180, loans: 4000, deposits: 5000, totalAssets: 8000, equity: 800,
  ...over,
});

describe('computeBankMetrics — Kademe 2 ölçümleri', () => {
  it('çekirdek oran, ticari pay, NIM proxy, CoR ve maliyet/gelir doğru hesaplanır', () => {
    const m = computeBankMetrics({ ttm: bf(), prev: null });
    assert.equal(Math.round(m.coreIncomeRatio! * 100), 91);  // (300+200)/550
    assert.equal(Math.round(m.tradingShare! * 100), 4);      // 20/550
    assert.equal(m.nimProxy, 3.8);                            // 300/8000 → %3,8
    assert.equal(m.corBps, 150);                              // 60/4000 → 150bp
    assert.equal(Math.round(m.costIncome! * 100), 45);        // 250/550
  });

  it('stok kalemlerinde DÖNEM ORTALAMASI kullanılır (enflasyonda dönem-sonu yanıltır)', () => {
    const m = computeBankMetrics({ ttm: bf(), prev: bf({ totalAssets: 4000, loans: 2000 }) });
    assert.equal(m.nimProxy, 5);    // 300 / ((8000+4000)/2) = %5
    assert.equal(m.corBps, 200);    // 60 / ((4000+2000)/2) = 200bp
  });

  it('eksik kalem → ilgili ölçüm null (0 sayılmaz)', () => {
    const m = computeBankMetrics({ ttm: bf({ totalOperatingIncome: null, provisions: null }), prev: null });
    assert.equal(m.coreIncomeRatio, null);
    assert.equal(m.costIncome, null);
    assert.equal(m.corBps, null);
    assert.equal(m.nimProxy, 3.8); // etkilenmeyen ölçüm hâlâ üretilir
  });
});

describe('computeBankHealth — Kademe 2 bayrakları', () => {
  const base = { sectorId: 'banka' as const, peer: peer(), roe: 0.5, inflationYoy: 30 };

  it('mali tablo varsa tier 2 + "geniş" veri kalitesi (asla "tam" iddia edilmez)', () => {
    const r = computeBankHealth({ ...base, financials: { ttm: bf(), prev: null } });
    assert.equal(r.tier, 2);
    assert.equal(r.dataQuality, 'geniş');
    assert.ok(r.metrics);
  });

  it('çekirdek gelir güçlü → pozitif bayrak', () => {
    const r = computeBankHealth({ ...base, financials: { ttm: bf(), prev: null } });
    assert.ok(r.flags.some((f) => f.id === 'bank-core-strong' && f.tone === 'pos'));
  });

  it('kâr ticari gelirden → uyarı + SERT bayrak (sürdürülemez)', () => {
    const ttm = bf({ netInterestIncome: 100, netFeeIncome: 50, tradingProfit: 250, totalOperatingIncome: 500 });
    const r = computeBankHealth({ ...base, financials: { ttm, prev: null } });
    const f = r.flags.find((x) => x.id === 'bank-core-weak');
    assert.ok(f, 'çekirdek zayıf bayrağı yok');
    assert.equal(f!.text, 'Kâr ticari gelirden — sürdürülemez');
    assert.equal(r.redFlag, true);
  });

  it('çekirdek düşük AMA ticari pay düşükse veto YOK (yalnız uyarı)', () => {
    const ttm = bf({ netInterestIncome: 100, netFeeIncome: 50, tradingProfit: 10, otherOperatingIncome: 340, totalOperatingIncome: 500 });
    const r = computeBankHealth({ ...base, financials: { ttm, prev: null } });
    assert.ok(r.flags.some((x) => x.id === 'bank-core-weak'));
    assert.equal(r.redFlag, false);
  });

  it('sektör bağlamı YOKken mutlak (daha zayıf) eşikler geçerli', () => {
    const prev = bf({ provisions: 20, netInterestIncome: 150 });
    const r = computeBankHealth({ ...base, financials: { ttm: bf(), prev } });
    assert.ok(r.flags.some((f) => f.id === 'bank-cor-up'), 'CoR +100bp mutlak eşiği geçmeli');
    assert.ok(r.flags.some((f) => f.id === 'bank-nim-up'), 'NIM +1.9pp mutlak eşiği geçmeli');
    // Metin sektör medyanı İDDİA ETMEZ (bağlam yok)
    assert.equal(r.flags.find((f) => f.id === 'bank-nim-up')!.text, 'Faiz marjı genişliyor');
  });

  it('sektör bağlamı VARsa trend bayrağı GÖRECELİ olur — sektörle birlikte hareket rozet ÜRETMEZ', () => {
    // Faiz döngüsünde tüm bankaların marjı genişler; medyanla aynı hareket ayrıştırıcı değil.
    const prev = bf({ netInterestIncome: 150, provisions: 20 });
    const ctx = { nimDeltaMedianPp: 1.9, corDeltaMedianBps: 100 };
    const birlikte = computeBankHealth({ ...base, financials: { ttm: bf(), prev }, sectorContext: ctx });
    assert.ok(!birlikte.flags.some((f) => f.id === 'bank-nim-up'), 'medyanla aynı hareket rozet üretmemeli');
    assert.ok(!birlikte.flags.some((f) => f.id === 'bank-cor-up'), 'medyanla aynı CoR artışı rozet üretmemeli');

    // Emsalden AYRIŞAN banka rozet alır
    const ayrisan = computeBankHealth({
      ...base,
      financials: { ttm: bf(), prev },
      sectorContext: { nimDeltaMedianPp: 0.5, corDeltaMedianBps: 10 },
    });
    assert.ok(ayrisan.flags.some((f) => f.id === 'bank-nim-up' && /emsalinden/.test(f.text)));
    assert.ok(ayrisan.flags.some((f) => f.id === 'bank-cor-up' && /emsalinden/.test(f.text)));
  });

  it('marjı sektörün gerisinde kalan banka uyarı alır', () => {
    const prev = bf({ netInterestIncome: 295 }); // marj neredeyse yatay
    const r = computeBankHealth({
      ...base,
      financials: { ttm: bf(), prev },
      sectorContext: { nimDeltaMedianPp: 1.6, corDeltaMedianBps: 50 },
    });
    assert.ok(r.flags.some((f) => f.id === 'bank-nim-down' && f.tone === 'warn'));
  });

  it('karşılık düşerken kâr artıyor → "karşılık giderindeki düşüşten" uyarısı', () => {
    const prev = bf({ provisions: 200, netIncome: 100 });
    const r = computeBankHealth({ ...base, financials: { ttm: bf(), prev } });
    assert.ok(r.flags.some((f) => f.id === 'bank-cor-relief' && f.tone === 'warn'));
  });

  it('NPL/coverage/SYR bayrağı ASLA üretilmez (veri yok — uydurulmaz)', () => {
    const r = computeBankHealth({ ...base, financials: { ttm: bf(), prev: bf() } });
    assert.ok(!r.flags.some((f) => /npl|coverage|stage|syr|sermaye|tufex|tüfex/i.test(f.id + f.text)));
  });

  it('mali tablo yoksa Kademe 1 davranışı DEĞİŞMEZ (regresyon)', () => {
    const t1 = computeBankHealth(base);
    const t1b = computeBankHealth({ ...base, financials: null });
    assert.deepEqual(t1, t1b);
    assert.equal(t1.tier, 1);
  });
});
