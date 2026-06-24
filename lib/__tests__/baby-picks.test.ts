/**
 * Baby Picks (forward-tracking) — Fixture Tests
 * Çalıştır: npm test
 *
 * Kapsam:
 *  - selectBabyPicks: yalnız temiz kohort (güçlü/umut + risksiz + likit + skor eşiği), sıralı, sınırlı
 *  - computeBabyPicksPerformance: ufuk bazlı winRate/beatRate/avgReturn/alpha; boş ufuk → n=0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { selectBabyPicks, computeBabyPicksPerformance, type EvaluatedPick } from '../baby-picks'
import type { BabyRow } from '../baby-runner'

function row(over: Partial<BabyRow> = {}): BabyRow {
  return {
    sembol: 'TEST',
    sector: 'sanayi',
    babyScore: 72,
    verdict: 'umut vadeden',
    components: { scarcity: 80, accumulation: 70, ignition: null, catalyst: 50, timing: 90 },
    qualityMultiplier: 1,
    extendedMultiplier: 1,
    componentsUsed: 4,
    riskFlags: [],
    freeFloat: 15,
    marketCap: 2e9,
    floatAdjCap: 3e8,
    advTL: 5e6,
    ipoMonths: 12,
    pos52: 0.3,
    rangeWidth: 1.6,
    rsi14: 50,
    r60: 0.05,
    obvTrend: 0.4,
    udvr: 0.6,
    vcpRatio: 1.5,
    growthScore: null,
    growthVerdict: null,
    catalystState: 'supportive',
    themeMember: false,
    lastClose: 10,
    ...over,
  }
}

describe('selectBabyPicks', () => {
  it('temiz güçlü/umut + likit adayı seçer', () => {
    const picks = selectBabyPicks([row({ sembol: 'CLEAN', babyScore: 78, verdict: 'güçlü kurulum' })])
    assert.equal(picks.length, 1)
    assert.equal(picks[0].sembol, 'CLEAN')
    assert.equal(picks[0].entry_price, 10)
  })

  it('tehlike rozetli (operasyon) adayı eler', () => {
    const picks = selectBabyPicks([row({ sembol: 'PUMP', riskFlags: ['🎭 olası operasyon'] })])
    assert.equal(picks.length, 0)
  })

  it('skor eşiği altını + izlemede verdict + illikiti eler', () => {
    const picks = selectBabyPicks([
      row({ sembol: 'LOW', babyScore: 60 }), // <65
      row({ sembol: 'WATCH', verdict: 'izlemede' }),
      row({ sembol: 'ILLIQ', advTL: 1e6 }), // <3M
    ])
    assert.equal(picks.length, 0)
  })

  it('skora göre sıralar ve maxPicks uygular', () => {
    const rows = [
      row({ sembol: 'A', babyScore: 70 }),
      row({ sembol: 'B', babyScore: 90, verdict: 'güçlü kurulum' }),
      row({ sembol: 'C', babyScore: 80, verdict: 'güçlü kurulum' }),
    ]
    const picks = selectBabyPicks(rows, { maxPicks: 2 })
    assert.deepEqual(picks.map((p) => p.sembol), ['B', 'C'])
  })
})

describe('computeBabyPicksPerformance', () => {
  function ep(over: Partial<EvaluatedPick>): EvaluatedPick {
    return {
      ret_4w: null, bist_ret_4w: null,
      ret_12w: null, bist_ret_12w: null,
      ret_26w: null, bist_ret_26w: null,
      ...over,
    }
  }

  it('4h: winRate/beatRate/avgReturn/alpha doğru hesaplar', () => {
    const rows: EvaluatedPick[] = [
      ep({ ret_4w: 20, bist_ret_4w: 5 }),   // kazanan + BIST'i geçti
      ep({ ret_4w: -10, bist_ret_4w: 5 }),  // kaybeden + BIST altı
      ep({ ret_4w: 30, bist_ret_4w: 40 }),  // kazanan ama BIST altı
    ]
    const perf = computeBabyPicksPerformance(rows)
    const h4 = perf.horizons.find((h) => h.key === '4w')!
    assert.equal(h4.n, 3)
    assert.equal(h4.winRate, 66.7) // 2/3
    assert.equal(h4.beatRate, 33.3) // 1/3
    assert.equal(h4.avgReturn, 13.3) // (20-10+30)/3
    assert.equal(h4.avgBistReturn, 16.7) // (5+5+40)/3
    assert.equal(h4.alpha, -3.3)
  })

  it('ufuk dolmamış → n=0, oranlar null', () => {
    const perf = computeBabyPicksPerformance([ep({ ret_4w: 10, bist_ret_4w: 2 })])
    const h26 = perf.horizons.find((h) => h.key === '26w')!
    assert.equal(h26.n, 0)
    assert.equal(h26.winRate, null)
    assert.equal(h26.avgReturn, null)
  })

  it('totalPicks tüm satırları sayar', () => {
    const perf = computeBabyPicksPerformance([ep({}), ep({}), ep({ ret_4w: 5, bist_ret_4w: 1 })])
    assert.equal(perf.totalPicks, 3)
  })
})
