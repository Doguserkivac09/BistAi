export type Fundamentals = {
  revenueGrowth: number | null
  avgTargetPrice: number | null
  currentPrice: number | null
  targetUpside: number | null
  recommendation: string | null
  cash: number | null
  debt: number | null
  runway: number | null
  institutionalPct: number | null
  insiderBuySellRatio: number | null
  marketCapMillions: number | null
  peRatio: number | null
  epsDiluted: number | null
} & Record<string, any>

// Backward compatibility type alias
export type YahooFundamentals = Fundamentals

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const result: Fundamentals = {
    revenueGrowth: null,
    avgTargetPrice: null,
    currentPrice: null,
    targetUpside: null,
    recommendation: null,
    cash: null,
    debt: null,
    runway: null,
    institutionalPct: null,
    insiderBuySellRatio: null,
    marketCapMillions: null,
    peRatio: null,
    epsDiluted: null,
  }

  try {
    const modules = [
      'financialData',
      'defaultKeyStatistics',
      'earnings',
      'recommendationTrend',
      'insiderTransactions',
      'majorHoldersBreakdown',
    ]
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules.join(
      ','
    )}`

    const response = await fetch(url).then((r) => r.json())
    const data = response.quoteSummary?.result?.[0]

    // Current price
    if (data.financialData?.currentPrice) {
      result.currentPrice = data.financialData.currentPrice
    }

    // Revenue growth (trailing 12 months vs prior year)
    if (data.financialData?.revenueGrowth) {
      result.revenueGrowth = data.financialData.revenueGrowth * 100
    }

    // Recommendation & target price
    if (data.recommendationTrend?.recommendation) {
      result.recommendation = data.recommendationTrend.recommendation
    }
    if (data?.financialData?.targetMeanPrice) {
      result.avgTargetPrice = data.financialData.targetMeanPrice
      if (result.currentPrice && result.avgTargetPrice) {
        result.targetUpside =
          ((result.avgTargetPrice - result.currentPrice) / result.currentPrice) * 100
      }
    }

    // Balance sheet: cash & debt
    if (data.financialData?.totalCash) {
      result.cash = data.financialData.totalCash / 1e6 // convert to millions
    }
    if (data.financialData?.totalDebt) {
      result.debt = data.financialData.totalDebt / 1e6
    }

    // Market cap
    if (data.defaultKeyStatistics?.marketCap) {
      result.marketCapMillions = data.defaultKeyStatistics.marketCap / 1e6
    }

    // P/E ratio & EPS
    if (data.defaultKeyStatistics?.trailingPE) {
      result.peRatio = data.defaultKeyStatistics.trailingPE
    }
    if (data.defaultKeyStatistics?.epsTrailingTwelveMonths) {
      result.epsDiluted = data.defaultKeyStatistics.epsTrailingTwelveMonths
    }

    // Institutional ownership
    if (data.majorHoldersBreakdown?.institutionsPercent) {
      result.institutionalPct = data.majorHoldersBreakdown.institutionsPercent * 100
    }

    // Insider transactions (son 90 gün)
    if (data.insiderTransactions?.transactions) {
      let buyCount = 0
      let sellCount = 0
      const ninetyDaysAgo = Date.now() / 1000 - 90 * 24 * 60 * 60

      for (const tx of data.insiderTransactions.transactions) {
        if (tx.startDate > ninetyDaysAgo) {
          if (tx.transactionText?.includes('Buy')) buyCount++
          else if (tx.transactionText?.includes('Sell')) sellCount++
        }
      }

      if (buyCount + sellCount > 0) {
        result.insiderBuySellRatio = (buyCount - sellCount) / (buyCount + sellCount)
      }
    }

    // Runway estimate: cash / quarterly expense (heuristic)
    if (result.cash && result.currentPrice && result.marketCapMillions) {
      const estimatedQuarterlyBurn = (result.marketCapMillions * 0.025) / 1e6
      if (estimatedQuarterlyBurn > 0) {
        result.runway = (result.cash / estimatedQuarterlyBurn) / 4 // years
      }
    }
  } catch (error) {
    console.error(`[yahoo-fundamentals] Error fetching ${symbol}:`, error)
  }

  return result
}

// Helper: fetch all US symbols' fundamentals in batches
// Backward compatibility alias
export const fetchYahooFundamentals = fetchFundamentals

export async function fetchFundamentalsBatch(
  symbols: string[],
  batchSize = 5,
  delayMs = 1000
): Promise<Map<string, Fundamentals>> {
  const results = new Map<string, Fundamentals>()

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)

    const promises = batch.map(async (sym) => {
      const fund = await fetchFundamentals(sym)
      results.set(sym, fund)
    })

    await Promise.all(promises)

    if (i + batchSize < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return results
}
