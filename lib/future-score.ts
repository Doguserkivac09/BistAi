import { Fundamentals } from './yahoo-fundamentals'

export interface FutureScoreBreakdown {
  score: number // 0-100
  revenueScore: number
  analystScore: number
  insiderScore: number
  newsScore: number
  institutionalScore: number
  balanceScore: number
  partnershipScore: number
  summary: string
}

// Normalize 0-100 range (caps at 100)
function normalize(value: number | null, min = 0, max = 100): number {
  if (value === null || value === undefined) return 50 // neutral default

  if (max === min) return 50
  const pct = ((value - min) / (max - min)) * 100
  return Math.max(0, Math.min(100, pct))
}

export function computeFutureScore(
  fundamentals: Fundamentals,
  newsCountPositive = 0,
  newsCountNegative = 0,
  partnershipSignals = 0 // 0-3 (low-mid-high)
): FutureScoreBreakdown {
  // 25% Revenue growth (target: 20-50% growth = 100)
  let revenueScore = 50
  if (fundamentals.revenueGrowth !== null) {
    revenueScore = normalize(fundamentals.revenueGrowth, -10, 50)
  }

  // 20% Analyst upside (target > 10% upside = 100)
  let analystScore = 50
  if (fundamentals.targetUpside !== null) {
    analystScore = normalize(fundamentals.targetUpside, -20, 30)
  }

  // 15% Insider activity (+1 = all buys, -1 = all sells)
  let insiderScore = 50
  if (fundamentals.insiderBuySellRatio !== null) {
    // Map -1...+1 to 0...100
    insiderScore = ((fundamentals.insiderBuySellRatio + 1) / 2) * 100
  }

  // 15% News momentum (positive - negative news in last 30 days)
  let newsScore = 50
  if (newsCountPositive + newsCountNegative > 0) {
    const netSentiment = (newsCountPositive - newsCountNegative) / (newsCountPositive + newsCountNegative)
    newsScore = ((netSentiment + 1) / 2) * 100
  }

  // 10% Institutional ownership (target: >30% = 100)
  let institutionalScore = 50
  if (fundamentals.institutionalPct !== null) {
    institutionalScore = normalize(fundamentals.institutionalPct, 0, 50)
  }

  // 10% Balance sheet health (cash > debt + positive runway)
  let balanceScore = 50
  if (fundamentals.cash !== null && fundamentals.debt !== null) {
    const cashDebtRatio = fundamentals.cash / (fundamentals.debt + 1)
    balanceScore = Math.min(100, normalize(cashDebtRatio, 0.5, 3))

    // Boost if runway > 3 years
    if (fundamentals.runway && fundamentals.runway > 3) {
      balanceScore = Math.min(100, balanceScore + 15)
    }
  }

  // 5% Partnership signals (Claude-detected from news)
  let partnershipScore = 50 + (partnershipSignals * 15) // 0=50, 1=65, 2=80, 3=95

  // Weighted sum (7 components)
  const totalScore =
    revenueScore * 0.25 +
    analystScore * 0.2 +
    insiderScore * 0.15 +
    newsScore * 0.15 +
    institutionalScore * 0.1 +
    balanceScore * 0.1 +
    partnershipScore * 0.05

  return {
    score: Math.round(Math.max(0, Math.min(100, totalScore))),
    revenueScore: Math.round(revenueScore),
    analystScore: Math.round(analystScore),
    insiderScore: Math.round(insiderScore),
    newsScore: Math.round(newsScore),
    institutionalScore: Math.round(institutionalScore),
    balanceScore: Math.round(balanceScore),
    partnershipScore: Math.round(partnershipScore),
    summary: generateSummary({
      score: Math.round(totalScore),
      revenue: fundamentals.revenueGrowth || 0,
      targetUpside: fundamentals.targetUpside || 0,
      insiderRatio: fundamentals.insiderBuySellRatio || 0,
    }),
  }
}

function generateSummary(data: {
  score: number
  revenue: number
  targetUpside: number
  insiderRatio: number
}): string {
  const strengths = []

  if (data.revenue > 20) {
    strengths.push(`${data.revenue.toFixed(1)}% revenue büyümesi`)
  }
  if (data.targetUpside > 10) {
    strengths.push(`analist hedefi +${data.targetUpside.toFixed(1)}%`)
  }
  if (data.insiderRatio > 0.3) {
    strengths.push('net insider alım')
  }

  if (strengths.length > 0) {
    return `Güçlü fundamentals: ${strengths.join(', ')}`
  }
  return 'Karışık sinyal'
}

// CLI friendly score to color
export function scoreToColor(score: number): string {
  if (score >= 75) return '#10b981' // emerald
  if (score >= 60) return '#3b82f6' // blue
  if (score >= 45) return '#f59e0b' // amber
  return '#ef4444' // red
}

export function scoreToLabel(score: number): string {
  if (score >= 75) return 'Çok Parlak'
  if (score >= 60) return 'Parlak'
  if (score >= 45) return 'Nötr'
  return 'Karanlık'
}
