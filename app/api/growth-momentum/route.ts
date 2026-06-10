/**
 * Büyüme Momentumu okuma API'si — ai_cache'ten precompute edilmiş skorları okur.
 * GET /api/growth-momentum?market=BIST|US&limit=50
 * İstek-zamanı fetch YOK; cron'un yazdığı sıralı listeyi döndürür.
 */

export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getStoredGrowthMomentum } from '@/lib/growth-momentum-runner'

export const revalidate = 1800 // 30 dk

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const market = (sp.get('market') || 'BIST').toUpperCase() === 'US' ? 'US' : 'BIST'
    const limit = Math.min(parseInt(sp.get('limit') || '60'), 250)

    const sb = await createServerClient()
    const store = await getStoredGrowthMomentum(sb, market)

    return NextResponse.json({
      market,
      updatedAt: store?.scoredAt || null,
      inflationYoy: store?.inflationYoy ?? null,
      count: store?.rows.length ?? 0,
      scores: (store?.rows ?? []).slice(0, limit),
    })
  } catch (error) {
    console.error('[growth-momentum API]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
