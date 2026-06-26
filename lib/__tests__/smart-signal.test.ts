/**
 * Akıllı Para + Teknik Sinyal Motoru — Fixture Tests
 * Çalıştır: npm test
 *
 * NOT: Spec'in örnek çıktısı kendi kurallarıyla çelişir (smart_money 3+3+2+3=11→10,
 * RSI 32 "RSI<30" kapısına girmez). Testler YAZILI KURALLARA göredir; status (STRONG)
 * yine örnekle uyumludur.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { OHLCVCandle } from '@/types'

import { computeTechnicalScore } from '../smart-signal/technical-score'
import { computeSmartMoneyScore } from '../smart-signal/smart-money-score'
import { computeRisk } from '../smart-signal/risk'
import { detectBonusFlags } from '../smart-signal/phase'
import { buildSummary } from '../smart-signal/summary'
import { ohlcvSmartMoneyProvider } from '../smart-signal/provider-ohlcv'
import { runSmartSignal } from '../smart-signal/engine'
import type { TechnicalInput, SmartMoneyInput } from '../smart-signal/types'

// ── Fixtures ─────────────────────────────────────────────────────────────────
function tech(o: Partial<TechnicalInput> = {}): TechnicalInput {
  return { rsi: 50, macd_signal: 'neutral', ma50_cross: false, volume_increase: false, ...o }
}
function sm(o: Partial<SmartMoneyInput> = {}): SmartMoneyInput {
  return {
    net_flow_1d: 0, net_flow_5d: 0, net_flow_20d: 0,
    consistent_buy_days: 0, new_buyer_detected: false,
    previous_trend: 'neutral', current_trend: 'neutral', source: 'ohlcv-proxy', ...o,
  }
}
const mk = (close: number, volume: number, hi?: number, lo?: number): OHLCVCandle => ({
  date: '', open: close, high: hi ?? close * 1.01, low: lo ?? close * 0.99, close, volume,
})

// ── STEP 1: technical_score ─────────────────────────────────────────────────
describe('computeTechnicalScore (STEP 1)', () => {
  it('spec örneği: RSI 32 + MACD bullish + MA50 + hacim → 6', () => {
    assert.equal(computeTechnicalScore(tech({ rsi: 32, macd_signal: 'bullish', ma50_cross: true, volume_increase: true })), 6)
  })
  it('RSI < 30 → +2, RSI 30-40 → +1, RSI > 40 → 0', () => {
    assert.equal(computeTechnicalScore(tech({ rsi: 29 })), 2)
    assert.equal(computeTechnicalScore(tech({ rsi: 30 })), 1)
    assert.equal(computeTechnicalScore(tech({ rsi: 40 })), 1)
    assert.equal(computeTechnicalScore(tech({ rsi: 41 })), 0)
  })
  it('0-7 sınırında kalır', () => {
    assert.equal(computeTechnicalScore(tech({ rsi: 20, macd_signal: 'bullish', ma50_cross: true, volume_increase: true })), 7)
  })
})

// ── STEP 2: smart_money_score ───────────────────────────────────────────────
describe('computeSmartMoneyScore (STEP 2)', () => {
  it('consistent_buy_days kovaları: 3→+1, 4→+2, 11→+3', () => {
    assert.equal(computeSmartMoneyScore(sm({ consistent_buy_days: 3 })), 1)
    assert.equal(computeSmartMoneyScore(sm({ consistent_buy_days: 4 })), 2)
    assert.equal(computeSmartMoneyScore(sm({ consistent_buy_days: 11 })), 3)
  })
  it('net_flow_20d güçlü pozitif (≥0.1) → +3, altı → 0', () => {
    assert.equal(computeSmartMoneyScore(sm({ net_flow_20d: 0.1 })), 3)
    assert.equal(computeSmartMoneyScore(sm({ net_flow_20d: 0.09 })), 0)
  })
  it('new_buyer +2, trend değişimi (selling→buying) +3', () => {
    assert.equal(computeSmartMoneyScore(sm({ new_buyer_detected: true })), 2)
    assert.equal(computeSmartMoneyScore(sm({ previous_trend: 'selling', current_trend: 'buying' })), 3)
  })
  it('tüm sinyaller → 11 ama 10\'da clamp', () => {
    const s = sm({ consistent_buy_days: 12, net_flow_20d: 0.3, new_buyer_detected: true, previous_trend: 'selling', current_trend: 'buying' })
    assert.equal(computeSmartMoneyScore(s), 10)
  })
})

// ── STEP 4: risk ────────────────────────────────────────────────────────────
describe('computeRisk (STEP 4)', () => {
  const ctx = { atrPctDaily: 3, recentVerticalSpike: false, pos52: 0.4 }
  it('RSI<30 + güçlü alım → MEDIUM (olası dönüş)', () => {
    assert.equal(computeRisk(tech({ rsi: 28 }), sm({ current_trend: 'buying', consistent_buy_days: 6 }), ctx), 'MEDIUM')
  })
  it('aşırı-uzama (RSI>70) → HIGH', () => {
    assert.equal(computeRisk(tech({ rsi: 75 }), sm(), ctx), 'HIGH')
  })
  it('dikey sıçrama → HIGH', () => {
    assert.equal(computeRisk(tech({ rsi: 55 }), sm(), { ...ctx, recentVerticalSpike: true }), 'HIGH')
  })
  it('52H\'ye yapışık (pos>0.9) → HIGH', () => {
    assert.equal(computeRisk(tech({ rsi: 60 }), sm(), { ...ctx, pos52: 0.95 }), 'HIGH')
  })
  it('sakin → LOW', () => {
    assert.equal(computeRisk(tech({ rsi: 50 }), sm({ current_trend: 'buying', consistent_buy_days: 5 }), ctx), 'LOW')
  })
})

// ── BONUS: faz tespiti ──────────────────────────────────────────────────────
describe('detectBonusFlags (BONUS)', () => {
  it('satış→alım + hacim → smart_money_entered', () => {
    const f = detectBonusFlags(tech({ volume_increase: true }), sm({ previous_trend: 'selling', current_trend: 'buying' }), { obvTrend: 0.3, priceSlope60: 5, pos52: 0.4 })
    assert.ok(f.includes('smart_money_entered'))
  })
  it('birikim fazı (RSI 45) + OBV+ + fiyat yatay → accumulation', () => {
    const f = detectBonusFlags(tech({ rsi: 45 }), sm(), { obvTrend: 0.3, priceSlope60: 5, pos52: 0.4 })
    assert.ok(f.includes('accumulation'))
  })
  it('rally (RSI 70) + OBV- + tepede → distribution', () => {
    const f = detectBonusFlags(tech({ rsi: 70 }), sm(), { obvTrend: -0.3, priceSlope60: 2, pos52: 0.95 })
    assert.ok(f.includes('distribution'))
  })
})

// ── STEP 6: özet ────────────────────────────────────────────────────────────
describe('buildSummary (STEP 6)', () => {
  it('en güçlü 2 sinyal, ≤20 kelime', () => {
    const s = buildSummary({
      status: 'STRONG',
      technical: tech({ ma50_cross: true, macd_signal: 'bullish' }),
      smartMoney: sm({ consistent_buy_days: 12 }),
      flags: [],
    })
    assert.ok(s.split(/\s+/).length <= 20)
    assert.match(s, /12 gündür sürekli alım var/)
    assert.match(s, / ve /)
  })
  it('sinyalsiz → durum-tabanlı yedek', () => {
    const s = buildSummary({ status: 'NEGATIVE', technical: tech(), smartMoney: sm(), flags: [] })
    assert.match(s, /uzak durun/)
  })
})

// ── OHLCV provider + engine entegrasyon (sentetik) ──────────────────────────
describe('OhlcvSmartMoneyProvider + engine', () => {
  // 40 günlük birikim: her gün kapanış aralığın üst kısmında (mfMultiplier>0), yukarı eğim
  function accumulationSeries(): OHLCVCandle[] {
    const out: OHLCVCandle[] = []
    let p = 100
    for (let i = 0; i < 40; i++) {
      p += 0.4
      // close range'in üstünde → mfMultiplier > 0 (alım)
      out.push(mk(p, 150000 + i * 1000, p * 1.005, p * 0.99))
    }
    return out
  }

  it('birikim serisi → current_trend buying, consistent_buy_days yüksek', () => {
    const inp = ohlcvSmartMoneyProvider.get('TEST', accumulationSeries())
    assert.equal(inp.current_trend, 'buying')
    assert.ok(inp.consistent_buy_days >= 10, `consistent: ${inp.consistent_buy_days}`)
    assert.ok(inp.net_flow_20d > 0)
    assert.equal(inp.source, 'ohlcv-proxy')
  })

  it('runSmartSignal: tam sonuç döner, strict alanlar mevcut', () => {
    const r = runSmartSignal('TEST', accumulationSeries(), { rsi: 38, rel_vol5: 1.5, last_close: 116 })
    assert.ok(r !== null)
    assert.ok(['NEGATIVE', 'NEUTRAL', 'POSITIVE', 'STRONG'].includes(r!.status))
    assert.equal(r!.total_score, r!.technical_score + r!.smart_money_score)
    assert.ok(['Avoid', 'Watch', 'Consider', 'Strong Watch'].includes(r!.action))
    assert.equal(r!.smart_money_source, 'ohlcv-proxy')
  })

  it('<30 mum → null (çalıştırıcı atlar)', () => {
    assert.equal(runSmartSignal('TEST', accumulationSeries().slice(0, 20)), null)
  })
})
