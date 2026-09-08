/**
 * Fon Risk & Getiri Motoru — birim testleri (FON-ANALIZ-PLAN F2 doğrulaması).
 *
 * Bu dosya ürünün en hassas iddiasını korur: "bu fon aldığı riski hak etti mi?"
 * Yanlış hesaplanmış bir Sharpe veya reel getiri, kullanıcıyı yanlış fona yönlendirir.
 * Ayrıca "veri yoksa metrik üretilmez" ilkesi burada kilitlenir.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSeries, dailyReturns, alignSeries,
  cumulativeReturn, annualizedReturn, periodReturns,
  periodRate, realReturnFisher, layeredReturn,
  volatility, maxDrawdown, monthlyReturns, riskMetrics,
  alphaBeta, informationRatio, rollingConsistency, singleYearDependency,
  computeFundMetrics, MIN_OBS, type NavPoint,
} from '../fund-metrics';

/** Sabit büyüme oranıyla n günlük seri üretir (deterministik). */
function serie(days: number, dailyPct: number, start = 100, from = '2024-01-01'): NavPoint[] {
  const out: NavPoint[] = [];
  let p = start;
  const t0 = Date.parse(from);
  for (let i = 0; i < days; i++) {
    out.push({ date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10), price: p });
    p *= 1 + dailyPct / 100;
  }
  return out;
}

/**
 * Varyansli deterministik seri (LCG). Sabit getirili seride varyans SIFIR olur;
 * beta/Sortino matematiksel olarak tanimsiz kalir (kod dogru sekilde null doner).
 * Gercek fon serisi dalgalanir — test de dalgalanmali.
 */
function wiggly(days: number, driftPct: number, volPct: number, start = 100, from = '2024-01-01'): NavPoint[] {
  const out: NavPoint[] = [];
  let p = start;
  let seed = 42;
  const t0 = Date.parse(from);
  for (let i = 0; i < days; i++) {
    out.push({ date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10), price: p });
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const u = seed / 2147483648 - 0.5;          // [-0.5, 0.5)
    p *= 1 + (driftPct + u * volPct * 2) / 100;
  }
  return out;
}

describe('normalizeSeries / dailyReturns', () => {
  it('tarihe göre sıralar, tekrarı ve geçersiz fiyatı atar', () => {
    const s = normalizeSeries([
      { date: '2024-01-03', price: 3 },
      { date: '2024-01-01', price: 1 },
      { date: '2024-01-02', price: 2 },
      { date: '2024-01-02', price: 2 },      // tekrar
      { date: '2024-01-04', price: 0 },      // geçersiz
      { date: '2024-01-05', price: NaN },    // geçersiz
    ]);
    assert.deepEqual(s.map((p) => p.date), ['2024-01-01', '2024-01-02', '2024-01-03']);
  });

  it('günlük getiriler n-1 adet üretir', () => {
    const r = dailyReturns([{ date: 'a', price: 100 }, { date: 'b', price: 110 }, { date: 'c', price: 121 }]);
    assert.equal(r.length, 2);
    assert.ok(Math.abs(r[0]! - 0.1) < 1e-12);
  });
});

describe('alignSeries — ortak tarih (inner-join)', () => {
  it('fon tatil günlerinde fiyat üretmez; yalnız ORTAK günler eşleşir', () => {
    const fon: NavPoint[] = [
      { date: '2024-01-01', price: 10 },
      { date: '2024-01-03', price: 11 },  // 02 yok (fon kapalı)
      { date: '2024-01-04', price: 12 },
    ];
    const olcut: NavPoint[] = [
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-02', price: 101 },
      { date: '2024-01-03', price: 102 },
    ];
    const { a, b } = alignSeries(fon, olcut);
    assert.deepEqual(a.map((p) => p.date), ['2024-01-01', '2024-01-03']);
    assert.deepEqual(b.map((p) => p.price), [100, 102]);
  });
});

describe('getiri katmanı', () => {
  it('kümülatif getiri doğru', () => {
    assert.equal(cumulativeReturn([{ date: 'a', price: 100 }, { date: 'b', price: 150 }]), 50);
  });

  it('1 YILDAN KISA dönemde yıllıklandırma YAPILMAZ (yanıltıcı olurdu)', () => {
    const kisa = serie(90, 0.1);
    assert.equal(annualizedReturn(kisa), null, '3 aylık getiri yıllıklandırılmamalı');
  });

  it('1 yıldan uzun dönemde yıllıklandırır', () => {
    const uzun = serie(500, 0.05);
    assert.ok(annualizedReturn(uzun) !== null);
  });

  it('dönem verisi yoksa null döner, 0 DEĞİL', () => {
    const p = periodReturns(serie(10, 0.1));
    const bes = p.find((x) => x.period === '5y')!;
    assert.equal(bes.cumulative, null, 'olmayan 5 yıl için 0 değil null');
  });

  it('KISA geçmişli fonun 10 günlük getirisi "5 yıllık getiri" diye SUNULMAZ', () => {
    // Gercek kusurdu: dilim tum seriyi donduruyor, 10 gunluk getiri 5y kolonuna yaziliyordu.
    const kisa = serie(10, 1.0); // %10'a yakin toplam getiri
    const p = periodReturns(kisa);
    assert.equal(p.find((x) => x.period === '1y')!.cumulative, null);
    assert.equal(p.find((x) => x.period === '3y')!.cumulative, null);
    assert.equal(p.find((x) => x.period === '5y')!.cumulative, null);
    // 1 haftalik donem GERCEKTEN kapsaniyor → uretilir
    assert.ok(p.find((x) => x.period === '1h')!.cumulative !== null);
  });
});

describe('periodRate — bileşik dönem oranı', () => {
  it('yıllık %37 altı ayda basit yarısı (%18,5) DEĞİL', () => {
    const yarim = periodRate(37, 182.5);
    assert.ok(yarim > 16.5 && yarim < 17.5, `beklenen ~%17, gelen ${yarim}`);
  });
  it('tam yılda yıllık oranın kendisi', () => {
    assert.ok(Math.abs(periodRate(37, 365) - 37) < 0.01);
  });
});

describe('realReturnFisher — reel getiri', () => {
  it('Fisher kullanır, basit çıkarma DEĞİL', () => {
    // %45 getiri / %32 enflasyon → çıkarma %13 der, Fisher %9,85
    const r = realReturnFisher(45, 32);
    assert.ok(Math.abs(r - 9.85) < 0.05, `Fisher beklenirdi, gelen ${r}`);
    assert.notEqual(r, 13);
  });
  it('enflasyon getiriyi aşarsa reel NEGATİF', () => {
    assert.ok(realReturnFisher(20, 32) < 0);
  });
});

describe('layeredReturn — üç katman (ürünün kalbi)', () => {
  const s = serie(366, 0.1); // ~%44 yıllık

  it('nominal / fazla / reel birlikte üretilir', () => {
    const l = layeredReturn(s, { policyRateAnnualPct: 37, inflationAnnualPct: 32 });
    assert.ok(l.nominal! > 40);
    assert.ok(l.riskFree! > 36 && l.riskFree! < 38);
    assert.equal(l.excess, Math.round((l.nominal! - l.riskFree!) * 100) / 100);
    assert.ok(l.real! < l.nominal!, 'reel nominalden düşük olmalı');
  });

  it('makro verisi yoksa katman null — UYDURULMAZ', () => {
    const l = layeredReturn(s, { policyRateAnnualPct: null, inflationAnnualPct: null });
    assert.ok(l.nominal !== null, 'nominal yine hesaplanır');
    assert.equal(l.riskFree, null);
    assert.equal(l.excess, null);
    assert.equal(l.real, null);
  });
});

describe('risk metrikleri', () => {
  it('sabit getirili seride volatilite ~0 ve maxDD 0', () => {
    const s = serie(120, 0.05);
    assert.ok(volatility(dailyReturns(s))! < 0.01);
    assert.equal(maxDrawdown(s), 0);
  });

  it('maxDrawdown tepe-dip düşüşü yakalar', () => {
    const s: NavPoint[] = [];
    const prices = [100, 120, 90, 95, 130];
    for (let i = 0; i < 30; i++) s.push({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, price: prices[i % prices.length]! });
    const mdd = maxDrawdown(s)!;
    assert.ok(mdd <= -25, `120→90 = %25 düşüş beklenir, gelen ${mdd}`);
  });

  it('örneklem eşiğinin altında metrik ÜRETİLMEZ', () => {
    const kisa = serie(MIN_OBS.risk - 5, 0.1);
    const r = riskMetrics(kisa, { policyRateAnnualPct: 37 });
    assert.equal(r.volatility, null);
    assert.equal(r.sharpe, null);
    assert.equal(r.maxDrawdown, null);
  });

  it('Sortino yukarı oynaklığı CEZALANDIRMAZ (Sharpe’tan yüksek olabilir)', () => {
    // Ara sıra büyük YUKARI sıçrama, diğer günler hafif aşağı → downside küçük
    const s: NavPoint[] = [{ date: '2024-01-01', price: 100 }];
    let p = 100;
    for (let i = 1; i < 150; i++) {
      p *= 1 + (i % 10 === 0 ? 0.03 : -0.001);
      s.push({ date: new Date(Date.parse('2024-01-01') + i * 86_400_000).toISOString().slice(0, 10), price: p });
    }
    const r = riskMetrics(s, { policyRateAnnualPct: 0 });
    assert.ok(r.sharpe !== null && r.sortino !== null, 'her ikisi de hesaplanabilmeli');
    assert.ok(r.sortino! > r.sharpe!, 'yukarı oynaklıkta Sortino > Sharpe olmalı');
  });

  it('hiç aşağı gün yoksa Sortino null (sıfıra bölme uydurulmaz)', () => {
    const r = riskMetrics(serie(120, 0.05), { policyRateAnnualPct: 0 });
    assert.equal(r.sortino, null);
  });

  it('risksiz getiri yoksa Sharpe null (0 varsayılmaz)', () => {
    const r = riskMetrics(serie(120, 0.05), { policyRateAnnualPct: null });
    assert.equal(r.sharpe, null);
    assert.ok(r.volatility !== null, 'volatilite risksizden bağımsız üretilir');
  });

  it('aylık getiriler ve en kötü ay', () => {
    const m = monthlyReturns(serie(90, 0.1));
    assert.ok(m.length >= 3);
    assert.ok(m.every((x) => x.ret > 0));
  });
});

describe('beceri metrikleri', () => {
  it('ölçütle AYNI hareket eden fonda beta ~1, alfa ~0', () => {
    const bench = wiggly(200, 0.05, 0.8);
    const { alpha, beta } = alphaBeta(dailyReturns(bench), dailyReturns(bench));
    assert.ok(Math.abs(beta! - 1) < 0.01, `beta ~1 beklenirdi, gelen ${beta}`);
    assert.ok(Math.abs(alpha!) < 0.5, `alfa ~0 beklenirdi, gelen ${alpha}`);
  });

  it('VARYANSSIZ ölçütte beta üretilmez (sıfıra bölme yerine null)', () => {
    const sabit = dailyReturns(serie(200, 0.05));
    assert.equal(alphaBeta(sabit, sabit).beta, null);
  });

  it('örneklem yetersizse alfa/beta ÜRETİLMEZ', () => {
    const kisa = dailyReturns(serie(MIN_OBS.regression - 10, 0.1));
    const { alpha, beta } = alphaBeta(kisa, kisa);
    assert.equal(alpha, null);
    assert.equal(beta, null);
  });

  it('ölçütü sürekli geçen fonda rolling tutarlılık yüksek', () => {
    const fon = serie(800, 0.08);
    const olcut = serie(800, 0.03);
    const rc = rollingConsistency(fon, olcut);
    assert.ok(rc.windows >= MIN_OBS.rollingWindows);
    assert.equal(rc.rate, 100);
  });

  it('pencere sayısı yetersizse tutarlılık null (uydurulmaz)', () => {
    const rc = rollingConsistency(serie(200, 0.05), serie(200, 0.02));
    assert.equal(rc.rate, null, '365 günlük pencere için 200 gün yetmez');
  });

  it('tek-yıl bağımlılığı: getirinin çoğu tek yıldan geliyorsa yüksek', () => {
    // 2024 patlar, 2025 yatay
    const s: NavPoint[] = [];
    let p = 100;
    for (let i = 0; i < 360; i++) { p *= 1.004; s.push({ date: new Date(Date.parse('2024-01-01') + i * 86_400_000).toISOString().slice(0, 10), price: p }); }
    for (let i = 0; i < 360; i++) { p *= 1.00001; s.push({ date: new Date(Date.parse('2025-01-01') + i * 86_400_000).toISOString().slice(0, 10), price: p }); }
    const dep = singleYearDependency(s)!;
    assert.ok(dep > 90, `tek yıl baskın olmalı, gelen ${dep}`);
  });

  it('ölçüt yoksa beceri metrikleri null ama tek-yıl bağımlılığı yine üretilir', () => {
    const sk = computeFundMetrics({
      series: serie(800, 0.05), benchmark: null, policyRateAnnualPct: 37, inflationAnnualPct: 32,
    }).skill;
    assert.equal(sk.alpha, null);
    assert.equal(sk.informationRatio, null);
    assert.ok(sk.singleYearDependency !== null);
  });
});

describe('computeFundMetrics — birleşik', () => {
  it('yeterli geçmişi olmayan fon: applicable=false, sebep açık', () => {
    const m = computeFundMetrics({ series: [{ date: '2026-01-01', price: 10 }], benchmark: null, policyRateAnnualPct: 37, inflationAnnualPct: 32 });
    assert.equal(m.applicable, false);
    assert.match(m.reason ?? '', /geçmiş/i);
    assert.equal(m.risk.sharpe, null);
  });

  it('sağlam fon: tüm katmanlar dolu ve tutarlı', () => {
    const m = computeFundMetrics({
      series: wiggly(800, 0.07, 1.0), benchmark: wiggly(800, 0.03, 0.7),
      policyRateAnnualPct: 37, inflationAnnualPct: 32,
    });
    assert.equal(m.applicable, true);
    assert.ok(m.historyDays > 700);
    assert.ok(m.layered.nominal !== null && m.layered.excess !== null && m.layered.real !== null);
    assert.ok(m.risk.volatility !== null && m.risk.maxDrawdown !== null);
    assert.ok(m.skill.beta !== null && m.skill.informationRatio !== null);
    assert.ok(m.periods.some((p) => p.cumulative !== null));
  });
});
