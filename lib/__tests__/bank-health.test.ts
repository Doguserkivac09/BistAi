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
