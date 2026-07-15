/**
 * Gelişmiş AI Analiz — rapor tazeleme (TTL) testleri. Çalıştır: npm test
 *
 * TTL piyasa durumuna göre belirlenir: seans açıkken kısa (veri canlı),
 * kapalıyken uzun (boşuna API maliyeti yok).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { advancedReportTtlMs } from '../hisse-ai-analiz';

const H = 60 * 60 * 1000;
/** TR saati (UTC+3) verilen bir anı UTC Date'e çevirir. */
const tr = (iso: string) => new Date(`${iso}+03:00`);

describe('advancedReportTtlMs (BIST)', () => {
  it('seans açıkken 3 saat (Salı 13:00 TR)', () => {
    assert.equal(advancedReportTtlMs('BIST', tr('2026-07-14T13:00:00')), 3 * H);
  });

  it('açılış öncesi 1 saat (Salı 09:00 TR)', () => {
    assert.equal(advancedReportTtlMs('BIST', tr('2026-07-14T09:00:00')), 1 * H);
  });

  it('kapanış sonrası 12 saat (Salı 19:00 TR)', () => {
    assert.equal(advancedReportTtlMs('BIST', tr('2026-07-14T19:00:00')), 12 * H);
  });

  it('hafta sonu 12 saat (Cumartesi 13:00 TR)', () => {
    assert.equal(advancedReportTtlMs('BIST', tr('2026-07-11T13:00:00')), 12 * H);
  });

  it('resmi tatilde 12 saat (15 Tem 2026 — Demokrasi Bayramı)', () => {
    assert.equal(advancedReportTtlMs('BIST', tr('2026-07-15T13:00:00')), 12 * H);
  });

  it('seans TTL < kapalı TTL (maliyet/tazelik dengesi)', () => {
    const open = advancedReportTtlMs('BIST', tr('2026-07-14T13:00:00'));
    const closed = advancedReportTtlMs('BIST', tr('2026-07-14T22:00:00'));
    assert.ok(open < closed);
  });
});
