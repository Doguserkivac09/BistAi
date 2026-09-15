import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHighlights, buildOzet, buildSummary, buildEarnings, likitEvren, borsaDurumu,
  MIN_TL_HACIM, type ScanRow,
} from '../bugun-ozet';

function r(over: Partial<ScanRow> & { sembol: string }): ScanRow {
  return {
    changePercent: 0.5, lastClose: 100, lastVolume: 1_000_000, relVol5: 1, pct52wHigh: -10, sector: 'banka',
    ...over,
  };
}

describe('likitEvren', () => {
  it('TL hacmi tabanın altındaki hisseyi eler (gürültü öne çıkmasın)', () => {
    const sig = r({ sembol: 'SIG', lastClose: 1, lastVolume: 1000, changePercent: 9.9 });
    const lik = r({ sembol: 'LIK' });
    assert.ok(100 * 1_000_000 >= MIN_TL_HACIM);
    assert.deepEqual(likitEvren([sig, lik]).map((x) => x.sembol), ['LIK']);
  });

  it('değişimi bilinmeyen satırı eler (0 saymaz)', () => {
    assert.equal(likitEvren([r({ sembol: 'X', changePercent: null })]).length, 0);
  });
});

describe('buildHighlights — hüküm değil gözlem', () => {
  it('her türden en belirgini önce seçer (çeşitlilik)', () => {
    const rows = [
      r({ sembol: 'H1', relVol5: 4 }), r({ sembol: 'H2', relVol5: 3 }),
      r({ sembol: 'Z1', pct52wHigh: 0 }),
      r({ sembol: 'S1', changePercent: 9.8 }),
      r({ sembol: 'D1', changePercent: -5, relVol5: 2 }),
    ];
    const g = buildHighlights(rows, 4);
    assert.deepEqual(g.map((x) => x.what), ['Hacim', 'Zirve', 'Sert hareket', 'Düşüş']);
    assert.equal(g[0]!.sym, 'H1');
  });

  it('aynı hisse iki kez görünmez', () => {
    const g = buildHighlights([r({ sembol: 'AYNI', relVol5: 5, pct52wHigh: 0, changePercent: 9.9 })]);
    assert.equal(g.length, 1);
  });

  it('⚠️ çıktıda hüküm alanı YOK (al/sat/verdict/score)', () => {
    const g = buildHighlights([r({ sembol: 'A', relVol5: 5 })]);
    for (const alan of ['verdict', 'score', 'action', 'signal']) {
      assert.ok(!(alan in g[0]!), `${alan} alanı eklenmemeli`);
    }
    assert.doesNotMatch(g[0]!.note, /\b(al|sat|fırsat|değerlendir)\b/i);
  });

  it('hacimsiz düşüş gözlem sayılmaz', () => {
    assert.equal(buildHighlights([r({ sembol: 'D', changePercent: -6, relVol5: 1 })]).length, 0);
  });
});

describe('buildOzet', () => {
  it('3 üyeden az sektör gösterilmez', () => {
    const rows = [
      r({ sembol: 'A', sector: 'banka' }), r({ sembol: 'B', sector: 'banka' }), r({ sembol: 'C', sector: 'banka' }),
      r({ sembol: 'D', sector: 'enerji' }),
    ];
    const o = buildOzet(rows);
    assert.deepEqual(o.sectors.map((s) => s.id), ['banka']);
  });

  it('en çok işlem görenler TL hacmine göre sıralanır', () => {
    const o = buildOzet([
      r({ sembol: 'KUCUK', lastVolume: 300_000 }),
      r({ sembol: 'BUYUK', lastVolume: 5_000_000 }),
    ]);
    assert.equal(o.traded[0]!.sym, 'BUYUK');
  });

  it('ivme kazananlar yalnız yükselenlerden oluşur', () => {
    const o = buildOzet([r({ sembol: 'UP', changePercent: 3 }), r({ sembol: 'DN', changePercent: -3 })]);
    assert.deepEqual(o.movers.map((m) => m.sym), ['UP']);
  });
});

describe('buildSummary', () => {
  it('ölçülen olguları cümleye çevirir, yorum/AI iddiası yok', () => {
    const rows = [
      ...['A', 'B', 'C'].map((s) => r({ sembol: s, sector: 'banka', changePercent: 2 })),
      ...['D', 'E', 'F'].map((s) => r({ sembol: s, sector: 'kimya', changePercent: -2 })),
    ];
    const s = buildSummary(buildOzet(rows), 0.87)!;
    assert.match(s, /BIST 100 %0,9 yükselişte/);
    assert.doesNotMatch(s, /AI|risk iştahı|rüzgar/i);
  });

  it('veri yoksa null döner, cümle uydurmaz', () => {
    assert.equal(buildSummary(buildOzet([]), null), null);
  });
});

describe('buildEarnings', () => {
  const now = Date.UTC(2026, 6, 1);
  it('ufuk içindekileri yakından uzağa sıralar, saniye damgasını çevirir', () => {
    const e = buildEarnings({
      UZAK: { nextEarningsTs: (now + 40 * 86_400_000) / 1000 },
      YAKIN: { nextEarningsTs: (now + 5 * 86_400_000) / 1000 },
      DISARI: { nextEarningsTs: (now + 90 * 86_400_000) / 1000 },
      GECMIS: { nextEarningsTs: (now - 10 * 86_400_000) / 1000 },
      YOK: { nextEarningsTs: null },
    }, now);
    assert.deepEqual(e.map((x) => x.sym), ['YAKIN', 'UZAK']);
    assert.equal(e[0]!.date, '6 Tem');
    assert.equal(e[0]!.note, 'Tahmini tarih');
  });
});


describe('borsaDurumu — sabit "BIST açık" yerine gerçek durum', () => {
  it('seans içinde kapanışa kalan süreyi verir', () => {
    // 2026-09-16 Çarşamba 13:58 TRT = 10:58 UTC
    const d = borsaDurumu(new Date('2026-09-16T10:58:00Z'));
    assert.equal(d.acik, true);
    assert.equal(d.detay, 'Kapanışa 4s 12dk');
  });
  it('hafta sonu açık demez', () => {
    const d = borsaDurumu(new Date('2026-09-19T10:00:00Z'));
    assert.equal(d.acik, false);
    assert.equal(d.etiket, 'Hafta sonu');
  });
  it('seans öncesi açılış saatini söyler', () => {
    const d = borsaDurumu(new Date('2026-09-16T05:00:00Z'));
    assert.equal(d.acik, false);
    assert.equal(d.detay, 'Açılış 10:00');
  });
});

describe('veri hatası koruması (canlıda GMSTR +%1.090)', () => {
  it('limit dışı değişim hiçbir bloğa girmez', () => {
    const o = buildOzet([
      r({ sembol: 'BOZUK', changePercent: 1090, relVol5: 9 }),
      ...['A', 'B', 'C'].map((s) => r({ sembol: s, changePercent: 1 })),
    ]);
    assert.ok(!o.movers.some((m) => m.sym === 'BOZUK'));
    assert.ok(!o.highlights.some((h) => h.sym === 'BOZUK'));
    assert.equal(o.breadth.total, 3);
  });

  it('sektör değeri medyan — tek uç hareket sektörü sürüklemez', () => {
    const o = buildOzet([
      r({ sembol: 'A', changePercent: 1 }), r({ sembol: 'B', changePercent: 1.2 }),
      r({ sembol: 'C', changePercent: 0.8 }), r({ sembol: 'D', changePercent: 9.9 }),
    ]);
    assert.ok(Math.abs(o.sectors[0]!.chg - 1.1) < 1e-9);
  });
});

describe('buildSummary — yön dili', () => {
  it('tüm sektörler düşerken "en iyi performans" demez', () => {
    const rows = [
      ...['A', 'B', 'C'].map((x) => r({ sembol: x, sector: 'banka', changePercent: -1 })),
      ...['D', 'E', 'F'].map((x) => r({ sembol: x, sector: 'kimya', changePercent: -5 })),
    ];
    const s = buildSummary(buildOzet(rows), -2.4)!;
    assert.match(s, /Tüm sektörler ekside; en az düşen/);
    assert.doesNotMatch(s, /en iyi|en güçlü/);
  });
});
