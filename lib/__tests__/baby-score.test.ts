/**
 * Baby Score — Fixture Tests
 * Çalıştır: npm test
 *
 * Kapsam (BEBEK-HISSELER-PROMPTU §7):
 *  - İdeal "bebek" kurulumu → yüksek skor
 *  - Likidite tabanı: ADV < ~1M TL → tamamen elenir (excluded)
 *  - "Henüz yükselmemiş" çift güvence: zaten koşmuş hisse → extendedGate ×0.50 + düşük timing
 *  - Anti-pump: temelsiz dikey sıçrama → ×0.55 + 🎭 rozet
 *  - Banka/finansal → ignition pillar düşer (componentsUsed=4), çökmeden skorlanır
 *  - Yapısal kıtlık: düşük float + küçük cap → yüksek scarcity; tersi → düşük
 *  - Kalite kapısı: Beneish şüpheli / Piotroski<3 → çarpan kısması
 *  - Sessiz birikim: OBV↑ + fiyat yatay → yüksek accumulation; dağıtım → düşük
 *  - Risk rozetleri: çok düşük float, veri eksik, düşen bıçak
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { computeBabyScore, type BabyScoreInputs } from '../baby-score'

// ── İdeal "bebek" kurulum fixture'ı ─────────────────────────────────────────
function ideal(over: Partial<BabyScoreInputs> = {}): BabyScoreInputs {
  return {
    freeFloat: 0.1, // düşük float
    marketCap: 1.5e9, // küçük cap
    advTL: 5e6, // sağlıklı likidite
    obvTrend: 0.45, // güçlü birikim
    priceSlope60: 5, // fiyat ~yatay (stealth)
    udvr: 0.6, // talep baskın
    vcpRatio: 1.6, // volatilite daralıyor
    higherLowsCount: 2, // yükselen dipler
    closeBelowSMA50: false,
    growthScore: 70,
    netIncomeCagrReal: 25,
    earningsGrowthReal: 45, // ivmeleniyor
    turnaround: false,
    growthVerdict: 'büyüyor',
    isFinancial: false,
    catalystState: 'supportive',
    themeMember: true,
    ipoMonths: 10,
    pos52: 0.3, // 52H alt-orta bant
    rangeWidth: 1.5, // yıl içinde koşmamış
    rsi14: 50,
    r60: 0.1,
    beneishFlag: 'temiz',
    piotroski: 6,
    altmanZone: 'güvenli',
    beta: 1.1,
    atrPctDaily: 4,
    recentVerticalSpike: false,
    ...over,
  }
}

describe('computeBabyScore — temel davranış', () => {
  it('ideal kurulum → yüksek skor, elenmez, operasyon rozeti yok', () => {
    const r = computeBabyScore(ideal())
    assert.equal(r.excluded, false)
    assert.ok(r.score >= 65, `skor düşük: ${r.score}`)
    assert.equal(r.qualityMultiplier, 1)
    assert.equal(r.extendedMultiplier, 1)
    assert.ok(!r.riskFlags.includes('🎭 olası operasyon'))
    assert.equal(r.componentsUsed, 5)
  })

  it('ADV < ~1M TL → tamamen elenir (excluded)', () => {
    const r = computeBabyScore(ideal({ advTL: 800_000 }))
    assert.equal(r.excluded, true)
    assert.equal(r.score, 0)
  })

  it('ADV 1M–2M → kalite kapısı ×0.60', () => {
    const r = computeBabyScore(ideal({ advTL: 1.5e6 }))
    assert.equal(r.excluded, false)
    assert.equal(r.qualityMultiplier, 0.6)
    assert.ok(r.riskFlags.includes('🚩 düşük likidite'))
  })
})

describe('"henüz yükselmemiş" çift güvence', () => {
  it('zaten koşmuş (pos52 0.95 + rangeWidth 3.5) → extendedGate ×0.50 ve daha düşük skor', () => {
    const base = computeBabyScore(ideal())
    const ran = computeBabyScore(ideal({ pos52: 0.95, rangeWidth: 3.5, r60: 0.4, rsi14: 72 }))
    assert.equal(ran.extendedMultiplier, 0.5)
    assert.ok(ran.score < base.score, `koşmuş skoru düşmedi: ${ran.score} ≥ ${base.score}`)
    assert.ok(ran.components.timing < base.components.timing)
  })

  it('pos52 > 0.85 (tepeye yakın) → extendedGate ×0.75', () => {
    const r = computeBabyScore(ideal({ pos52: 0.88, rangeWidth: 2.0 }))
    assert.equal(r.extendedMultiplier, 0.75)
  })

  it('RSI aşırı alım (75) → timing bileşeni düşer', () => {
    const calm = computeBabyScore(ideal({ rsi14: 50 }))
    const hot = computeBabyScore(ideal({ rsi14: 75 }))
    assert.ok(hot.components.timing < calm.components.timing)
  })
})

describe('anti-pump (operasyon filtresi)', () => {
  it('temelsiz dikey sıçrama (spike + zayıf temel) → ×0.55 + 🎭', () => {
    const r = computeBabyScore(ideal({ recentVerticalSpike: true, growthScore: 30, earningsGrowthReal: -10 }))
    assert.ok(r.riskFlags.includes('🎭 olası operasyon'))
    assert.ok(r.qualityMultiplier <= 0.55 + 1e-9, `çarpan: ${r.qualityMultiplier}`)
  })

  it('güçlü temelli sıçrama → anti-pump tetiklenmez (operasyon değil)', () => {
    const r = computeBabyScore(ideal({ recentVerticalSpike: true, growthScore: 80, earningsGrowthReal: 60 }))
    assert.ok(!r.riskFlags.includes('🎭 olası operasyon'))
  })
})

describe('banka/finansal', () => {
  it('isFinancial → ignition pillar düşer (componentsUsed=4), çökmeden skorlanır', () => {
    const r = computeBabyScore(ideal({ isFinancial: true, growthScore: null }))
    assert.equal(r.excluded, false)
    assert.equal(r.components.ignition, null)
    assert.equal(r.componentsUsed, 4)
    assert.ok(r.score > 0)
  })
})

describe('yapısal kıtlık', () => {
  it('düşük float + küçük cap → yüksek scarcity; yüksek float + büyük cap → düşük', () => {
    const small = computeBabyScore(ideal({ freeFloat: 0.1, marketCap: 1.5e9 }))
    const big = computeBabyScore(ideal({ freeFloat: 0.75, marketCap: 80e9 }))
    assert.ok(small.components.scarcity > big.components.scarcity + 25,
      `kıtlık ayrışmadı: ${small.components.scarcity} vs ${big.components.scarcity}`)
  })

  it('çok düşük float (<0.03) → ×0.80 + 🔒 rozet', () => {
    const r = computeBabyScore(ideal({ freeFloat: 0.02 }))
    assert.ok(r.riskFlags.includes('🔒 çok düşük float'))
    assert.ok(r.qualityMultiplier <= 0.8 + 1e-9)
  })

  it('freeFloat null → ❓ veri eksik rozeti + çökmez', () => {
    const r = computeBabyScore(ideal({ freeFloat: null }))
    assert.ok(r.riskFlags.includes('❓ veri eksik'))
    assert.equal(r.excluded, false)
  })
})

describe('kalite kapısı', () => {
  it('Beneish şüpheli → ×0.65', () => {
    const r = computeBabyScore(ideal({ beneishFlag: 'şüpheli' }))
    assert.ok(Math.abs(r.qualityMultiplier - 0.65) < 1e-9, `çarpan: ${r.qualityMultiplier}`)
  })

  it('Piotroski < 3 → ×0.80', () => {
    const r = computeBabyScore(ideal({ piotroski: 2 }))
    assert.ok(Math.abs(r.qualityMultiplier - 0.8) < 1e-9)
  })

  it('Altman sıkıntı → ×0.85', () => {
    const r = computeBabyScore(ideal({ altmanZone: 'sıkıntı' }))
    assert.ok(Math.abs(r.qualityMultiplier - 0.85) < 1e-9)
  })
})

describe('sessiz birikim izi', () => {
  it('OBV↑ + fiyat yatay → yüksek accumulation; dağıtım (OBV↓) → düşük', () => {
    const acc = computeBabyScore(ideal({ obvTrend: 0.5, priceSlope60: 3, udvr: 0.62 }))
    const dist = computeBabyScore(ideal({ obvTrend: -0.5, priceSlope60: 3, udvr: 0.38, higherLowsCount: 0 }))
    assert.ok(acc.components.accumulation > dist.components.accumulation + 25,
      `birikim ayrışmadı: ${acc.components.accumulation} vs ${dist.components.accumulation}`)
  })
})

describe('temel ateşleme', () => {
  it('turnaround (zarardan kâra) → ignition yükselir', () => {
    const flat = computeBabyScore(ideal({ earningsGrowthReal: null, growthVerdict: 'ılımlı', turnaround: false }))
    const turn = computeBabyScore(ideal({ earningsGrowthReal: null, growthVerdict: 'ılımlı', turnaround: true }))
    assert.ok((turn.components.ignition ?? 0) > (flat.components.ignition ?? 0))
  })
})

describe('düşen bıçak rozeti', () => {
  it('pos52<0.20 + düşen trend → 📉', () => {
    const r = computeBabyScore(ideal({ pos52: 0.12, priceSlope60: -30, closeBelowSMA50: true }))
    assert.ok(r.riskFlags.includes('📉 düşen bıçak'))
  })
})
