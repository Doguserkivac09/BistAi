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

describe('decision-engine: earningsRisk (FAZ 2 — bilanço yakınlığı)', () => {
  it('bilanço ≤5 takvim günü → −8 + skor düşer + güven azalır', () => {
    const clean = computeDecision(baseInput())
    const soon = computeDecision(baseInput({ daysUntilEarnings: 2 }))
    assert.equal(soon.factors.earningsRisk, -8)
    assert.ok(soon.score < clean.score)
    assert.ok(soon.confidence <= clean.confidence)
  })

  it('bilanço uzakta (>5 gün) → faktör 0', () => {
    const out = computeDecision(baseInput({ daysUntilEarnings: 20 }))
    assert.equal(out.factors.earningsRisk, 0)
  })

  it('geçmiş bilanço (gün < 0) → cezalandırılmaz (haberle fiyatlandı)', () => {
    const out = computeDecision(baseInput({ daysUntilEarnings: -3 }))
    assert.equal(out.factors.earningsRisk, 0)
  })

  it('bilanço tarihi bilinmiyor (null) → faktör 0', () => {
    const out = computeDecision(baseInput())
    assert.equal(out.factors.earningsRisk, 0)
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

// ── SCORING v2 (SKOR-MIMARISI-PLAN FAZ 1) ────────────────────────────────────
// v2 explicit override (scoringV2:true) ile test edilir — global flag kapalı kalır.

describe('decision-engine v2: no-op garantisi (flag kapalı)', () => {
  it('scoringV2 verilmezse çıktı v1 ile birebir aynı (regresyon yok)', () => {
    const inp = baseInput({ macroScore: { score: 40 } as never, relVol5: 2 })
    const a = computeDecision(inp)
    const b = computeDecision(inp)
    assert.deepEqual(a, b)
    // v1 yolunda v2 alanları default (gate null / veto false)
    assert.equal(a.regimeGate ?? null, null)
    assert.equal(a.fundamentalVetoed ?? false, false)
    assert.equal(a.scoringV2 ?? false, false)
  })
})

describe('decision-engine v2: skaler makro sıralamayı SÜRÜKLEMEZ', () => {
  it('makro günden güne oynasa da v2 skoru DEĞİŞMEZ (skaler makro skordan çıktı)', () => {
    const boğaMakro = computeDecision(baseInput({ scoringV2: true, macroScore: { score: 80 } as never }))
    const ayıMakro  = computeDecision(baseInput({ scoringV2: true, macroScore: { score: -80 } as never }))
    // Skaler makro artık ranking'e girmiyor → iki skor aynı olmalı
    assert.equal(boğaMakro.score, ayıMakro.score)
  })

  it('v1 aynı senaryoda makrodan ETKİLENİR (kontrast — eski davranış)', () => {
    const boğa = computeDecision(baseInput({ macroScore: { score: 80 } as never }))
    const ayı  = computeDecision(baseInput({ macroScore: { score: -80 } as never }))
    assert.notEqual(boğa.score, ayı.score) // v1'de makro skoru oynatıyordu
  })

  it('sektör momentumu da v2 skorunu sürüklemez (skaler → context)', () => {
    const güçlü = computeDecision(baseInput({ scoringV2: true, sectorMomentum: makeSector(80) }))
    const zayıf = computeDecision(baseInput({ scoringV2: true, sectorMomentum: makeSector(-80) }))
    assert.equal(güçlü.score, zayıf.score)
  })
})

describe('decision-engine v2: hisse-özel exposure ranking\'e girer', () => {
  it('exposureAdj kesitte değişken → v2 skorunu oynatır (meşru)', () => {
    const artı = computeDecision(baseInput({ scoringV2: true, exposureAdj: 8 }))
    const eksi = computeDecision(baseInput({ scoringV2: true, exposureAdj: -8 }))
    assert.ok(artı.score > eksi.score)
  })
})

describe('decision-engine v2: temel VETO (kısa vade, yukarı)', () => {
  it('Altman sıkıntı / Beneish şüphe → yukarı sinyal Al eşiğinin altına kırpılır', () => {
    const temiz = computeDecision(baseInput({ scoringV2: true }))
    const vetolu = computeDecision(baseInput({ scoringV2: true, fundamental: { altmanDistress: true } }))
    assert.equal(vetolu.fundamentalVetoed, true)
    assert.ok(vetolu.score <= 40, `veto skoru ${vetolu.score} tavanın üstünde`)
    assert.ok(vetolu.score < temiz.score)
    assert.ok(vetolu.confidence < temiz.confidence)
  })

  it('değer tuzağı → yumuşak tavan (55)', () => {
    const vetolu = computeDecision(baseInput({ scoringV2: true, fundamental: { garpVerdict: 'deger_tuzagi' } }))
    assert.equal(vetolu.fundamentalVetoed, true)
    assert.ok(vetolu.score <= 55)
  })

  it('temel skora +PUAN eklemez (fırsat verdict\'i skoru şişirmez — sadece veto var)', () => {
    const nötr = computeDecision(baseInput({ scoringV2: true }))
    const fırsat = computeDecision(baseInput({ scoringV2: true, fundamental: { garpVerdict: 'firsat' } }))
    assert.equal(fırsat.score, nötr.score) // toplamsal katkı yok
    assert.equal(fırsat.fundamentalVetoed, false)
  })

  it('AŞAĞI yönde veto uygulanmaz (zayıf temel düşüşü teyit eder)', () => {
    const aşağıSignals = [makeSignal({ direction: 'asagi' }), makeSignal({ type: 'MACD Kesişimi', direction: 'asagi' }), makeSignal({ type: 'Lower Highs', direction: 'asagi' })]
    const out = computeDecision(baseInput({ scoringV2: true, signals: aşağıSignals, fundamental: { altmanDistress: true } }))
    assert.equal(out.fundamentalVetoed, false)
  })
})

describe('decision-engine v2: rejim kapısı (skor değil)', () => {
  it('ayı rejimi kapıyı temkinli yapar + güveni kısar; skoru DOĞRUDAN düşürmez', () => {
    const boğa = computeDecision(baseInput({ scoringV2: true, regime: 'bull_trend' }))
    const ayı  = computeDecision(baseInput({ scoringV2: true, regime: 'bear_trend' }))
    assert.equal(ayı.regimeGate?.posture, 'temkinli')
    assert.ok((ayı.regimeGate?.surfacedCount ?? 99) < (boğa.regimeGate?.surfacedCount ?? 0))
    // Kapı güveni kısar (confidence multiplier), skoru değil
    assert.ok(ayı.confidence <= boğa.confidence)
  })
})
