export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getSymbolsByTheme } from '@/lib/us-symbols'

const THEMES = [
  { id: 'AI' },
  { id: 'Quantum' },
  { id: 'Space' },
  { id: 'Cybersecurity' },
]

export const revalidate = 3600 // 1 hour cache

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const tema = searchParams.get('tema') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const sort = searchParams.get('sort') || 'desc' // desc = highest score first

    const sb = await createServerClient()
    let query = sb.from('future_scores').select('*').eq('market', 'US')

    // Filter by tema if provided
    if (tema && THEMES.some((t) => t.id === tema)) {
      const symbols = getSymbolsByTheme(tema as any)
      query = query.in('sembol', symbols)
    }

    // Sort and limit
    query = query
      .order('score', { ascending: sort === 'asc' })
      .limit(limit)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      tema: tema || 'Tüm Temalar',
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
