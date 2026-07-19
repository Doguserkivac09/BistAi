/**
 * Akıllı Para + Teknik Sinyal Motoru — ortak tipler.
 *
 * Hesaplar %100 deterministik/kural-tabanlı (spec STEP 1-5). AI yalnız son kısa
 * açıklamayı üretir. Motor veri kaynağını GÖRMEZ: akıllı para sinyali normalize
 * `SmartMoneyInput` arayüzü arkasındadır → bugün OHLCV proxy, ileride gerçek takas
 * aynı arayüzle takılır (BEBEK/PLAN: pluggable).
 */

import type { OHLCVCandle } from '@/types'

export type FlowTrend = 'buying' | 'selling' | 'neutral'
export type SmartMoneySource = 'ohlcv-proxy' | 'takas'
export type SignalStatus = 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE' | 'STRONG'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type SignalAction = 'Avoid' | 'Watch' | 'Consider' | 'Strong Watch'
export type BonusFlag = 'smart_money_entered' | 'accumulation' | 'distribution'

/** STEP 1 girdileri — `deriveTechnicalInput` ile candles/scan_cache'ten türetilir */
export interface TechnicalInput {
  rsi: number | null
  macd_signal: 'bullish' | 'bearish' | 'neutral'
  ma50_cross: boolean // son ~3 günde MA50 üstüne YUKARI kesişim
  volume_increase: boolean
}

/**
 * STEP 2 girdileri — net_flow değerleri NORMALİZE yoğunluktur (signed, ~[-1,1]):
 * pencere Money-Flow-Volume / pencere toplam hacim. TL mutlak değil (gerçek takas yok),
 * ölçek-bağımsız → eşik tüm hisseler için adil.
 */
export interface SmartMoneyInput {
  net_flow_1d: number
  net_flow_5d: number
  net_flow_20d: number
  consistent_buy_days: number
  new_buyer_detected: boolean
  previous_trend: FlowTrend
  current_trend: FlowTrend
  source: SmartMoneySource
}

/** Pluggable akıllı para kaynağı — motor yalnız bunu tüketir */
export interface SmartMoneyProvider {
  get(symbol: string, candles: OHLCVCandle[]): SmartMoneyInput
}

/** STRICT JSON çıktı (spec) + bonus/şeffaflık eklentileri */
export interface SmartSignalResult {
  symbol: string
  status: SignalStatus
  technical_score: number // 0-7
  smart_money_score: number // 0-10
  total_score: number // 0-17
  risk: RiskLevel
  action: SignalAction
  summary: string
  // ── eklenti (bonus + şeffaflık) ──
  flags: BonusFlag[]
  smart_money_source: SmartMoneySource
  price: number | null
  changePercent: number | null
  /** Bir önceki güne göre total_score değişimi (İvme Kazananlar için). null = önceki gün verisi yok. */
  score_delta?: number | null
}
