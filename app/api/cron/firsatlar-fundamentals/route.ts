/**
 * Fırsatlar temel-veri precompute cron (FAZ 2)
 *
 * Aktif fırsat sembollerini (/api/firsatlar ile AYNI sorgu) alır, her biri için
 * Yatırım Skoru + sonraki bilanço tarihini hesaplayıp ai_cache'e yazar
 * (firsatlar-fundamentals:BIST). /api/firsatlar bu satırı tek sorguyla okur →
 * istek-anı Yahoo fan-out'u YOK.
 *
 * GET /api/cron/firsatlar-fundamentals
 *  - Vercel Cron: x-vercel-cron header
 *  - Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * scan-cache (sinyal yazımı) ve sector-medians sonrasına zamanlanır.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bistGuard } from '@/lib/bist-guard'
import { fetchTurkeyInflation } from '@/lib/turkey-macro'
import { runFirsatlarFundamentals } from '@/lib/firsatlar-fundamentals-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const MIN_CONFLUENCE = 45
const LOOKBACK_DAYS = 5

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  const isManualAuth = CRON_SECRET && token === CRON_SECRET
  if (!isVercelCron && !isManualAuth && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const guard = bistGuard()
  if (guard) return guard

  const startedAt = Date.now()
  const sb = createAdminClient()

  // Aktif fırsat sembolleri — /api/firsatlar ile aynı filtre (BIST, son 5g, confluence≥45)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS)
  cutoff.setHours(0, 0, 0, 0)

  const { data: sigRows, error } = await sb
    .from('signal_performance')
    .select('sembol, confluence_score')
    .eq('evaluated', false)
    .or('market.eq.BIST,market.is.null')
    .gte('entry_time', cutoff.toISOString())
    .gte('confluence_score', MIN_CONFLUENCE)
    .order('confluence_score', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const seen = new Set<string>()
  const symbols: string[] = []
  for (const r of (sigRows ?? []) as { sembol: string }[]) {
    if (!r.sembol || seen.has(r.sembol)) continue
    seen.add(r.sembol)
    symbols.push(r.sembol)
  }

  if (symbols.length === 0) {
    return NextResponse.json({ ok: true, message: 'Aktif sinyal yok', scored: 0 })
  }

  const inflation = await fetchTurkeyInflation().catch(() => null)
  const inflationYoy = inflation?.value ?? null

  const result = await runFirsatlarFundamentals(sb, symbols, {
    inflationYoy,
    batchSize: 8,
    batchDelay: 250,
  })

  const durationMs = Date.now() - startedAt
  console.log(
    `[cron/firsatlar-fundamentals] ${result.scored}/${result.total} skor, ${result.failed} hata, ${durationMs}ms`,
  )

  return NextResponse.json({ ok: true, ...result, inflationYoy, durationMs })
}
