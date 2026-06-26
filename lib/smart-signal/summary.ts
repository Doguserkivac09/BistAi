/**
 * STEP 6 — Deterministik Türkçe özet (≤20 kelime, jargon yok, en önemli 2 sinyal).
 *
 * Durum-DUYARLI: OLUMLU/GÜÇLÜ → pozitif sinyaller önde; OLUMSUZ → temkin sinyalleri
 * önde (çelişik/kafa karıştırıcı mesaj olmaz). TÜM hisseler için bedava/ölçeklenebilir
 * taban; POSITIVE/STRONG top-N için ai-summary.ts opsiyonel Haiku ile geçersiz kılabilir.
 */

import type { TechnicalInput, SmartMoneyInput, SignalStatus, BonusFlag } from './types'

type Tone = 'pos' | 'neg' | 'neutral'
interface Clause {
  priority: number
  text: string
  tone: Tone
  active: boolean
}

export interface SummaryInput {
  status: SignalStatus
  technical: TechnicalInput
  smartMoney: SmartMoneyInput
  flags: BonusFlag[]
}

function cap(s: string): string {
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1)
}

export function buildSummary(inp: SummaryInput): string {
  const { status, technical: t, smartMoney: sm, flags } = inp

  const clauses: Clause[] = [
    { priority: 1, tone: 'pos', text: 'akıllı para girişi başladı', active: flags.includes('smart_money_entered') },
    { priority: 2, tone: 'pos', text: `${sm.consistent_buy_days} gündür sürekli alım var`, active: sm.consistent_buy_days > 3 },
    { priority: 3, tone: 'pos', text: 'güçlü para girişi sürüyor', active: sm.net_flow_20d >= 0.1 },
    { priority: 4, tone: 'pos', text: 'teknik kırılım geldi', active: t.ma50_cross },
    { priority: 5, tone: 'pos', text: 'yükseliş ivmesi güçlendi', active: t.macd_signal === 'bullish' },
    { priority: 6, tone: 'pos', text: 'sessiz birikim aşamasında', active: flags.includes('accumulation') },
    { priority: 7, tone: 'neutral', text: 'aşırı satımdan dönüş ihtimali', active: t.rsi !== null && t.rsi < 30 },
    { priority: 8, tone: 'neutral', text: 'hacim belirgin arttı', active: t.volume_increase },
    { priority: 9, tone: 'neg', text: 'dağıtım baskısı var', active: flags.includes('distribution') },
    { priority: 10, tone: 'neg', text: 'momentum zayıflıyor', active: t.macd_signal === 'bearish' },
    { priority: 11, tone: 'neg', text: 'para çıkışı sürüyor', active: sm.current_trend === 'selling' },
  ]

  // Durum-duyarlı ton filtresi
  const allow: Tone[] =
    status === 'POSITIVE' || status === 'STRONG'
      ? ['pos', 'neutral']
      : status === 'NEGATIVE'
        ? ['neg', 'neutral']
        : ['pos', 'neg', 'neutral']

  const picked = clauses
    .filter((c) => c.active && allow.includes(c.tone))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 2)
    .map((c) => c.text)

  let summary: string
  if (picked.length === 2) summary = `${picked[0]} ve ${picked[1]}`
  else if (picked.length === 1) summary = picked[0]
  else {
    summary =
      status === 'NEGATIVE'
        ? 'belirgin alım ilgisi yok, uzak durun'
        : status === 'STRONG' || status === 'POSITIVE'
          ? 'çok yönlü alım sinyali var'
          : 'net sinyal yok, izlemede kalın'
  }

  const words = summary.split(/\s+/)
  if (words.length > 20) summary = words.slice(0, 20).join(' ')
  return cap(summary)
}
