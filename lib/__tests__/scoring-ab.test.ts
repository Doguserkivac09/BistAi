/**
 * SCORING A/B ölçüm çekirdeği testleri (SKOR-MIMARISI-PLAN FAZ 0).
 * Harness'in KENDİSİ doğru olmalı — yanlış ölçüm yanlış karar verdirir.
 *
 * Kapsam:
 *  - computeMetrics: winRate/avgReturn/Sharpe/maxDrawdown bilinen serilerde
 *  - netReturnOf: kanonik ufuk + yön düzeltmesi + komisyon
 *  - bucketRegime: rejim kovaları
 *  - runAb: eşik seçimi + rejim kırılımı + A/B ayrımı
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMetrics,
  netReturnOf,
  bucketRegime,
  runAb,
  buildEvents,
  AB_COMMISSION,
  type AbEvent,
  type AbSignalRow,
} from '../scoring-ab';

describe('computeMetrics', () => {
  it('boş seri → sıfır metrik', () => {
    const m = computeMetrics([]);
    assert.deepEqual(m, { n: 0, winRate: 0, avgReturn: 0, sharpe: 0, maxDrawdown: 0 });
  });

  it('winRate ve avgReturn bilinen seride doğru', () => {
    const m = computeMetrics([0.1, -0.05, 0.2]); // 2 kazanan / 3
    assert.equal(m.n, 3);
    assert.ok(Math.abs(m.winRate - 0.6667) < 0.001);
    assert.ok(Math.abs(m.avgReturn - 0.0833) < 0.001);
  });

  it('hepsi pozitif → maxDrawdown 0', () => {
    assert.equal(computeMetrics([0.05, 0.1, 0.02]).maxDrawdown, 0);
  });

  it('maxDrawdown compound tepe→dip yakalar', () => {
    // +%20 → equity 1.2 (tepe), sonra -%50 → 0.6 → dd = (1.2-0.6)/1.2 = 0.5
    const m = computeMetrics([0.2, -0.5]);
    assert.ok(Math.abs(m.maxDrawdown - 0.5) < 0.001);
  });

  it('tek eleman → sharpe 0 (std hesaplanamaz)', () => {
    assert.equal(computeMetrics([0.1]).sharpe, 0);
  });

  it('sabit getiri → std 0 → sharpe 0 (patlamaz)', () => {
    assert.equal(computeMetrics([0.05, 0.05, 0.05]).sharpe, 0);
  });

  it('düşük volatilite yüksek Sharpe → yüksek vol düşük Sharpe (ayrıştırma)', () => {
    const durgun = computeMetrics([0.03, 0.04, 0.035, 0.03]);   // tutarlı +
    const oynak  = computeMetrics([0.2, -0.15, 0.18, -0.1]);     // aynı-ish ort, oynak
    assert.ok(durgun.sharpe > oynak.sharpe);
  });
});

describe('netReturnOf — kanonik ufuk + yön + komisyon', () => {
  const base: AbSignalRow = {
    sembol: 'TEST', signal_type: 'Trend Başlangıcı', direction: 'yukari',
    entry_time: '2026-05-01T10:00:00Z', confluence_score: 70, weekly_aligned: true,
    regime: 'bull_trend', return_3d: null, return_7d: 0.1, return_14d: 0.2, return_30d: 0.3,
  };

  it('yukarı sinyal: net = ham − komisyon', () => {
    // Trend Başlangıcı kanonik ufku 14g → return_14d 0.2
    const r = netReturnOf({ ...base });
    assert.ok(Math.abs(r! - (0.2 - AB_COMMISSION)) < 1e-9);
  });

  it('aşağı sinyalde getiri işareti çevrilir (düşüşten kazanç)', () => {
    const r = netReturnOf({ ...base, direction: 'asagi', return_14d: -0.1 });
    // −(−0.1) − komisyon = 0.1 − komisyon
    assert.ok(Math.abs(r! - (0.1 - AB_COMMISSION)) < 1e-9);
  });

  it('kanonik alan null → null (değerlendirilemez atlanır)', () => {
    assert.equal(netReturnOf({ ...base, return_14d: null }), null);
  });
});

describe('bucketRegime', () => {
  it('rejim metnini kovaya indirir', () => {
    assert.equal(bucketRegime('bull_trend'), 'boğa');
    assert.equal(bucketRegime('bear_trend'), 'ayı');
    assert.equal(bucketRegime('sideways'), 'yatay');
    assert.equal(bucketRegime(null), 'bilinmiyor');
  });
});

describe('buildEvents — sembol+gün gruplama (üretim confluence sadakati)', () => {
  const row = (o: Partial<AbSignalRow>): AbSignalRow => ({
    sembol: 'AAA', signal_type: 'Trend Başlangıcı', direction: 'yukari',
    entry_time: '2026-05-01T10:00:00Z', confluence_score: 60, weekly_aligned: true,
    regime: 'bull_trend', return_3d: null, return_7d: 0.1, return_14d: 0.15, return_30d: 0.2, ...o,
  });

  it('aynı sembol+gün satırları TEK event olur (sinyaller birleşir)', () => {
    const evts = buildEvents([
      row({ signal_type: 'Trend Başlangıcı' }),
      row({ signal_type: 'MACD Kesişimi' }),
      row({ signal_type: 'Higher Lows' }),
    ], new Map());
    assert.equal(evts.length, 1);
  });

  it('farklı gün → ayrı event', () => {
    const evts = buildEvents([
      row({ entry_time: '2026-05-01T10:00:00Z' }),
      row({ entry_time: '2026-05-02T10:00:00Z' }),
    ], new Map());
    assert.equal(evts.length, 2);
  });

  it('birleşik confluence tek sinyalden yüksek skor verir (üretim gerçekçiliği)', () => {
    const tek = buildEvents([row({ confluence_score: 70 })], new Map());
    const cok = buildEvents([
      row({ signal_type: 'Trend Başlangıcı', confluence_score: 70 }),
      row({ signal_type: 'MACD Kesişimi', confluence_score: 70 }),
      row({ signal_type: 'Higher Lows', confluence_score: 70 }),
    ], new Map());
    assert.ok(cok[0]!.v1Score >= tek[0]!.v1Score);
  });

  it('grup getirisi = en yüksek confluence satırın kanonik neti', () => {
    const evts = buildEvents([
      row({ signal_type: 'Trend Başlangıcı', confluence_score: 50, return_14d: 0.05 }),
      row({ signal_type: 'MACD Kesişimi', confluence_score: 90, return_7d: 0.3 }), // best
    ], new Map());
    // best = MACD (conf 90), kanonik ufku 7g → return_7d 0.3 − komisyon
    assert.ok(Math.abs(evts[0]!.netReturn - (0.3 - AB_COMMISSION)) < 1e-9);
  });

  it('getirisi hesaplanamayan grup atlanır', () => {
    const evts = buildEvents([row({ return_14d: null, return_7d: null, return_30d: null, return_3d: null })], new Map());
    assert.equal(evts.length, 0);
  });
});

describe('runAb — eşik seçimi + A/B ayrımı', () => {
  function ev(o: Partial<AbEvent> = {}): AbEvent {
    return {
      sembol: 'X', entryTime: '2026-05-01T10:00:00Z', regime: 'boğa',
      direction: 'yukari', netReturn: 0.1, v1Score: 70, v2Score: 70, ...o,
    };
  }

  it('longOnly: aşağı yönlü sinyaller havuza girmez', () => {
    const r = runAb([ev(), ev({ direction: 'asagi' })], { longOnly: true });
    assert.equal(r.poolSize, 1);
  });

  it('eşik altı sinyal seçilmez', () => {
    const r = runAb([ev({ v1Score: 50, v2Score: 50 })], { threshold: 65 });
    assert.equal(r.a.selectedCount, 0);
    assert.equal(r.b.selectedCount, 0);
  });

  it('v2 farklı skorladığında A ve B farklı seçer', () => {
    // Kötü getirili bir sinyali v1 yüksek (seçer), v2 düşük skorlar (elemeli) → B daha iyi
    const events = [
      ev({ sembol: 'İYİ', netReturn: 0.15, v1Score: 80, v2Score: 80 }),
      ev({ sembol: 'KÖTÜ', netReturn: -0.2, v1Score: 75, v2Score: 40 }), // v2 eler
    ];
    const r = runAb(events, { threshold: 65 });
    assert.equal(r.a.selectedCount, 2); // v1 ikisini de seçer
    assert.equal(r.b.selectedCount, 1); // v2 sadece İYİ
    assert.ok(r.b.avgReturn > r.a.avgReturn); // B kötüyü eledi → daha iyi ortalama
  });

  it('rejim kırılımı ayrışır', () => {
    const r = runAb([ev({ regime: 'boğa' }), ev({ regime: 'ayı' })], { threshold: 65 });
    assert.ok(r.byRegime['boğa']);
    assert.ok(r.byRegime['ayı']);
    assert.equal(r.byRegime['boğa'].a.selectedCount, 1);
  });

  it('note survivorship + sınır açıklamasını taşır', () => {
    const r = runAb([ev()]);
    assert.match(r.note, /survivorship yok/);
    assert.match(r.note, /sektör\/temel\/exposure/);
  });
});
