/**
 * Exposure map + scoring-config testleri (SKOR-MIMARISI-PLAN FAZ 1-2 iskele).
 * Çalıştır: npm test
 *
 * Kapsam:
 *  - getExposure: ihracatçı usd+ / banka usd− / bilinmeyen nötr; kaba kademe [-1,1]
 *  - sectorTheme: SECTOR_REPRESENTATIVES lideri high, üye mid
 *  - exposureContribution: yön/akış işareti, ±maxPts bandı, notr=0
 *  - scoring-config: SCORING_V2 kapalı → isScoringV2 false; regimeGate kademeleri
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getExposure, exposureContribution } from '../exposure-map';
import { SCORING_V2, isScoringV2, regimeGate } from '../scoring-config';

describe('getExposure — usd ekseni', () => {
  it('güçlü ihracatçı override → usd pozitif (SELEC değil, ASELS savunma ihracatı)', () => {
    assert.equal(getExposure('ASELS').usd, 1);   // override 0.8 → 1
    assert.equal(getExposure('THYAO').usd, 1);   // override 0.9 → 1
  });

  it('banka → usd negatif (TL zayıflaması NPL riski, sektör bazı -0.5)', () => {
    assert.equal(getExposure('GARAN').usd < 0, true);
  });

  it('ithalatçı override → usd negatif', () => {
    assert.equal(getExposure('BIMAS').usd < 0, true);
  });

  it('bilinmeyen sembol → nötr default (çökme yok)', () => {
    const e = getExposure('YOKBOYLE');
    assert.ok(e.usd >= -1 && e.usd <= 1);
    assert.ok(e.sectorTheme >= 0 && e.sectorTheme <= 1);
  });

  it('tüm usd değerleri kaba kademe {−1,−0.5,0,0.5,1}', () => {
    for (const s of ['ASELS', 'GARAN', 'BIMAS', 'TUPRS', 'SELEC', 'KCHOL']) {
      assert.ok([-1, -0.5, 0, 0.5, 1].includes(getExposure(s).usd), `${s} kademe dışı`);
    }
  });
});

describe('getExposure — sectorTheme ekseni', () => {
  it('sektör temsilcisi (SELEC sağlık lideri) → yüksek tema maruziyeti', () => {
    assert.equal(getExposure('SELEC').sectorTheme, 1);
  });

  it('sektör üyesi ama temsilci değil → orta (0.5)', () => {
    // Rastgele bir sağlık üyesi temsilci değilse 0.5; temsilci listesi dışı bir sembol
    const e = getExposure('YOKBOYLE');
    assert.equal(e.sectorTheme, 0.5); // diğer/bilinmeyen → sektör üyesi kabul, mid
  });
});

describe('exposureContribution — ranking katkısı', () => {
  it('yukarı yön + TL zayıflıyor + ihracatçı → pozitif katkı', () => {
    // ASELS usd=1, sağlığa değil savunmaya; usdFlow +1 (TL zayıf), sectorFlow 0
    const c = exposureContribution('ASELS', 'yukari', 1, 0);
    assert.ok(c > 0, `beklenen pozitif, gelen ${c}`);
  });

  it('SELEC sağlığa akım senaryosu: yukarı + sektör akımı güçlü → pozitif', () => {
    const c = exposureContribution('SELEC', 'yukari', 0, 1); // sectorFlow +1
    assert.ok(c > 0);
  });

  it('aşağı yön işareti tersine çevirir', () => {
    const up = exposureContribution('ASELS', 'yukari', 1, 0);
    const down = exposureContribution('ASELS', 'asagi', 1, 0);
    assert.equal(down, -up);
  });

  it('notr yön → 0', () => {
    assert.equal(exposureContribution('ASELS', 'notr', 1, 1), 0);
  });

  it('katkı ±maxPts bandında kalır (skaler makro gibi sürüklemez)', () => {
    const c = exposureContribution('ASELS', 'yukari', 5, 5, 8); // aşırı akış
    assert.ok(c >= -8 && c <= 8);
  });

  it('akış verisi yoksa (null) katkı 0', () => {
    assert.equal(exposureContribution('ASELS', 'yukari', null, null), 0);
  });
});

describe('scoring-config — flag ve kapı', () => {
  it('SCORING_V2 varsayılan kapalı (FAZ 0 bitene dek)', () => {
    assert.equal(SCORING_V2, false);
  });

  it('kapalıyken isScoringV2 her yüzeyde false (no-op garanti)', () => {
    assert.equal(isScoringV2('short'), false);
    assert.equal(isScoringV2('long'), false);
  });

  it('regimeGate: ayı rejiminde daha seçici + güven kısık', () => {
    const bear = regimeGate('bear_trend');
    const bull = regimeGate('bull_trend');
    assert.ok(bear.surfacedCount < bull.surfacedCount, 'ayıda az sinyal');
    assert.ok(bear.confidenceMultiplier < bull.confidenceMultiplier, 'ayıda düşük güven');
    assert.ok(bear.thresholdBump > 0, 'ayıda eşik yükselir');
    assert.equal(bear.posture, 'temkinli');
  });

  it('bilinmeyen/null rejim → nötr kapı (bozulmaz)', () => {
    const g = regimeGate(null);
    assert.equal(g.posture, 'normal');
    assert.equal(g.thresholdBump, 0);
  });
});
