/**
 * Mum Mikro-Yapı — Bebek Hisseler (babyScore) için OHLCV türev primitifleri.
 *
 * Saf, deterministik, test edilebilir. Girdi: günlük OHLCV mumları (eskiden yeniye),
 * scan_cache `candles_json` (son ~60 mum) ile uyumlu. Tüm metrikler "patlama öncesi
 * sessiz birikim" ve "henüz yükselmemiş" sinyallerini ölçer (BEBEK-HISSELER-PROMPTU §7.0).
 *
 * Bağımlılık YOK (signals.ts'teki RSI dahili kopyalandı — bu modül skor motorundan
 * bağımsız test edilebilsin diye). Yetersiz mumda nötr/null değer döner, fırlatmaz.
 */

import type { OHLCVCandle } from '@/types'

export interface Microstructure {
  lastClose: number | null
  /** Son 20 mum ortalama TL işlem hacmi (close·volume) — likidite tabanı */
  advTL: number | null
  /** Pencere getirisi: close[-1]/close[0] − 1 (ratio; ~3 ay) */
  r60: number
  /** Wilder RSI(14), son değer (yetersiz veri → 50) */
  rsi14: number
  /** OBV trendi: (OBV_son − OBV_ilk)/Σ|hacim| ∈ ~[−1,1] (pozitif = birikim) */
  obvTrend: number
  /** Yukarı/aşağı hacim oranı (son 30 gün) ∈ [0,1] (>0.5 = talep baskın) */
  udvr: number
  /** Volatilite daralması: eskiATR% / yeniATR% (>1 = sıkışma/yay kuruluyor) */
  vcpRatio: number
  /** Lineer fit eğimi — pencere boyunca % değişim (12 = +%12) */
  priceSlope60: number
  /** Yükselen dipler: 3×20 pencere min'i artıyor mu (0,1,2) */
  higherLowsCount: number
  /** Son kapanış 50g SMA altında mı (düşen taban uyarısı) */
  closeBelowSMA50: boolean
  /** Son 10 mumun ortalama günlük ATR'si (% — volatilite rozeti) */
  atrPctDaily: number | null
  /** Son ~15 günde temelsiz dikey sıçrama (anti-pump tetikleyici) */
  recentVerticalSpike: boolean
  /** Mevcut mumlardan tepe/dip (52H/52L yoksa yaklaşık fallback) */
  candleHigh: number | null
  candleLow: number | null
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

// ── RSI (Wilder, 14) — son değer ───────────────────────────────────────────
export function wilderRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10
}

// ── OBV trendi ──────────────────────────────────────────────────────────────
export function computeObvTrend(candles: OHLCVCandle[]): number {
  if (candles.length < 5) return 0
  let obv = 0
  let obvFirst = 0
  let volSum = 0
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close
    const v = candles[i].volume
    volSum += Math.abs(v)
    if (d > 0) obv += v
    else if (d < 0) obv -= v
    if (i === 1) obvFirst = obv - (d > 0 ? v : d < 0 ? -v : 0) // ≈0 başlangıç
  }
  if (volSum <= 0) return 0
  return clamp((obv - obvFirst) / volSum, -1, 1)
}

// ── Yukarı/aşağı hacim oranı ────────────────────────────────────────────────
export function upDownVolRatio(candles: OHLCVCandle[], window = 30): number {
  const slice = candles.slice(-Math.min(window, candles.length))
  let up = 0
  let total = 0
  for (let i = 1; i < slice.length; i++) {
    const v = slice[i].volume
    total += v
    if (slice[i].close > slice[i - 1].close) up += v
  }
  return total > 0 ? up / total : 0.5
}

// ── True Range ortalaması (%) ───────────────────────────────────────────────
function atrPctOver(candles: OHLCVCandle[], fromEnd: number, toEnd: number, price: number): number | null {
  // candles[len-fromEnd .. len-toEnd] aralığı; price ile normalize
  const len = candles.length
  const a = Math.max(1, len - fromEnd)
  const b = len - toEnd
  if (b <= a || price <= 0) return null
  const trs: number[] = []
  for (let i = a; i < b; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    )
    trs.push(tr)
  }
  return trs.length ? (mean(trs) / price) * 100 : null
}

// ── VCP: volatilite daralma oranı (eski/yeni ATR%) ──────────────────────────
export function vcpRatio(candles: OHLCVCandle[]): number {
  const price = candles[candles.length - 1]?.close ?? 0
  const recent = atrPctOver(candles, 10, 0, price) // son 10 gün
  const older = atrPctOver(candles, 60, 30, price) // 30..60 gün öncesi
  if (!recent || !older || recent <= 0) return 1
  return clamp(older / recent, 0.2, 4)
}

// ── Lineer regresyon eğimi → pencere % değişimi ─────────────────────────────
export function priceSlopePct(candles: OHLCVCandle[], window = 60): number {
  const slice = candles.slice(-Math.min(window, candles.length))
  const n = slice.length
  if (n < 3) return 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const y = slice[i].close
    sx += i
    sy += y
    sxx += i * i
    sxy += i * y
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return 0
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  const start = intercept
  const end = intercept + slope * (n - 1)
  if (start <= 0) return 0
  return Math.round(((end - start) / start) * 1000) / 10
}

// ── Yükselen dipler (3×20 pencere) ──────────────────────────────────────────
export function higherLowsCount(candles: OHLCVCandle[]): number {
  if (candles.length < 30) return 1 // yetersiz → nötr
  const w = Math.floor(Math.min(60, candles.length) / 3)
  const tail = candles.slice(-(w * 3))
  const lowOf = (arr: OHLCVCandle[]) => Math.min(...arr.map((c) => c.low))
  const m1 = lowOf(tail.slice(0, w))
  const m2 = lowOf(tail.slice(w, w * 2))
  const m3 = lowOf(tail.slice(w * 2))
  let count = 0
  if (m2 >= m1 * 0.97) count++
  if (m3 >= m2 * 0.97) count++
  return count
}

// ── SMA ─────────────────────────────────────────────────────────────────────
function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  return mean(closes.slice(-period))
}

// ── Anti-pump: son ~15 günde dikey sıçrama ──────────────────────────────────
export function detectVerticalSpike(candles: OHLCVCandle[]): boolean {
  const n = candles.length
  if (n < 6) return false
  // (1) herhangi 5g pencerede ≥ +%40
  for (let i = Math.max(5, n - 15); i < n; i++) {
    if (candles[i - 5].close > 0) {
      const w = candles[i].close / candles[i - 5].close - 1
      if (w >= 0.4) return true
    }
  }
  // (2) ≥3 ardışık ~tavan günü (günlük ≥ +%9)
  let streak = 0
  for (let i = Math.max(1, n - 15); i < n; i++) {
    const d = candles[i - 1].close > 0 ? candles[i].close / candles[i - 1].close - 1 : 0
    if (d >= 0.09) {
      streak++
      if (streak >= 3) return true
    } else {
      streak = 0
    }
  }
  return false
}

// ── Hepsini topla ───────────────────────────────────────────────────────────
export function computeMicrostructure(candles: OHLCVCandle[]): Microstructure {
  const closes = candles.map((c) => c.close)
  const lastClose = closes.length ? closes[closes.length - 1] : null
  const len = candles.length

  const advWindow = candles.slice(-Math.min(20, len))
  const advTL = advWindow.length
    ? Math.round(mean(advWindow.map((c) => c.close * c.volume)))
    : null

  const r60 = closes.length >= 2 && closes[0] > 0 ? closes[closes.length - 1] / closes[0] - 1 : 0
  const s50 = sma(closes, 50)
  const price = lastClose ?? 0

  return {
    lastClose,
    advTL,
    r60: Math.round(r60 * 1000) / 1000,
    rsi14: wilderRSI(closes, 14),
    obvTrend: Math.round(computeObvTrend(candles) * 1000) / 1000,
    udvr: Math.round(upDownVolRatio(candles, 30) * 1000) / 1000,
    vcpRatio: Math.round(vcpRatio(candles) * 100) / 100,
    priceSlope60: priceSlopePct(candles, 60),
    higherLowsCount: higherLowsCount(candles),
    closeBelowSMA50: s50 !== null && lastClose !== null ? lastClose < s50 : false,
    atrPctDaily: atrPctOver(candles, 10, 0, price),
    recentVerticalSpike: detectVerticalSpike(candles),
    candleHigh: len ? Math.max(...candles.map((c) => c.high)) : null,
    candleLow: len ? Math.min(...candles.map((c) => c.low)) : null,
  }
}
