/**
 * Büyüme Momentumu cron — BIST.
 * Tüm BIST evrenini (619) çok-yıllı finansallardan tarar, "işi büyüyen + kârlılığı
 * artan + EPS'i yükselen" şirketleri skorlayıp ai_cache'e (growth-momentum:BIST) yazar.
 *
 * GET /api/cron/growth-momentum-bist[?part=1|2]
 *  - Vercel Cron: x-vercel-cron header
 *  - Manuel: Authorization: Bearer <CRON_SECRET>
 *
 * ⚠️ TIMEOUT: 619 sembol × ayrı fundamentalsTimeSeries çağrısı AĞIR (scan-cache 17:50
 * dersi). Tek koşu maxDuration=300'ü zorlayabilir → evren ?part=1|2 ile ikiye bölünür,
 * her parça kendi dilimini mevcut cache'le birleştirir (merge). vercel.json'da iki
 * schedule (Pzt 09:00 + 09:20 TRT). part'sız çağrı tüm evreni tarar (manuel test için).
 *
 * BIST'e özgü: bistGuard (tatil/hafta sonu) + fetchTurkeyInflation (reel büyüme).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bistGuard } from '@/lib/bist-guard'
import { BIST_SYMBOLS } from '@/types'
import { fetchTurkeyInflation } from '@/lib/turkey-macro'
import { runGrowthMomentum } from '@/lib/growth-momentum-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel Pro: 5 dk

const CRON_SECRET = process.env.CRON_SECRET

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

  if (!isVercelCron && !isManualAuth) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    }
  }

  const guard = bistGuard()
  if (guard) return guard

  const startedAt = Date.now()

  try {
    // ── Evren dilimleme (timeout koruması) ──────────────────────────────────
    const all = [...BIST_SYMBOLS]
    const partRaw = request.nextUrl.searchParams.get('part')
    const part = partRaw === '1' || partRaw === '2' ? partRaw : null
    let symbols = all
    if (part) {
      const half = Math.ceil(all.length / 2)
      symbols = part === '1' ? all.slice(0, half) : all.slice(half)
    }

    const inflation = await fetchTurkeyInflation()
    const inflationYoy = inflation?.value ?? null

    console.log(
      `[growth-momentum:BIST] ${symbols.length} sembol (part=${part ?? 'tümü'}, ` +
        `TÜFE: ${inflationYoy !== null ? inflationYoy.toFixed(1) + '%' : 'yok'})`,
    )

    const sb = createAdminClient()
    const coverage = await runGrowthMomentum(sb, symbols, 'BIST', {
      inflationYoy,
      batchSize: 8,
      batchDelay: 250,
      merge: part !== null, // bölünmüş koşularda birleştir
    })

    const durationMs = Date.now() - startedAt
    console.log(
      `[growth-momentum:BIST] Tamamlandı: ${coverage.scored}/${coverage.total} skor, ` +
        `${coverage.financial} banka, ${coverage.insufficient} yetersiz, ${durationMs}ms`,
    )

    return NextResponse.json({
      ok: true,
      market: 'BIST',
      part: part ?? 'all',
      inflationYoy,
      ...coverage,
      durationMs,
    })
  } catch (error) {
    console.error('[growth-momentum:BIST] Hata:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
