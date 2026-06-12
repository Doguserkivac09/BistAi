/**
 * Uzun Vade Kompozit — FAZ 1 testleri
 * Çalıştır: npm test
 *
 * Kapsam:
 *  - Sağlam+ucuz şirket → yüksek bileşik skor
 *  - Sektöre göre pahalı → peer bileşeni skoru aşağı çeker
 *  - Beneish şüpheli / Altman sıkıntı → kalite çarpanı kısar
 *  - Banka: sağlık+büyüme null → ağırlıklar yeniden normalize, ceza YOK
 *  - investmentScore yok → skorlanamaz (null)
 *  - deriveHealthScore: Piotroski/Altman/kazanç kalitesi birleşimi + banka null
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { computeLongTermComposite, deriveHealthScore } from '../long-term-runner'
import type { FundamentalHealth } from '../fundamental-health'

describe('long-term: computeLongTermComposite', () => {
  it('sağlam + ucuz + büyüyen → yüksek skor (tüm bileşenler)', () => {
    const r = computeLongTermComposite({
      investmentScore: 70, healthScore: 80, relativeScore: 70, growthScore: 60,
      beneishFlag: 'temiz', altmanZone: 'güvenli',
    })
    assert.ok(r)
    // 70×.35 + 80×.25 + 70×.20 + 60×.20 = 70.5 → 71
    assert.equal(r.score, 71)
    assert.equal(r.qualityMultiplier, 1)
    assert.equal(r.componentsUsed, 4)
  })

  it('sektöre göre pahalı (peer düşük) → skor belirgin düşer', () => {
    const cheap = computeLongTermComposite({
      investmentScore: 60, healthScore: 60, relativeScore: 80, growthScore: 60,
      beneishFlag: 'temiz', altmanZone: 'güvenli',
    })!
    const expensive = computeLongTermComposite({
      investmentScore: 60, healthScore: 60, relativeScore: 15, growthScore: 60,
      beneishFlag: 'temiz', altmanZone: 'güvenli',
    })!
    assert.ok(cheap.score - expensive.score >= 10)
  })

  it('Beneish şüpheli → ×0.80 kısma', () => {
    const r = computeLongTermComposite({
      investmentScore: 70, healthScore: 80, relativeScore: 70, growthScore: 60,
      beneishFlag: 'şüpheli', altmanZone: 'güvenli',
    })!
    // 70.5 × 0.8 = 56.4 → 56
    assert.equal(r.score, 56)
    assert.equal(r.qualityMultiplier, 0.8)
  })

  it('Beneish şüpheli + Altman sıkıntı → bileşik kısma (×0.68)', () => {
    const r = computeLongTermComposite({
      investmentScore: 70, healthScore: 80, relativeScore: 70, growthScore: 60,
      beneishFlag: 'şüpheli', altmanZone: 'sıkıntı',
    })!
    // 70.5 × 0.8 × 0.85 = 47.94 → 48
    assert.equal(r.score, 48)
    assert.equal(r.qualityMultiplier, 0.68)
  })

  it('banka: sağlık+büyüme yok → kalan bileşenlerle normalize, ceza yok', () => {
    const r = computeLongTermComposite({
      investmentScore: 70, healthScore: null, relativeScore: 60, growthScore: null,
      beneishFlag: null, altmanZone: null,
    })!
    // 70×(.35/.55) + 60×(.20/.55) = 66.36 → 66
    assert.equal(r.score, 66)
    assert.equal(r.componentsUsed, 2)
  })

  it('investmentScore yoksa skorlanamaz', () => {
    const r = computeLongTermComposite({
      investmentScore: null, healthScore: 80, relativeScore: 70, growthScore: 60,
      beneishFlag: null, altmanZone: null,
    })
    assert.equal(r, null)
  })
})

// ── deriveHealthScore ───────────────────────────────────────────────────────

function makeHealth(overrides: Partial<{
  isFinancial: boolean
  piotroskiScore: number | null
  altmanZone: 'güvenli' | 'gri' | 'sıkıntı' | null
  eqRating: 'iyi' | 'orta' | 'zayıf' | null
}> = {}): FundamentalHealth {
  const o = { isFinancial: false, piotroskiScore: 8, altmanZone: 'güvenli' as const, eqRating: 'iyi' as const, ...overrides }
  return {
    isFinancial: o.isFinancial,
    piotroski: {
      applicable: o.piotroskiScore !== null,
      score: o.piotroskiScore,
      max: 9,
      criteria: [],
      rating: null,
    },
    altman: {
      applicable: o.altmanZone !== null,
      z: o.altmanZone === 'güvenli' ? 6 : o.altmanZone === 'gri' ? 3 : 0.5,
      zone: o.altmanZone,
      components: { x1: null, x2: null, x3: null, x4: null },
      variant: "Z''",
    },
    beneish: { applicable: false, m: null, flag: null, componentsUsed: 0 },
    dupont: {} as FundamentalHealth['dupont'],
    earningsQuality: {
      accrualsRatio: null, fcfConversion: null, fcfPositiveYears: 0, totalYears: 0,
      rating: o.eqRating,
    },
    trends: {} as FundamentalHealth['trends'],
  }
}

describe('long-term: deriveHealthScore', () => {
  it('güçlü sağlık: Piotroski 8/9 + Altman güvenli + kalite iyi → ~89', () => {
    const s = deriveHealthScore(makeHealth())
    // (8/9×100)×.5 + 90×.3 + 90×.2 = 89.4 → 89
    assert.equal(s, 89)
  })

  it('zayıf sağlık: Piotroski 2/9 + Altman sıkıntı + kalite zayıf → düşük', () => {
    const s = deriveHealthScore(makeHealth({ piotroskiScore: 2, altmanZone: 'sıkıntı', eqRating: 'zayıf' }))!
    assert.ok(s < 30, `beklenen <30, gelen ${s}`)
  })

  it('banka/finansal → null (uygulanmaz)', () => {
    assert.equal(deriveHealthScore(makeHealth({ isFinancial: true })), null)
  })

  it('sağlık verisi yok → null', () => {
    assert.equal(deriveHealthScore(null), null)
  })

  it('kısmi veri: yalnız Piotroski → ağırlık yeniden normalize', () => {
    const s = deriveHealthScore(makeHealth({ altmanZone: null, eqRating: null, piotroskiScore: 6 }))
    // 6/9×100 = 66.7 → 67 (tek bileşen, tam ağırlık)
    assert.equal(s, 67)
  })
})
