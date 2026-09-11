/**
 * Swing kurulumu + sicil — birim testleri.
 *
 * Kritik noktalar:
 *   - Wilder RSI TradingView ile aynı formül (basit ortalama DEĞİL)
 *   - İşlem çözümü deterministik: giriş t+1 AÇILIŞ, kesişim k → çıkış k+1 AÇILIŞ
 *   - Kesişim son mumdaysa çıkış fiyatı UYDURULMAZ ("cikiyor" bekler)
 *   - Tamamlanmamış seans mumu atılır (yarım mumla sinyal = ölçülen kural değil)
 *   - Özet: kontrol grubu olmadan "katkı" üretilmez
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateRSIWilder, calculateADX } from '../indicators';
import { computeSwingSeries, resolveSwingTrade, SWING, type SwingSeries } from '../swing-setup';
import { tamamlanmisMumlar, pozisyonVar, bosSatir, satiriCoz, summarizeSicil, type SicilRow, type GunlukMum } from '../swing-sicil-runner';

function mum(i: number, o: number, c: number, vol = 2_000_000): GunlukMum {
  const d = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
  return { date: d, open: o, high: Math.max(o, c) + 0.5, low: Math.min(o, c) - 0.5, close: c, volume: vol };
}
const seriBos = (n: number): SwingSeries => ({ entry: Array(n).fill(false), exitCross: Array(n).fill(false), liquid: Array(n).fill(true) });

describe('calculateRSIWilder', () => {
  it('elle hesaplanan referansla aynı (period 2)', () => {
    // farklar +1, −1, +2 → ilk ort. kazanç 0,5 / kayıp 0,5 → 50; sonra (0,5+2)/2=1,25 / 0,25 → 83,33
    const r = calculateRSIWilder([10, 11, 10, 12], 2);
    assert.ok(Number.isNaN(r[0]) && Number.isNaN(r[1]));
    assert.equal(r[2], 50);
    assert.ok(Math.abs(r[3]! - 83.3333) < 1e-3, `gelen ${r[3]}`);
  });
  it('sürekli yükseliş → 100, sürekli düşüş → 0', () => {
    assert.equal(calculateRSIWilder(Array.from({ length: 30 }, (_, i) => 10 + i)).at(-1), 100);
    assert.equal(calculateRSIWilder(Array.from({ length: 30 }, (_, i) => 50 - i)).at(-1), 0);
  });
  it('yetersiz veri → hepsi NaN (uydurma 50 YOK)', () => {
    assert.ok(calculateRSIWilder([1, 2, 3], 14).every((x) => Number.isNaN(x)));
  });
});

describe('computeSwingSeries', () => {
  it('boş / kısa girdi çökmez, sinyal üretmez', () => {
    assert.deepEqual(computeSwingSeries([]).entry, []);
    assert.ok(computeSwingSeries(Array.from({ length: 30 }, (_, i) => mum(i, 10, 10))).entry.every((x) => !x));
  });
  it('istikrarlı yükselişte giriş YOK (RSI dibe hiç inmez)', () => {
    const c = Array.from({ length: 200 }, (_, i) => mum(i, 100 + i, 101 + i));
    assert.ok(computeSwingSeries(c).entry.every((x) => !x));
  });
  it('çıkış kesişimi −DI>+DI geçişiyle birebir', () => {
    const c = [...Array.from({ length: 60 }, (_, i) => mum(i, 100 + i * 1.5, 101 + i * 1.5)),
      ...Array.from({ length: 60 }, (_, i) => mum(60 + i, 190 - i * 1.5, 189 - i * 1.5))];
    const s = computeSwingSeries(c);
    const { plusDi, minusDi } = calculateADX(c.map((x) => x.high), c.map((x) => x.low), c.map((x) => x.close), SWING.diPeriod);
    for (let t = 1; t < c.length; t++) {
      assert.equal(s.exitCross[t], minusDi[t]! > plusDi[t]! && minusDi[t - 1]! <= plusDi[t - 1]!, `t=${t}`);
    }
    assert.ok(s.exitCross.some(Boolean), 'yükselişten düşüşe geçişte kesişim olmalı');
  });
  it('likidite: 20g medyan dolar hacmi eşiğe göre', () => {
    const likit = computeSwingSeries(Array.from({ length: 40 }, (_, i) => mum(i, 100, 100, 2_000_000))); // $200M
    const sig = computeSwingSeries(Array.from({ length: 40 }, (_, i) => mum(i, 100, 100, 500_000)));   // $50M
    assert.equal(likit.liquid[18], false, 'pencere dolmadan likit sayılmaz');
    assert.equal(likit.liquid[19], true);
    assert.ok(sig.liquid.every((x) => !x));
  });
});

describe('resolveSwingTrade', () => {
  const c = Array.from({ length: 100 }, (_, i) => mum(i, 100 + i, 100.5 + i));

  it('giriş t+1 açılış, kesişim k → çıkış k+1 açılış', () => {
    const s = seriBos(100); s.exitCross[5] = true;
    const tr = resolveSwingTrade(c, s, 2);
    assert.equal(tr.entryIdx, 3); assert.equal(tr.entryPrice, c[3]!.open);
    assert.equal(tr.exitIdx, 6); assert.equal(tr.exitPrice, c[6]!.open);
    assert.equal(tr.exitReason, 'di-kesisim'); assert.equal(tr.barsHeld, 3);
  });
  it('giriş mumundaki kesişim de sayılır (ölçümdeki k ≥ e)', () => {
    const s = seriBos(100); s.exitCross[3] = true;
    assert.equal(resolveSwingTrade(c, s, 2).exitIdx, 4);
  });
  it('kesişim son mumda → çıkış fiyatı UYDURULMAZ, cikiyor bekler', () => {
    const s = seriBos(100); s.exitCross[99] = true;
    const tr = resolveSwingTrade(c, s, 50);
    assert.equal(tr.exitIdx, null); assert.equal(tr.exitSignalIdx, 99);
  });
  it('kesişim yoksa maxHold. mumun kapanışında çıkılır', () => {
    const tr = resolveSwingTrade(c, seriBos(100), 2);
    assert.equal(tr.exitReason, 'sure-doldu');
    assert.equal(tr.exitIdx, 3 + SWING.maxHold - 1);
    assert.equal(tr.exitPrice, c[3 + SWING.maxHold - 1]!.close);
  });
  it('sinyal son mumdaysa giriş henüz yok', () => {
    assert.equal(resolveSwingTrade(c, seriBos(100), 99).entryIdx, null);
  });
});

describe('sicil çalıştırıcı', () => {
  it('seans kapanmadan bugünün yarım mumu atılır, kapandıktan sonra tutulur', () => {
    const c = [mum(0, 1, 1), { ...mum(1, 1, 1), date: '2026-09-11' }];
    assert.equal(tamamlanmisMumlar(c, new Date('2026-09-11T17:00:00Z')).length, 1); // 13:00 ET
    assert.equal(tamamlanmisMumlar(c, new Date('2026-09-11T22:30:00Z')).length, 2); // 18:30 ET
  });

  it('açık sinyal pozisyonu varken aynı hissede yeni sinyal açılmaz; kapandıktan sonra açılır', () => {
    const acik = { ...bosSatir('AAA', 'sinyal', '2026-03-01'), status: 'acik' as const };
    assert.equal(pozisyonVar('AAA', '2026-03-05', [acik]), true);
    assert.equal(pozisyonVar('BBB', '2026-03-05', [acik]), false);
    const kapali = { ...acik, status: 'kapali' as const, exit_date: '2026-03-10' };
    assert.equal(pozisyonVar('AAA', '2026-03-05', [kapali]), true, 'çıkıştan önceki tarih');
    assert.equal(pozisyonVar('AAA', '2026-03-10', [kapali]), false, 'çıkış günü yeni giriş serbest');
    const kontrol = { ...acik, kind: 'kontrol' as const };
    assert.equal(pozisyonVar('AAA', '2026-03-05', [kontrol]), false, 'kontrol pozisyonu engellemez');
  });

  it('satır çözümü: getiri ve SPY getirisi aynı anlarda ölçülür', () => {
    const c = Array.from({ length: 20 }, (_, i) => mum(i, 100 + i, 100 + i));
    const s = seriBos(20); s.exitCross[6] = true;
    const spy = new Map(c.map((m, i) => [m.date, { open: 400 + i, close: 400 + i }]));
    const r = satiriCoz(bosSatir('AAA', 'sinyal', c[2]!.date), c, s, spy)!;
    assert.equal(r.status, 'kapali');
    assert.equal(r.entry_price, 103); assert.equal(r.exit_price, 107);
    assert.equal(r.return_pct, Math.round((107 / 103 - 1) * 1_000_000) / 10_000);
    assert.equal(r.bench_return_pct, Math.round((407 / 403 - 1) * 1_000_000) / 10_000);
    assert.equal(r.exit_signal_date, c[6]!.date);
  });

  it('özet: kontrol yoksa katkı üretilmez; 30 kapanıştan önce yorum yapılmaz', () => {
    const kap = (kind: SicilRow['kind'], ret: number, bench: number): SicilRow =>
      ({ ...bosSatir('X', kind, '2026-01-01'), status: 'kapali', return_pct: ret, bench_return_pct: bench });
    const yalniz = summarizeSicil([kap('sinyal', 5, 1)]);
    assert.equal(yalniz.girisKatkisiPuan, null);
    assert.match(yalniz.yorum, /Henüz yorum yapılamaz/);
    const ikisi = summarizeSicil([kap('sinyal', 5, 1), kap('kontrol', 2, 1)]);
    assert.equal(ikisi.girisKatkisiPuan, 3);
  });
});
