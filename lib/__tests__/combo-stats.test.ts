/**
 * Combo Stats — birim testleri. Çalıştır: npm test
 *
 * Kapsam:
 *  - Co-occurrence gruplama (sembol|gün|yön) + olay başına TEK sayım
 *  - Yön düzeltmesi (asagi sinyalde fiyat düşüşü = kazanç)
 *  - Komisyon düşülür
 *  - Sağlamlık kapısı: min n + pozitif beklenti + winRate>50
 *  - detectBestCombo: aktif sinyallerde en güçlü (önce üçlü) combo
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeComboStats,
  filterStrongCombos,
  detectBestCombo,
  type ComboStatsInputRow,
  type ComboStat,
} from '../combo-stats';

function row(sembol: string, day: string, dir: string, type: string, r7: number | null): ComboStatsInputRow {
  return { sembol, entry_time: `${day}T00:00:00+00:00`, direction: dir, signal_type: type, return_7d: r7 };
}

describe('computeComboStats — gruplama ve sayım', () => {
  it('aynı sembol+gün+yön iki sinyal → tek ikili combo, olay başına tek net', () => {
    const rows = [
      row('AAA', '2026-07-01', 'yukari', 'Bull Flag', 0.10),
      row('AAA', '2026-07-01', 'yukari', 'MACD Kesişimi', 0.10),
    ];
    const stats = computeComboStats(rows);
    const combo = stats.find((s) => s.key === 'Bull Flag + MACD Kesişimi');
    assert.ok(combo, 'ikili combo üretilmeli');
    assert.equal(combo!.n, 1); // TEK olay
    assert.equal(combo!.size, 2);
    // net = 0.10 - 0.004 = 0.096 → %9.6
    assert.ok(Math.abs(combo!.avgNet - 9.6) < 0.001);
    assert.equal(combo!.winRate, 100);
  });

  it('farklı gün → ayrı olaylar, n=2', () => {
    const rows = [
      row('AAA', '2026-07-01', 'yukari', 'Bull Flag', 0.05),
      row('AAA', '2026-07-01', 'yukari', 'RSI Uyumsuzluğu', 0.05),
      row('AAA', '2026-07-08', 'yukari', 'Bull Flag', -0.03),
      row('AAA', '2026-07-08', 'yukari', 'RSI Uyumsuzluğu', -0.03),
    ];
    const combo = computeComboStats(rows).find((s) => s.key === 'Bull Flag + RSI Uyumsuzluğu')!;
    assert.equal(combo.n, 2);
    assert.equal(combo.winRate, 50); // biri +, biri -
  });

  it('asagi yön: fiyat düşüşü kazanç (işaret çevrilir)', () => {
    const rows = [
      row('BBB', '2026-07-01', 'asagi', 'Ölüm Çaprazı', -0.08), // fiyat düştü → kazanç
      row('BBB', '2026-07-01', 'asagi', 'Bear Flag', -0.08),
    ];
    const combo = computeComboStats(rows).find((s) => s.key === 'Bear Flag + Ölüm Çaprazı')!;
    // net = -(-0.08) - 0.004 = 0.076 → %7.6, kazanan
    assert.ok(combo.avgNet > 7 && combo.avgNet < 8);
    assert.equal(combo.winRate, 100);
  });

  it('tek sinyal (co-occurrence yok) → combo üretilmez', () => {
    const stats = computeComboStats([row('CCC', '2026-07-01', 'yukari', 'RSI Seviyesi', 0.02)]);
    assert.equal(stats.length, 0);
  });

  it('üç sinyal → 3 ikili + 1 üçlü', () => {
    const rows = ['Bull Flag', 'MACD Kesişimi', 'Hacim Anomalisi'].map((t) =>
      row('DDD', '2026-07-01', 'yukari', t, 0.06),
    );
    const stats = computeComboStats(rows);
    assert.equal(stats.filter((s) => s.size === 2).length, 3);
    assert.equal(stats.filter((s) => s.size === 3).length, 1);
  });
});

describe('filterStrongCombos — sağlamlık kapısı', () => {
  const base: ComboStat[] = [
    { key: 'A + B', members: ['A', 'B'], size: 2, n: 80, winRate: 60, avgNet: 3.0 },  // geçer
    { key: 'C + D', members: ['C', 'D'], size: 2, n: 10, winRate: 90, avgNet: 8.0 },  // n düşük → elenir
    { key: 'E + F', members: ['E', 'F'], size: 2, n: 100, winRate: 48, avgNet: -0.5 }, // negatif → elenir
    { key: 'G + H', members: ['G', 'H'], size: 2, n: 100, winRate: 55, avgNet: 0.2 },  // avgNet<0.5 → elenir
  ];
  it('yalnız n + pozitif beklenti + winRate>50 geçen kalır', () => {
    const strong = filterStrongCombos(base);
    assert.equal(strong.length, 1);
    assert.equal(strong[0]!.key, 'A + B');
  });
});

describe('detectBestCombo — aktif sinyalde eşleşme', () => {
  const strong: ComboStat[] = [
    { key: 'Bull Flag + Destek/Direnç Kırılımı', members: ['Bull Flag', 'Destek/Direnç Kırılımı'], size: 2, n: 87, winRate: 56, avgNet: 4.6 },
    { key: 'Bull Flag + Destek/Direnç Kırılımı + Hacim Anomalisi', members: ['Bull Flag', 'Destek/Direnç Kırılımı', 'Hacim Anomalisi'], size: 3, n: 30, winRate: 57, avgNet: 7.8 },
  ];

  it('üçlü tümü aktifse üçlüyü seçer (daha spesifik)', () => {
    const best = detectBestCombo(['Bull Flag', 'Destek/Direnç Kırılımı', 'Hacim Anomalisi', 'RSI Seviyesi'], strong);
    assert.equal(best!.size, 3);
  });

  it('yalnız ikili üyeleri aktifse ikiliyi seçer', () => {
    const best = detectBestCombo(['Bull Flag', 'Destek/Direnç Kırılımı'], strong);
    assert.equal(best!.size, 2);
  });

  it('eşleşme yoksa null', () => {
    assert.equal(detectBestCombo(['RSI Seviyesi', 'MACD Kesişimi'], strong), null);
  });
});
