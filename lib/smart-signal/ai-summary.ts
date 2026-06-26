/**
 * Opsiyonel AI özet katmanı — yalnız POSITIVE/STRONG top-N (bütçe-güvenli).
 *
 * Deterministik `summary` taban; bu katman onu TEK batch Haiku çağrısıyla daha doğal,
 * basit Türkçe ≤20 kelimeye çevirir. news-impact-ai.ts deseni: ai_cache (24s, migration
 * YOK) + checkAndRecordAiBudget + hata/bütçe biterse şablona zarif düşüş.
 */

import Anthropic from '@anthropic-ai/sdk'
import { checkAndRecordAiBudget } from '../ai-budget'
import type { SmartSignalResult } from './types'

const MODEL = 'claude-haiku-4-5-20251001'
export const AI_TOP_N = 20 // günde ≤1 batch çağrı (limit 150'ye geniş marj)

const SYSTEM = `Sen bir BIST yatırım asistanısın. Sana hisseler için kısa sinyal özetleri verilir.
Her özeti DAHA DOĞAL, basit Türkçe, jargon-suz, en fazla 20 kelimelik TEK cümleye çevir. Anlamı koru, abartma, tavsiye verme.
SADECE geçerli JSON dizisi döndür: [{"i":1,"ozet":"..."}]`

interface AiOzet {
  i: number
  ozet?: string
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

async function sbClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) return null
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url, svc)
}

async function getCache(key: string): Promise<AiOzet[] | null> {
  try {
    const sb = await sbClient()
    if (!sb) return null
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    return data?.explanation ? (JSON.parse(data.explanation as string) as AiOzet[]) : null
  } catch {
    return null
  }
}

async function setCache(key: string, v: AiOzet[]): Promise<void> {
  try {
    const sb = await sbClient()
    if (!sb) return
    await sb.from('ai_cache').upsert(
      {
        cache_key: key,
        explanation: JSON.stringify(v),
        version: 1,
        hit_count: 0,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'cache_key' },
    )
  } catch {
    /* cache yazımı kritik değil */
  }
}

function parseArr(text: string): AiOzet[] {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const s = cleaned.indexOf('[')
  const e = cleaned.lastIndexOf(']')
  if (s < 0 || e < 0) return []
  try {
    const arr = JSON.parse(cleaned.slice(s, e + 1))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function callClaude(seeds: string[]): Promise<AiOzet[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []
  const user = `Özetler:\n${seeds.map((s, i) => `${i + 1}. "${s}"`).join('\n')}`
  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    })
    const block = resp.content.find((b) => b.type === 'text')
    return block && 'text' in block ? parseArr(block.text) : []
  } catch {
    return []
  }
}

/**
 * En yüksek skorlu POSITIVE/STRONG sonuçların summary'sini AI ile zenginleştirir (mutasyon).
 * Hata/bütçe/anahtar yoksa deterministik özet kalır.
 */
export async function enrichSummariesWithAI(results: SmartSignalResult[], topN = AI_TOP_N): Promise<number> {
  const top = results
    .filter((r) => r.status === 'POSITIVE' || r.status === 'STRONG')
    .slice(0, topN)
  if (top.length === 0) return 0

  const seeds = top.map((r) => `${r.symbol}: ${r.summary}`)
  const day = new Date().toISOString().slice(0, 10)
  const key = `smart-signal-ai:${day}:${djb2(seeds.join('|'))}`

  let verdicts = await getCache(key)
  if (!verdicts) {
    const budget = await checkAndRecordAiBudget()
    if (!budget.allowed) return 0
    verdicts = await callClaude(seeds)
    if (verdicts.length) setCache(key, verdicts).catch(() => {})
  }
  if (!verdicts.length) return 0

  let applied = 0
  for (const v of verdicts) {
    const idx = (v.i ?? 0) - 1
    if (idx < 0 || idx >= top.length) continue
    if (v.ozet && typeof v.ozet === 'string') {
      const words = v.ozet.trim().split(/\s+/).slice(0, 20).join(' ')
      if (words.length >= 8) top[idx].summary = words
      applied++
    }
  }
  return applied
}
