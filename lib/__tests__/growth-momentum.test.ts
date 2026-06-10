/**
 * Growth Momentum — Fixture Tests
 * Çalıştır: npm test
 *
 * Kapsam:
 *  - Büyüyen şirket → yüksek skor
 *  - Küçülen şirket → düşük skor / "küçülüyor"
 *  - EPS seyrelmesi: net kâr büyür ama hisse sayısı daha hızlı artarsa EPS bileşeni
 *    net kâr bileşeninden düşük olmalı (asıl ayırt edici özellik)
 *  - Banka/finansal → uygulanmaz
 *  - Yetersiz veri (<2 yıl) → uygulanmaz
 *  - BIST enflasyon: nominal yüksek ama reel negatif → US-nominal eşdeğerinden düşük skor
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { computeGrowthMomentum } from '../growth-momentum'
import type { FinancialYear } from '../financial-statements'

// ── Fixture factory ─────────────────────────────────────────────────────────
function emptyYear(year: number): FinancialYear {
  return {
    year,
    revenue: null,
    costOfRevenue: null,
    grossProfit: null,
    ebit: null,
    netIncome: null,
    totalAssets: null,
    totalLiabilities: null,
    currentAssets: null,
    currentLiabilities: null,
    equity: null,
    retainedEarnings: null,
    longTermDebt: null,
    totalDebt: null,
    operatingCashFlow: null,
    freeCashFlow: null,
    shares: null,
    receivables: null,
    netPPE: null,
    sga: null,
    depreciation: null,
  }
}

/** revenue, netIncome, shares serilerinden çok-yıllı non-financial fixture üretir. */
function makeYears(
  revenue: number[],
  netIncome: number[],
  shares: number[],
): FinancialYear[] {
  return revenue.map((rev, i) => {
    const y = emptyYear(2020 + i)
    y.revenue = rev
    y.netIncome = netIncome[i]
    y.shares = shares[i]
    y.grossProfit = Math.round(rev * 0.4) // marj yapısı → non-financial
    y.currentAssets = Math.round(rev * 0.6)
    y.currentLiabilities = Math.round(rev * 0.3)
    y.totalAssets = Math.round(rev * 1.5)
    return y
  })
}

const flat = (v: number, n = 5) => Array(n).fill(v)

// ── Testler ─────────────────────────────────────────────────────────────────
describe('computeGrowthMomentum', () => {
  it('büyüyen şirket → yüksek skor, applicable', () => {
    const years = makeYears(
      [100, 120, 145, 175, 210],
      [10, 13, 17, 22, 28],
      flat(1000),
    )
    const r = computeGrowthMomentum(years, { inflationYoy: null })
    assert.equal(r.applicable, true)
    assert.ok(r.score >= 70, `skor düşük geldi: ${r.score}`)
    assert.ok(['büyüyor', 'güçlü büyüme'].includes(r.verdict), `verdict: ${r.verdict}`)
    assert.ok((r.revenueCagrReal ?? 0) > 15)
    assert.ok((r.epsCagr ?? 0) > 15)
  })

  it('küçülen şirket → düşük skor, "küçülüyor"', () => {
    const years = makeYears(
      [200, 180, 160, 140, 120],
      [20, 15, 10, 6, 3],
      flat(1000),
    )
    const r = computeGrowthMomentum(years, { inflationYoy: null })
    assert.equal(r.applicable, true)
    assert.ok(r.score < 40, `skor yüksek geldi: ${r.score}`)
    assert.equal(r.verdict, 'küçülüyor')
  })

  it('EPS seyrelmesi: net kâr büyür ama hisse daha hızlı → EPS bileşeni < net kâr bileşeni', () => {
    const diluted = makeYears(
      [100, 120, 145, 175, 210],
      [10, 13, 17, 22, 28],
      [1000, 1300, 1700, 2200, 2800], // seyrelme
    )
    const clean = makeYears(
      [100, 120, 145, 175, 210],
      [10, 13, 17, 22, 28],
      flat(1000),
    )
    const rd = computeGrowthMomentum(diluted, { inflationYoy: null })
    const rc = computeGrowthMomentum(clean, { inflationYoy: null })
    assert.ok(
      rd.components.eps < rc.components.eps,
      `seyreltilmiş EPS bileşeni (${rd.components.eps}) temiz olandan (${rc.components.eps}) düşük olmalı`,
    )
    assert.ok(rd.score < rc.score, 'seyreltilmiş şirketin toplam skoru daha düşük olmalı')
  })

  it('banka/finansal (grossProfit + currentLiabilities null) → uygulanmaz', () => {
    const years = makeYears([100, 120, 145], [10, 13, 17], flat(1000)).map((y) => ({
      ...y,
      grossProfit: null,
      currentLiabilities: null,
      currentAssets: null,
    }))
    const r = computeGrowthMomentum(years, { inflationYoy: null })
    assert.equal(r.applicable, false)
    assert.equal(r.verdict, 'uygulanmaz')
  })

  it('yetersiz veri (<2 yıl) → uygulanmaz', () => {
    const years = makeYears([100], [10], [1000])
    const r = computeGrowthMomentum(years, { inflationYoy: null })
    assert.equal(r.applicable, false)
  })

  it('BIST enflasyon: nominal yüksek ama reel negatif → US-nominal eşdeğerinden düşük', () => {
    const years = makeYears(
      [100, 130, 170, 220, 285], // ~%30 nominal büyüme
      [10, 13, 17, 22, 28],
      flat(1000),
    )
    const us = computeGrowthMomentum(years, { inflationYoy: null })
    const bist = computeGrowthMomentum(years, { inflationYoy: 35 }) // enflasyon > büyüme
    assert.ok(
      bist.score < us.score,
      `BIST reel skoru (${bist.score}) US nominal skorundan (${us.score}) düşük olmalı`,
    )
    assert.ok((bist.revenueCagrReal ?? 0) < 0, 'reel gelir büyümesi negatif olmalı')
    assert.ok((us.revenueCagrReal ?? 0) > 0, 'US nominal gelir büyümesi pozitif olmalı')
  })
})
