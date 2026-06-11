/**
 * Decision Engine — FAZ 0 testleri
 * Çalıştır: npm test
 *
 * Kapsam:
 *  - BUG-E: sectorAlign faktörü (hizalı +, ters −, nötr 0)
 *  - BUG-E: volumeConfirm faktörü (rel_vol5 ≥1.5 → +, <0.7 → −, arada 0)
 *  - BUG-C: girdi eşitliği — aynı girdiyle iki çağrı birebir aynı çıktı
 *  - kapRisk (haber tabanlı event riski) skoru düşürür
 *  - signal-horizons: kanonik harita ↔ min eval günü senkronu (BUG-A regresyon)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { computeDecision, type DecisionInput } from '../decision-engine'
import {
  SIGNAL_CANONICAL_FIELD,
  HORIZON_DAYS,
  getCanonicalField,
  getMinEvalDays,
} from '../signal-horizons'
import type { StockSignal } from '@/types'
import type { SectorMomentum } from '../sector-engine'

// ── Fixture'lar ─────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<StockSignal> = {}): StockSignal {
  return {
    type: 'Trend Başlangıcı',
    sembol: 'TEST',
    severity: 'güçlü',
    direction: 'yukari',
    data: {},
    ...overrides,
  } as StockSignal
}

function makeSector(compositeScore: number): SectorMomentum {
  return {
    sectorId: 'sanayi',
    sectorName: 'Sanayi',
    shortName: 'Sanayi',
    priceMomentum: compositeScore,
    perf20d: 0,
    perf60d: 0,
    macroAlignment: 0,
    compositeScore,
    signal: 'neutral',
    color: '',
    reasoning: '',
    symbolCount: 5,
    topPerformers: [],
    bottomPerformers: [],
  } as SectorMomentum
}

function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    signals: [makeSignal(), makeSignal({ type: 'MACD Kesişimi' }), makeSignal({ type: 'Higher Lows' })],
    scannedAt: new Date().toISOString(),
    dataSource: 'db_snapshot',
    ...overrides,
  }
}

// ── Testler ─────────────────────────────────────────────────────────────────

describe('decision-engine: sectorAlign (BUG-E / P1-1)', () => {
  it('yukarı sinyal + güçlü sektör momentumu → pozitif sectorAlign, skor artar', () => {
    const without = computeDecision(baseInput())
    const withSector = computeDecision(baseInput({ sectorMomentum: makeSector(50) }))
    assert.equal(withSector.factors.sectorAlign, 5)
    assert.ok(withSector.score >= without.score)
  })

  it('yukarı sinyal + negatif sektör momentumu → negatif sectorAlign, skor düşer', () => {
    const without = computeDecision(baseInput())
    const withSector = computeDecision(baseInput({ sectorMomentum: makeSector(-50) }))
    assert.equal(withSector.factors.sectorAlign, -6)
    assert.ok(withSector.score <= without.score)
  })

  it('zayıf sektör momentumu (|skor|<30) → faktör 0', () => {
    const out = computeDecision(baseInput({ sectorMomentum: makeSector(10) }))
    assert.equal(out.factors.sectorAlign, 0)
  })

  it('sektör verisi yoksa faktör 0 (geri uyumluluk)', () => {
    const out = computeDecision(baseInput())
    assert.equal(out.factors.sectorAlign, 0)
  })
})

describe('decision-engine: volumeConfirm (BUG-E / P1-2)', () => {
  it('rel_vol5 ≥ 1.5 → +4', () => {
    const out = computeDecision(baseInput({ relVol5: 2.1 }))
    assert.equal(out.factors.volumeConfirm, 4)
  })

  it('rel_vol5 < 0.7 (cansız tahta) → −4', () => {
    const out = computeDecision(baseInput({ relVol5: 0.4 }))
    assert.equal(out.factors.volumeConfirm, -4)
  })

  it('normal hacim (0.7-1.5) → 0', () => {
    const out = computeDecision(baseInput({ relVol5: 1.0 }))
    assert.equal(out.factors.volumeConfirm, 0)
  })

  it('rel_vol5 null/verilmemiş → 0', () => {
    const out = computeDecision(baseInput())
    assert.equal(out.factors.volumeConfirm, 0)
  })
})

describe('decision-engine: girdi eşitliği (BUG-C)', () => {
  it('aynı girdi → birebir aynı karar (skor, rating, faktörler)', () => {
    const input = baseInput({
      sectorMomentum: makeSector(40),
      relVol5: 1.8,
      regime: 'bull_trend',
      kapRisk: { var: true, mesaj: 'Bedelli sermaye artırımı' },
    })
    const a = computeDecision(input)
    const b = computeDecision(input)
    assert.equal(a.score, b.score)
    assert.equal(a.rating, b.rating)
    assert.deepEqual(a.factors, b.factors)
  })

  it('kapRisk (haber tabanlı event riski) skoru düşürür ve kapEvent=-10', () => {
    const clean = computeDecision(baseInput())
    const risky = computeDecision(baseInput({ kapRisk: { var: true, mesaj: 'KAP-tipi event' } }))
    assert.equal(risky.factors.kapEvent, -10)
    assert.ok(risky.score < clean.score)
  })
})

describe('signal-horizons: kanonik ufuk ↔ min eval günü senkronu (BUG-A)', () => {
  it('haritadaki HER tip için min eval günü kanonik ufukla eşit', () => {
    for (const [tip, field] of Object.entries(SIGNAL_CANONICAL_FIELD)) {
      assert.equal(
        getMinEvalDays(tip),
        HORIZON_DAYS[field],
        `${tip}: min eval günü (${getMinEvalDays(tip)}) kanonik ufukla (${HORIZON_DAYS[field]}) eşleşmiyor`,
      )
    }
  })

  it('eski bug senaryosu: formasyon/pre-signal tipleri artık 7 günde kapanmıyor', () => {
    // Eski SIGNAL_MIN_DAYS tablosunda olmayan tipler varsayılan 7 alıyordu
    assert.equal(getMinEvalDays('Cup & Handle'), 30)
    assert.equal(getMinEvalDays('Ters Omuz-Baş-Omuz'), 30)
    assert.equal(getMinEvalDays('Altın Çapraz Yaklaşıyor'), 30)
    assert.equal(getMinEvalDays('Higher Lows'), 14)
    assert.equal(getMinEvalDays('Bull Flag'), 14)
    assert.equal(getMinEvalDays('Çift Dip'), 14)
  })

  it('bilinmeyen tip → varsayılan 7g (return_7d)', () => {
    assert.equal(getCanonicalField('Bilinmeyen Sinyal'), 'return_7d')
    assert.equal(getMinEvalDays('Bilinmeyen Sinyal'), 7)
  })
})
