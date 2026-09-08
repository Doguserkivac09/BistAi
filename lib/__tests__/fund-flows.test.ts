/**
 * Fon para akımı — birim testleri (FON-BACKFILL-PLAN FAZ 5 doğrulaması).
 *
 * EN KRİTİK TEST: "pay adedi sabit + fiyat değişti → akım SIFIR".
 * Akımı fon büyüklüğünden hesaplamak en sık yapılan hatadır ve yükselen
 * piyasada her fona sahte para girişi yazar. Bu dosya o hatayı kalıcı olarak
 * engeller — formülü değiştirmek isteyen bu testi kırmak zorunda kalır.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeFlows, derivePattern, flowFlags, MIN_FLOW_OBS } from '../fund-flows';
import type { FlowPoint } from '../fund-store';

/** n günlük seri üretir; shares/investors/price ilk→son doğrusal değişir. */
function seri(
  n: number,
  opts: { p0?: number; p1?: number; s0?: number; s1?: number; i0?: number; i1?: number } = {},
): FlowPoint[] {
  const { p0 = 10, p1 = 10, s0 = 1000, s1 = 1000, i0 = 500, i1 = 500 } = opts;
  const out: FlowPoint[] = [];
  const t0 = Date.parse('2026-08-11T00:00:00Z');
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : k / (n - 1);
    out.push({
      date: new Date(t0 + k * 86_400_000).toISOString().slice(0, 10),
      price: p0 + (p1 - p0) * t,
      shares: s0 + (s1 - s0) * t,
      investors: Math.round(i0 + (i1 - i0) * t),
      size: (s0 + (s1 - s0) * t) * (p0 + (p1 - p0) * t),
    });
  }
  return out;
}

describe('computeFlows — akım formülü', () => {
  it('⚠️ REGRESYON: pay adedi SABİT + fiyat İKİYE KATLANDI → akım SIFIR', () => {
    // Fon büyüklüğü bu senaryoda %100 arttı. Δ(büyüklük) kullanan yanlış formül
    // burada devasa sahte "para girişi" yazardı.
    const f = computeFlows(seri(20, { p0: 10, p1: 20, s0: 1000, s1: 1000 }));
    assert.equal(f.netFlowTL, 0);
    assert.equal(f.sharesChangePct, 0);
    assert.equal(f.pattern, 'notr');
  });

  it('⚠️ REGRESYON: pay SABİT + fiyat YARIYA DÜŞTÜ → akım yine SIFIR (çıkış değil)', () => {
    const f = computeFlows(seri(20, { p0: 20, p1: 10, s0: 1000, s1: 1000 }));
    assert.equal(f.netFlowTL, 0);
    assert.equal(f.pattern, 'notr');
  });

  it('pay adedi arttı → pozitif akım, fiyat sabitken büyüklükle tutarlı', () => {
    const f = computeFlows(seri(20, { p0: 10, p1: 10, s0: 1000, s1: 1200 }));
    assert.equal(f.netFlowTL, 200 * 10);
    assert.ok(Math.abs(f.sharesChangePct! - 20) < 1e-9);
  });

  it('pay adedi azaldı → negatif akım (çıkış)', () => {
    const f = computeFlows(seri(20, { s0: 1000, s1: 800 }));
    assert.ok(f.netFlowTL! < 0);
    assert.equal(f.pattern, 'cikis');
  });

  it('ortalama fiyat kullanılır — uç fiyatla çarpmak akımı şişirirdi', () => {
    // Fiyat 10 → 20 doğrusal; ortalama 15. Pay 1000 → 1100 (Δ=100).
    const f = computeFlows(seri(21, { p0: 10, p1: 20, s0: 1000, s1: 1100 }));
    assert.ok(Math.abs(f.netFlowTL! - 100 * 15) < 1e-6, `beklenen 1500, gelen ${f.netFlowTL}`);
  });
});

describe('computeFlows — veri yetersizliği', () => {
  it('boş seri → hepsi null, uydurma YOK', () => {
    const f = computeFlows([]);
    assert.equal(f.netFlowTL, null);
    assert.equal(f.pattern, null);
    assert.equal(f.observations, 0);
  });

  it(`${MIN_FLOW_OBS} gözlemden az → ölçüm üretilmez`, () => {
    const f = computeFlows(seri(MIN_FLOW_OBS - 1, { s0: 1000, s1: 2000 }));
    assert.equal(f.netFlowTL, null);
    assert.equal(f.sharesChangePct, null);
  });

  it('pay adedi null olan günler ATLANIR (0 sayılıp sahte dev akım üretilmez)', () => {
    const s = seri(20, { s0: 1000, s1: 1000 });
    s[5]!.shares = null;
    s[9]!.shares = null;
    const f = computeFlows(s);
    assert.equal(f.netFlowTL, 0);
    assert.equal(f.observations, 18);
  });

  it('yatırımcı sayısı yoksa desen yine üretilir (kurumsal varsayılır)', () => {
    const s = seri(20, { s0: 1000, s1: 1300 }).map((p) => ({ ...p, investors: null }));
    const f = computeFlows(s);
    assert.equal(f.investorsChangePct, null);
    assert.equal(f.pattern, 'kurumsal-giris');
  });
});

describe('derivePattern — akımın ters okunması', () => {
  it('pay ↑ + yatırımcı ~sabit → kurumsal', () => {
    assert.equal(derivePattern(20, 1), 'kurumsal-giris');
  });

  it('pay ↑ + yatırımcı ↑↑ → perakende akını (geç para)', () => {
    assert.equal(derivePattern(20, 30), 'perakende-akini');
  });

  it('gürültü eşiği altındaki değişim nötrdür', () => {
    assert.equal(derivePattern(0.2, 0), 'notr');
    assert.equal(derivePattern(-0.3, 0), 'notr');
  });

  it('ölçüm yoksa desen de yok', () => {
    assert.equal(derivePattern(null, 10), null);
  });
});

describe('flowFlags — kalibrasyon kuralı', () => {
  const giris = computeFlows(seri(20, { s0: 1000, s1: 1300, i0: 500, i1: 505 }));

  it('⚠️ emsal medyanı yoksa AYRIŞTIRICI bayrak üretilmez', () => {
    const f = flowFlags(giris, null, 1e10);
    assert.equal(f.some((x) => x.id.startsWith('fon-akim-')), false);
  });

  it('emsalinden belirgin fazla akım → pozitif göreli bayrak', () => {
    const f = flowFlags(giris, 2, 1e10);
    assert.ok(f.some((x) => x.id === 'fon-akim-emsalustu'));
  });

  it('emsalinin gerisinde kalan akım → uyarı', () => {
    const f = flowFlags(giris, 50, 1e10);
    const g = f.find((x) => x.id === 'fon-akim-emsalalti');
    assert.ok(g && g.tone === 'warn');
  });

  it('küçük fona hızlı giriş → kapasite uyarısı (mutlak, gerçek risk)', () => {
    // pay 1000 → 1600, fiyat sabit 10 → akım 6.000, dönem sonu büyüklük 16.000
    // → akım/büyüklük %37,5 (eşik %30'un üstünde)
    const hizli = computeFlows(seri(20, { s0: 1000, s1: 1600 }));
    assert.ok(Math.abs(hizli.flowToSizePct! - 37.5) < 1e-6, `flowToSize ${hizli.flowToSizePct}`);
    const f = flowFlags(hizli, null, 100_000_000);
    assert.ok(f.some((x) => x.id === 'fon-kapasite'));
  });

  it('ılımlı giriş kapasite uyarısı vermez (eşik altı)', () => {
    const ilimli = computeFlows(seri(20, { s0: 1000, s1: 1200 })); // akım/büyüklük ~%16,7
    const f = flowFlags(ilimli, null, 100_000_000);
    assert.equal(f.some((x) => x.id === 'fon-kapasite'), false);
  });

  it('büyük fonda aynı oran kapasite uyarısı vermez', () => {
    const hizli = computeFlows(seri(20, { s0: 1000, s1: 1600 }));
    const f = flowFlags(hizli, null, 50_000_000_000);
    assert.equal(f.some((x) => x.id === 'fon-kapasite'), false);
  });

  it('sert çıkış → eriyen fon uyarısı', () => {
    const erime = computeFlows(seri(20, { s0: 1000, s1: 600 }));
    const f = flowFlags(erime, null, 1e10);
    assert.ok(f.some((x) => x.id === 'fon-eriyor'));
  });

  it('ölçüm yoksa bayrak UYDURULMAZ', () => {
    assert.deepEqual(flowFlags(computeFlows([]), 5, 1e10), []);
  });
});
