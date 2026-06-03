export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getSymbolsByTheme, ALL_THEMES, type ThemeId } from '@/lib/us-symbols'
import { getBistSymbolsByTheme, isBistFutureTheme } from '@/lib/bist-future-themes'

export const revalidate = 3600 // 1 hour cache

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const tema = searchParams.get('tema') || ''
    const market = (searchParams.get('market') || 'US').toUpperCase() === 'BIST' ? 'BIST' : 'US'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const sort = searchParams.get('sort') || 'desc' // desc = highest score first

    const sb = await createServerClient()
    let query = sb.from('future_scores').select('*').eq('market', market)

    // Tema filtresi — markete göre doğru sembol kaynağı
    if (tema) {
      let symbols: string[] = []
      if (market === 'BIST') {
        if (isBistFutureTheme(tema)) symbols = getBistSymbolsByTheme(tema)
      } else if (ALL_THEMES.includes(tema as ThemeId)) {
        symbols = getSymbolsByTheme(tema as ThemeId)
      }
      // Geçerli tema ama sembol yoksa boş sonuç döndür (yanlış tüm-liste değil)
      query = query.in('sembol', symbols.length ? symbols : ['__none__'])
    }

    query = query
      .order('score', { ascending: sort === 'asc' })
      .limit(limit)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      tema: tema || 'Tüm Temalar',
      market,
      count: data?.length || 0,
      scores: data || [],
    })
  } catch (error) {
    console.error('[future-scores API]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
