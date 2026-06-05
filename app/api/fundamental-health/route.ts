/**
 * Temel Analiz Sağlık API
 * GET /api/fundamental-health?symbol=ASELS&market=BIST
 *
 * 5 yıllık finansal tablolardan Piotroski F-Score, Altman Z'', kazanç kalitesi
 * ve trend döndürür. Bankalarda Piotroski/Altman "uygulanmaz" işaretlenir.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { fetchFinancialStatements } from '@/lib/financial-statements'
import { computeFundamentalHealth } from '@/lib/fundamental-health'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ip = getClientIP(req.headers)
  const rl = checkRateLimit(`${ip}:fhealth`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 })
  }

  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ error: 'Sembol gerekli (örn: symbol=ASELS).' }, { status: 400 })
  }
  const market = (req.nextUrl.searchParams.get('market') || 'BIST').toUpperCase() === 'US' ? 'US' : 'BIST'

  try {
    const years = await fetchFinancialStatements(symbol, { bist: market === 'BIST' })
    if (years.length === 0) {
      return NextResponse.json({
        symbol, market, available: false,
        message: 'Bu sembol için finansal tablo verisi bulunamadı.',
      }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } })
    }

    const health = computeFundamentalHealth(years)

    return NextResponse.json(
      { symbol, market, available: true, years, health },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' } }, // 6 saat
    )
  } catch (e) {
    console.error('[fundamental-health]', e)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
