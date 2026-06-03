import { NextRequest, NextResponse } from 'next/server'
import { Anthropic } from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'
import { US_SYMBOL_LIST } from '@/lib/us-symbols'
import { fetchFundamentalsBatch } from '@/lib/yahoo-fundamentals'
import { computeFutureScore } from '@/lib/future-score'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!isVercelCron && !(process.env.CRON_SECRET && token === process.env.CRON_SECRET)) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const symbols = US_SYMBOL_LIST
    console.log(`[future-scores] Computing for ${symbols.length} US symbols`)

    const fundamentals = await fetchFundamentalsBatch(symbols, 5, 1000)
    const claude = new Anthropic()

    const upsertData = []

    for (const symbol of symbols) {
      const fund = fundamentals.get(symbol)
      if (!fund) continue

      let newsCountPos = 0
      let newsCountNeg = 0
      let partnershipSignals = 0

      try {
        const newsUrl = `https://newsapi.org/v2/everything?q="${symbol}"%20stock&sortBy=publishedAt&language=en&pageSize=10`
        const newsKey = process.env.NEWS_API_KEY || ''

        const newsRes = await fetch(`${newsUrl}&apiKey=${newsKey}`)
          .then((r) => r.json())
          .catch(() => null)

        if (newsRes && newsRes.articles) {
          for (const article of newsRes.articles) {
            const sentiment = analyzeSentiment(article.title + ' ' + (article.description || ''))
            if (sentiment > 0.3) newsCountPos++
            else if (sentiment < -0.3) newsCountNeg++

            if (
              /partnership|acquisition|invest|deal|contract/i.test(
                article.title + article.description
              )
            ) {
              partnershipSignals = Math.min(3, partnershipSignals + 1)
            }
          }
        }
      } catch (error) {
        console.warn(`[future-scores] News fetch failed for ${symbol}`)
      }

      const breakdown = computeFutureScore(fund, newsCountPos, newsCountNeg, partnershipSignals)

      let aiSummary = ''
      try {
        const summaryPrompt = `
Given this stock:
- Symbol: ${symbol}
- Revenue growth: ${fund.revenueGrowth?.toFixed(1) || 'N/A'}%
- Analyst target upside: ${fund.targetUpside?.toFixed(1) || 'N/A'}%
- Cash position: $${fund.cash?.toFixed(0) || 'N/A'}M
- Institutional ownership: ${fund.institutionalPct?.toFixed(1) || 'N/A'}%

Write 1-2 sentences in Turkish about its future prospects. Be concise and direct.
`.trim()

        const response = await claude.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 100,
          messages: [{ role: 'user', content: summaryPrompt }],
        })

        aiSummary = (response.content[0] as any).text || ''
      } catch (error) {
        console.warn(`[future-scores] Claude summary failed for ${symbol}`)
        aiSummary = breakdown.summary
      }

      upsertData.push({
        sembol: symbol,
        market: 'US',
        score: breakdown.score,
        revenue_score: breakdown.revenueScore,
        analyst_score: breakdown.analystScore,
        insider_score: breakdown.insiderScore,
        news_score: breakdown.newsScore,
        institutional_score: breakdown.institutionalScore,
        balance_score: breakdown.balanceScore,
        partnership_score: breakdown.partnershipScore,
        ai_summary: aiSummary,
        scored_at: new Date().toISOString(),
      })
    }

    const sb = await createServerClient()
    for (let i = 0; i < upsertData.length; i += 100) {
      const batch = upsertData.slice(i, i + 100)
      const { error } = await sb.from('future_scores').upsert(batch)

      if (error) {
        console.error(`[future-scores] Upsert batch ${i / 100} failed:`, error)
      }
    }

    console.log(`[future-scores] Completed: ${upsertData.length} scores computed`)

    return NextResponse.json({
      success: true,
      count: upsertData.length,
    })
  } catch (error) {
    console.error('[future-scores] Error:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}

function analyzeSentiment(text: string): number {
  const positiveWords = /good|strong|growth|bull|up|rise|positive|success|gain/gi
  const negativeWords = /bad|weak|decline|bear|down|fall|negative|loss|fail/gi

  const posCount = (text.match(positiveWords) || []).length
  const negCount = (text.match(negativeWords) || []).length

  if (posCount + negCount === 0) return 0
  return (posCount - negCount) / (posCount + negCount)
}
